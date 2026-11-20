// Unit tests for the learner-facing agents (diagnostic, coach, practice).
// Mocks the LLM (generateJson) and Firestore (pub()) via the agents' injectable setters, so it
// runs offline with no FIREBASE_SERVICE_ACCOUNT / LLM_BASE_URL.  Run: node scripts/test-learner-agents.mjs
import assert from 'node:assert/strict';
import { setLearnerDeps, BadInput } from '../lib/agents/learnerShared.js';
import { validateDiagnostic, createDiagnostic, scoreDiagnostic } from '../lib/agents/diagnostic.js';
import { coachProgress, validateRebalance, fallbackRebalance } from '../lib/agents/coach.js';
import { validatePractice, generatePractice, DISCLAIMER } from '../lib/agents/practice.js';

// ---------- mocks ----------
function fakeFirestore() {
  const store = new Map();
  const pub = () => ({
    collection: (c) => ({
      doc: (id) => ({
        async get() {
          const k = `${c}/${id}`;
          return { exists: store.has(k), data: () => structuredClone(store.get(k)) };
        },
        async set(data, opts) {
          const k = `${c}/${id}`;
          store.set(k, opts?.merge ? { ...(store.get(k) || {}), ...structuredClone(data) } : structuredClone(data));
        }
      })
    })
  });
  return { store, pub };
}
/** Mimics lib/llm.js: tries each queued reply, runs validate(), retries up to 3 times, else throws. */
function fakeLlm(replies) {
  const calls = [];
  const fn = async ({ agent, validate }) => {
    calls.push(agent);
    let last = 'no reply';
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = replies.shift();
      if (r === undefined) break;
      if (r instanceof Error) throw r;
      const reply = typeof r === 'function' ? r() : r;
      last = validate(reply);
      if (!last) return { data: reply, usage: {}, model: 'mock' };
    }
    throw new Error(`Invalid ${agent} output: ${last}`);
  };
  fn.calls = calls;
  return fn;
}

let passed = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  ✓ ${name}`);
  } catch (e) {
    results.push(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`);
  } finally {
    setLearnerDeps({});
  }
}

// ---------- fixtures ----------
const SKILLS6 = ['listening', 'reading', 'grammar', 'vocabulary', 'writing', 'speaking'];
const BANDS = ['A2', 'B1', 'B2'];
function frenchDiagnostic() {
  const questions = [];
  let n = 0;
  for (const skill of SKILLS6) {
    for (let k = 0; k < 2; k++) {
      const i = n++;
      questions.push({
        id: `x${i}`,
        skill,
        ...(skill === 'listening' ? { transcript: `Bonjour, je suis Marie et je vous appelle pour la réunion de demain. Elle commence à neuf heures dans la salle numéro ${i}, pas à dix heures.` } : {}),
        prompt: `Quelle est la bonne réponse pour la question numéro ${i} dans ce texte ?`,
        options: [`réponse un ${i}`, `réponse deux ${i}`, `réponse trois ${i}`, `réponse quatre ${i}`],
        answerIndex: i % 4,
        explanation: `La bonne réponse est la réponse ${(i % 4) + 1}.`,
        cefr: BANDS[i % 3]
      });
    }
  }
  return { questions };
}

const ROADMAP = {
  id: 'r1', exam: 'TCF', level: 'B1', days: 10, createdAt: '2026-11-01', summary: '',
  phases: [
    { phaseTitle: 'Foundations', focus: 'grammar', tasks: ['Review passé composé', 'Learn 50 travel words', 'Listen to RFI journal en français facile'] },
    { phaseTitle: 'Skills', focus: 'reading', tasks: ['Read 3 TV5Monde articles', 'Write a formal email', 'Practice oral presentation'] },
    { phaseTitle: 'Exam', focus: 'mock', tasks: ['Full mock exam #1', 'Review mistakes', 'Full mock exam #2', 'Relax and revise vocabulary'] }
  ],
  completedTasks: {}
};
const ALL_TASKS = ROADMAP.phases.flatMap((p) => p.tasks);

function frenchPractice(skill, count, salt = '') {
  return {
    items: Array.from({ length: count }, (_, i) => {
      const base = { id: `p${i}`, skill, explanation: `Explication de la réponse numéro ${i}.` };
      if (skill === 'writing' || skill === 'speaking')
        return { ...base, prompt: `Vous écrivez à un ami pour lui raconter vos vacances ${i}${salt}. Écrivez environ 120 mots.`, modelAnswer: 'Cher Paul, je te remercie pour ta lettre. Je suis rentré de vacances la semaine dernière et je voulais te raconter mon séjour dans les Alpes avec ma famille et des amis.', checklist: ['Salutation adaptée', 'Temps du passé', 'Formule de fin'] };
      return {
        ...base,
        ...(skill === 'listening' ? { transcript: 'Attention, le train pour Lyon partira avec vingt minutes de retard. Les voyageurs sont priés de rester sur le quai numéro trois.' } : {}),
        prompt: skill === 'reading'
          ? `Lisez le texte : la mairie organise une fête dans le parc samedi ${i}${salt}, et tous les habitants du quartier sont invités avec leurs enfants. Qui est invité à la fête ?`
          : `Choisissez la bonne réponse pour la phrase ${i}${salt} : je ___ au cinéma hier.`,
        options: ['suis allé', 'vais', 'irai', 'allais'],
        answerIndex: 0
      };
    })
  };
}

// ---------- diagnostic ----------
await test('diagnostic: valid French quiz passes validate', () => {
  assert.equal(validateDiagnostic(frenchDiagnostic(), { exam: 'TCF', level: 'B1' }), null);
});

await test('diagnostic: validate rejects bad items', () => {
  const ctx = { exam: 'TCF', level: 'B1' };
  const mut = (f) => { const d = frenchDiagnostic(); f(d.questions); return validateDiagnostic(d, ctx); };
  assert.match(mut((q) => q.pop()), /exactly 12/);
  assert.match(mut((q) => { q[1].options = q[1].options.slice(0, 3); }), /exactly 4/);
  assert.match(mut((q) => { q[1].answerIndex = 4; }), /answerIndex/);
  assert.match(mut((q) => { q[1].options[2] = q[1].options[0] + ' '; }), /duplicates/);
  assert.match(mut((q) => { q[1].skill = 'cooking'; }), /skill/);
  assert.match(mut((q) => { q[3].skill = 'grammar'; }), /exactly 2 "reading"|exactly 2 "grammar"/);
  assert.match(mut((q) => { q[0].cefr = 'C2'; }), /cefr/);
  assert.match(mut((q) => { delete q[0].transcript; }), /transcript/);
  assert.match(mut((q) => { q[2].prompt = 'What is the correct answer for the question in this text?'; }), /French/);
  assert.match(mut((q) => { q[2].explanation = 'Voir https://example.com'; }), /URL/);
  assert.match(mut((q) => { q[1].id = q[0].id; }), /Duplicate id/);
  assert.match(mut((q) => q.forEach((x) => { x.cefr = 'B1'; })), /at A2|at B2/);
  // German exam with French content is rejected
  assert.match(validateDiagnostic(frenchDiagnostic(), { exam: 'GOETHE', level: 'B1' }), /German/);
});

await test('diagnostic: create caches 3 variants then rotates without LLM', async () => {
  const fs = fakeFirestore();
  const llm = fakeLlm([frenchDiagnostic, frenchDiagnostic, frenchDiagnostic]);
  setLearnerDeps({ generateJson: llm, pub: fs.pub });
  const ids = [];
  for (let i = 0; i < 6; i++) {
    const r = await createDiagnostic({ exam: 'tcf', level: 'b1' });
    assert.equal(r.status, 'ok');
    assert.equal(r.questions.length, 12);
    assert.match(r.notice, /not an official placement test/);
    ids.push(r.quizId);
  }
  assert.equal(llm.calls.length, 3);
  assert.deepEqual(ids.slice(0, 3), ['diagnostic-TCF-B1-v1', 'diagnostic-TCF-B1-v2', 'diagnostic-TCF-B1-v3']);
  assert.deepEqual(ids.slice(3), ['diagnostic-TCF-B1-v1', 'diagnostic-TCF-B1-v2', 'diagnostic-TCF-B1-v3']);
  assert.equal(fs.store.get('practice_sets/diagnostic-TCF-B1').variants.length, 3);
});

await test('diagnostic: LLM failure with empty cache -> status failed', async () => {
  setLearnerDeps({ generateJson: fakeLlm([new Error('LLM HTTP 503')]), pub: fakeFirestore().pub });
  const r = await createDiagnostic({ exam: 'IELTS', level: 'B2' });
  assert.equal(r.status, 'failed');
});

await test('diagnostic: bad input throws BadInput', async () => {
  await assert.rejects(createDiagnostic({ exam: 'TOEFL', level: 'B1' }), BadInput);
  await assert.rejects(createDiagnostic({ exam: 'TCF', level: 'B3' }), BadInput);
  assert.throws(() => scoreDiagnostic({ exam: 'TCF', level: 'B1', answers: [] }), BadInput);
  assert.throws(() => scoreDiagnostic({ exam: 'TCF', level: 'B1', answers: [{ skill: 'reading', correct: 'yes' }] }), BadInput);
});

await test('diagnostic: scoring math and estimatedLevel', () => {
  const a = (skill, correct, cefr) => ({ id: `${skill}${cefr}${correct}`, skill, correct, cefr });
  const answers = [
    a('listening', true, 'A2'), a('listening', false, 'B1'),
    a('reading', true, 'A2'), a('reading', true, 'B1'),
    a('grammar', true, 'A2'), a('grammar', true, 'B2'),
    a('vocabulary', true, 'B1'), a('vocabulary', false, 'B2'),
    a('writing', false, 'A2'), a('writing', true, 'B1'),
    a('speaking', false, 'B2'), a('speaking', false, 'B2')
  ];
  const r = scoreDiagnostic({ exam: 'TCF', level: 'B1', answers });
  assert.deepEqual(r.skillScores, { listening: 0.5, reading: 1, grammar: 1, vocabulary: 0.5, writing: 0.5, speaking: 0 });
  // A2: 3/4 = .75, B1: 3/4 = .75, B2: 1/4 = .25  -> highest band >= 60% is B1
  assert.equal(r.bandScores.A2.ratio, 0.75);
  assert.equal(r.bandScores.B2.ratio, 0.25);
  assert.equal(r.estimatedLevel, 'B1');
  assert.deepEqual(r.weakSkills, ['speaking']);
  assert.ok(r.advice.some((s) => /Priority — speaking/.test(s)));
  assert.match(r.notice, /Self-check only/);

  const all = scoreDiagnostic({ exam: 'TCF', level: 'B1', answers: answers.map((x) => ({ ...x, correct: true })) });
  assert.equal(all.estimatedLevel, 'B2');
  const none = scoreDiagnostic({ exam: 'TCF', level: 'B1', answers: answers.map((x) => ({ ...x, correct: false })) });
  assert.equal(none.estimatedLevel, 'A1'); // one below the lowest tested band
  const a1 = scoreDiagnostic({ exam: 'TCF', level: 'A1', answers: [a('reading', false, 'A1'), a('grammar', false, 'A2')] });
  assert.equal(a1.estimatedLevel, 'pre-A1');
  const noCefr = scoreDiagnostic({ exam: 'TCF', level: 'B1', answers: answers.map(({ cefr, ...x }) => ({ ...x, correct: true })) });
  assert.equal(noCefr.method, 'overall_ratio');
  assert.equal(noCefr.estimatedLevel, 'B2');
});

// ---------- coach ----------
await test('coach: on-track path (no LLM call)', async () => {
  const llm = fakeLlm([]);
  setLearnerDeps({ generateJson: llm, pub: fakeFirestore().pub });
  const rm = { ...ROADMAP, completedTasks: { '0-0': true, '0-1': true, '0-2': true } }; // 3/10 = 30%, expected 30%
  const r = await coachProgress({ roadmap: rm, daysElapsed: 3 });
  assert.equal(r.onTrack, true);
  assert.equal(r.expectedPct, 30);
  assert.equal(r.actualPct, 30);
  assert.deepEqual(r.rebalancedPhases, []);
  assert.equal(llm.calls.length, 0);
  // within tolerance: 2/10 done vs 30% expected (>= 20%) still on track
  const r2 = await coachProgress({ roadmap: { ...ROADMAP, completedTasks: { '0-0': true, '0-1': true } }, daysElapsed: 3 });
  assert.equal(r2.onTrack, true);
});

const behindRoadmap = { ...ROADMAP, completedTasks: { '0-0': true } }; // 10% done, day 6 -> expected 60%
const remainingTasks = ALL_TASKS.slice(1); // 9 tasks, 4 days left
const goodRebalance = () => ({
  summary: 'You can still make it.',
  phases: [
    { phaseTitle: 'Catch up', focus: 'core', days: 2, tasks: ['Learn 50 travel words + Relax and revise vocabulary', 'Listen to RFI journal en français facile', 'Read 3 TV5Monde articles', 'Write a formal email'] },
    { phaseTitle: 'Exam prep', focus: 'mock', days: 2, tasks: ['Full mock exam #1', 'Review mistakes', 'Full mock exam #2'] }
  ],
  dropped: ['Practice oral presentation'],
  tips: ['Study 30 extra minutes per day.']
});

await test('coach: behind path uses validated LLM rebalance', async () => {
  const llm = fakeLlm([goodRebalance]);
  setLearnerDeps({ generateJson: llm, pub: fakeFirestore().pub });
  const r = await coachProgress({ roadmap: behindRoadmap, daysElapsed: 6 });
  assert.equal(r.onTrack, false);
  assert.equal(r.expectedPct, 60);
  assert.equal(r.actualPct, 10);
  assert.equal(r.remainingDays, 4);
  assert.equal(r.source, 'llm');
  assert.deepEqual(llm.calls, ['COACH']);
  assert.equal(r.rebalancedPhases.reduce((s, p) => s + p.days, 0), 4);
  assert.equal(r.rebalancedPhases[0].dayStart, 7);
  assert.equal(r.rebalancedPhases[1].dayEnd, 10);
  assert.ok(!r.rebalancedPhases.flatMap((p) => p.tasks).includes('Review passé composé'));
});

await test('coach: validate rejects invented / completed / over-dropped / wrong days', () => {
  const ctx = { remaining: remainingTasks, completed: ['Review passé composé'], remainingDays: 4 };
  assert.equal(validateRebalance(goodRebalance(), ctx), null);
  const mut = (f) => { const d = goodRebalance(); f(d); return validateRebalance(d, ctx); };
  assert.match(mut((d) => d.phases[0].tasks.push('Watch https://youtube.com/some-video')), /URL|not one of the remaining/);
  assert.match(mut((d) => d.phases[0].tasks.push('Do a Duolingo streak')), /not one of the remaining/);
  assert.match(mut((d) => d.phases[0].tasks.push('Review passé composé')), /already completed/);
  assert.match(mut((d) => { d.phases[1].days = 3; }), /add up to exactly 4/);
  assert.match(mut((d) => { d.dropped.push('Write a formal email'); d.phases[0].tasks.splice(3, 1); }), /At most 1/);
  assert.match(mut((d) => { d.dropped.push('Full mock exam #2'); d.dropped.shift(); d.phases[1].tasks.pop(); d.phases[0].tasks.push('Practice oral presentation'); }), /mock exams/);
  assert.match(mut((d) => { d.phases[1].tasks.pop(); }), /missing/);
  assert.match(mut((d) => d.phases[1].tasks.push('Review mistakes')), /more than once/);
  assert.match(mut((d) => { d.tips = ['See www.example.com']; }), /URLs/);
});

await test('coach: deterministic fallback when LLM keeps failing', async () => {
  const bad = () => ({ summary: 'x', phases: [{ phaseTitle: 'A', focus: '', days: 4, tasks: ['Invented task'] }], dropped: [], tips: [] });
  const llm = fakeLlm([bad, bad, bad]);
  setLearnerDeps({ generateJson: llm, pub: fakeFirestore().pub });
  const r = await coachProgress({ roadmap: behindRoadmap, daysElapsed: 6 });
  assert.equal(r.source, 'fallback');
  assert.equal(r.onTrack, false);
  const tasks = r.rebalancedPhases.flatMap((p) => p.tasks);
  assert.deepEqual(tasks, remainingTasks); // all remaining, original order, nothing invented
  assert.equal(r.rebalancedPhases.reduce((s, p) => s + p.days, 0), 4);
  assert.equal(r.rebalancedPhases.length, 3);
  // even spread: 9 tasks -> 3/3/3, 4 days -> 2/1/1
  assert.deepEqual(r.rebalancedPhases.map((p) => p.tasks.length), [3, 3, 3]);
  assert.deepEqual(r.rebalancedPhases.map((p) => p.days), [2, 1, 1]);
  // pure fallback: more phases than days collapses to remainingDays
  const one = fallbackRebalance(remainingTasks.map((t, i) => ({ task: t, phaseIdx: i, phaseTitle: 'P', focus: '' })), 1, 10);
  assert.equal(one.length, 1);
  assert.equal(one[0].tasks.length, 9);
});

await test('coach: bad input throws BadInput', async () => {
  await assert.rejects(coachProgress({ roadmap: ROADMAP, daysElapsed: 11 }), BadInput);
  await assert.rejects(coachProgress({ roadmap: { ...ROADMAP, days: 0 }, daysElapsed: 0 }), BadInput);
  await assert.rejects(coachProgress({ roadmap: { ...ROADMAP, completedTasks: { foo: true } }, daysElapsed: 1 }), BadInput);
  await assert.rejects(coachProgress({ daysElapsed: 1 }), BadInput);
});

// ---------- practice ----------
await test('practice: validate accepts good sets and rejects bad ones', () => {
  for (const skill of SKILLS6) assert.equal(validatePractice(frenchPractice(skill, 3), { exam: 'TCF', skill, count: 3 }), null, skill);
  const ctx = { exam: 'TCF', skill: 'grammar', count: 3 };
  const mut = (f, skill = 'grammar') => { const d = frenchPractice(skill, 3); f(d.items); return validatePractice(d, { ...ctx, skill }); };
  assert.match(mut((x) => x.pop()), /exactly 3/);
  assert.match(mut((x) => { x[0].options.push('autre'); }), /exactly 4/);
  assert.match(mut((x) => { x[0].options[1] = 'Suis allé.'; }), /duplicates/);
  assert.match(mut((x) => { x[0].answerIndex = -1; }), /answerIndex/);
  assert.match(mut((x) => { x[0].skill = 'reading'; }), /skill must be "grammar"/);
  assert.match(mut((x) => { delete x[0].transcript; }, 'listening'), /transcript/);
  assert.match(mut((x) => { x[0].checklist = ['one']; }, 'writing'), /checklist/);
  assert.match(mut((x) => { x[0].modelAnswer = 'Dear Paul, thank you for the letter. I came back from holiday last week and I wanted to tell you about the trip to the Alps with my family and the friends.'; }, 'writing'), /French/);
  assert.match(mut((x) => { x[1].prompt = x[0].prompt; }), /duplicates another/);
  assert.match(mut((x) => { x[0].explanation = 'Source: www.france-education-international.fr'; }), /URL/);
});

await test('practice: caching rotation (5 live sets, then random cached, no LLM)', async () => {
  const fs = fakeFirestore();
  const replies = Array.from({ length: 5 }, (_, s) => () => frenchPractice('reading', 2, ` s${s}`));
  const llm = fakeLlm(replies);
  let rnd = 0;
  const seq = [0.1, 0.5, 0.95, 0.3];
  setLearnerDeps({ generateJson: llm, pub: fs.pub, random: () => seq[rnd++ % seq.length] });
  const live = [];
  for (let i = 0; i < 5; i++) {
    const r = await generatePractice({ exam: 'TCF', level: 'B1', skill: 'reading', count: 2 });
    assert.equal(r.source, 'live');
    assert.equal(r.disclaimer, DISCLAIMER);
    assert.equal(r.items[0].answer, r.items[0].options[r.items[0].answerIndex]);
    live.push(r.setId);
  }
  assert.equal(new Set(live).size, 5);
  assert.equal(fs.store.get('practice_sets/TCF-B1-reading-2').sets.length, 5);
  const served = [];
  for (let i = 0; i < 4; i++) {
    const r = await generatePractice({ exam: 'TCF', level: 'B1', skill: 'reading', count: 2 });
    assert.equal(r.source, 'cache');
    assert.equal(r.disclaimer, 'Unofficial practice — written by OpenExam Hub, not by the exam board.');
    served.push(r.setId);
  }
  assert.equal(llm.calls.length, 5); // no extra LLM calls once 5 sets exist
  assert.deepEqual(served, ['TCF-B1-reading-2-s1', 'TCF-B1-reading-2-s3', 'TCF-B1-reading-2-s5', 'TCF-B1-reading-2-s2']);
  // a different count is a different key
  setLearnerDeps({ generateJson: fakeLlm([() => frenchPractice('reading', 3)]), pub: fs.pub });
  const other = await generatePractice({ exam: 'TCF', level: 'B1', skill: 'reading', count: 3 });
  assert.equal(other.source, 'live');
});

await test('practice: LLM down -> cached set if any, else failed; open items shape', async () => {
  const fs = fakeFirestore();
  setLearnerDeps({ generateJson: fakeLlm([() => frenchPractice('writing', 1)]), pub: fs.pub });
  const w = await generatePractice({ exam: 'DELF', level: 'B2', skill: 'writing', count: 1 });
  assert.equal(w.items[0].type, 'open');
  assert.ok(w.items[0].modelAnswer && w.items[0].checklist.length >= 3 && w.items[0].answer === w.items[0].modelAnswer);
  setLearnerDeps({ generateJson: fakeLlm([new Error('down')]), pub: fs.pub });
  const c = await generatePractice({ exam: 'DELF', level: 'B2', skill: 'writing', count: 1 });
  assert.equal(c.source, 'cache');
  setLearnerDeps({ generateJson: fakeLlm([new Error('down')]), pub: fs.pub });
  const f = await generatePractice({ exam: 'DELF', level: 'B2', skill: 'speaking', count: 1 });
  assert.equal(f.status, 'failed');
  assert.equal(f.disclaimer, DISCLAIMER);
});

await test('practice: bad input throws BadInput', async () => {
  setLearnerDeps({ generateJson: fakeLlm([]), pub: fakeFirestore().pub });
  await assert.rejects(generatePractice({ exam: 'TCF', level: 'B1', skill: 'reading', count: 11 }), BadInput);
  await assert.rejects(generatePractice({ exam: 'TCF', level: 'B1', skill: 'mock_exam', count: 2 }), BadInput);
  await assert.rejects(generatePractice({ exam: 'XYZ', level: 'B1', skill: 'reading' }), BadInput);
});

// ---------- routes (400 JSON on bad input, CORS) ----------
await test('routes: 400 JSON on bad input, 405 on GET, CORS header set', async () => {
  const mkRes = () => {
    const r = { code: 0, body: null, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.end = () => r;
    return r;
  };
  setLearnerDeps({ generateJson: fakeLlm([]), pub: fakeFirestore().pub });
  for (const name of ['diagnostic', 'coach', 'practice']) {
    const { default: h } = await import(`../api/${name}.js`);
    const bad = mkRes();
    await h({ method: 'POST', body: { action: 'create', exam: 'NOPE', level: 'Z9', roadmap: null } }, bad);
    assert.equal(bad.code, 400, name);
    assert.equal(typeof bad.body.error, 'string');
    assert.equal(bad.headers['Access-Control-Allow-Origin'], '*');
    const get = mkRes();
    await h({ method: 'GET' }, get);
    assert.equal(get.code, 405);
  }
  const { default: d } = await import('../api/diagnostic.js');
  const s = mkRes();
  await d({ method: 'POST', body: JSON.stringify({ action: 'score', exam: 'IELTS', level: 'B2', answers: [{ id: 'q1', skill: 'reading', correct: true, cefr: 'B2' }] }) }, s);
  assert.equal(s.code, 200);
  assert.equal(s.body.estimatedLevel, 'B2');
});

console.log(results.join('\n'));
const total = results.length;
console.log(`\n${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
