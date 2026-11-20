#!/usr/bin/env node
/**
 * Mock OpenAI-compatible LLM gateway for local end-to-end tests (stands in for OmniRoute).
 *
 *   POST /v1/chat/completions   -> plausible, schema-valid JSON for each agent
 *   GET  /v1/models             -> a tiny model list
 *   GET  /__calls               -> [{agent, model, at}] every completion request seen (for assertions)
 *   POST /__control             -> {fail?: [AGENT...], invalidOnce?: [AGENT...], reset?: true}
 *                                  fail: answer HTTP 503 for those agents (tests fallbacks)
 *                                  invalidOnce: next reply for that agent is invalid JSON shape (tests retries)
 *
 * The agent is read from response_format.json_schema.name ("<agent>_output", set by lib/llm.js),
 * falling back to keywords in the system prompt.
 *
 * Usage: node scripts/mock-llm.mjs [port]   (default 4010; also MOCK_LLM_PORT)
 *        LLM_BASE_URL=http://127.0.0.1:4010/v1 LLM_API_KEY=test-key
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] || process.env.MOCK_LLM_PORT || 4010);
const EXPECTED_KEY = process.env.MOCK_LLM_KEY || 'test-key';
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const state = { calls: [], fail: new Set(), invalidOnce: new Set() };

// ------------------------------------------------------------------ agent detection
function detectAgent(body) {
  const name = body?.response_format?.json_schema?.name;
  if (typeof name === 'string' && /_output$/.test(name)) return name.replace(/_output$/, '').toUpperCase();
  const sys = String(body?.messages?.find((m) => m.role === 'system')?.content || '');
  if (/Discovery agent/i.test(sys)) return 'DISCOVERY';
  if (/Pathfinding planner/i.test(sys)) return 'PLANNER';
  if (/extract exam format facts/i.test(sys)) return 'FORMAT';
  if (/placement self-check/i.test(sys)) return 'DIAGNOSTIC';
  if (/study coach/i.test(sys)) return 'COACH';
  if (/practice items/i.test(sys)) return 'PRACTICE';
  if (/add a new language certification exam/i.test(sys)) return 'EXPANSION';
  return 'UNKNOWN';
}

const sysOf = (b) => String(b.messages.find((m) => m.role === 'system')?.content || '');
// The first user message is the agent prompt; later ones are retry feedback.
const promptOf = (b) => String(b.messages.find((m) => m.role === 'user')?.content || '');
const langOf = (sys) => (/\(German\)|in German/.test(sys) ? 'de' : /\(English\)|in English/.test(sys) ? 'en' : 'fr');

// ------------------------------------------------------------------ DISCOVERY
const DISCOVERY = {
  DELF: [
    { title: 'DELF tout public (official page)', url: 'https://www.france-education-international.fr/diplome/delf-tout-public', category: 'Official exam info', skills: ['exam_format', 'mock_exam'], levels: [] },
    { title: 'TV5Monde Apprendre le français', url: 'https://apprendre.tv5monde.com/fr', category: 'Listening & reading', skills: ['listening', 'reading', 'grammar'], levels: [] },
    { title: 'RFI Français facile', url: 'https://francaisfacile.rfi.fr/fr/', category: 'Oral comprehension', skills: ['listening', 'vocabulary'], levels: [] },
    { title: 'France Éducation international', url: 'https://www.france-education-international.fr/', category: 'Exam board', skills: ['exam_format'], levels: [] },
    // Deliberately bad candidates: the pipeline must drop these.
    { title: 'Random blog', url: 'https://www.example-blog.com/delf-tips', category: 'Blog', skills: ['reading'], levels: [] },
    { title: 'Broken official link', url: 'https://www.france-education-international.fr/this-page-does-not-exist-openexam-e2e', category: 'Broken', skills: ['reading'], levels: [] }
  ],
  DEFAULT: [
    { title: 'TV5Monde Apprendre le français', url: 'https://apprendre.tv5monde.com/fr', category: 'Listening & reading', skills: ['listening', 'reading'], levels: [] },
    { title: 'DW Learn German', url: 'https://learngerman.dw.com', category: 'Listening', skills: ['listening', 'grammar'], levels: [] },
    { title: 'British Council TakeIELTS', url: 'https://takeielts.britishcouncil.org', category: 'Practice tests', skills: ['mock_exam', 'reading'], levels: [] }
  ]
};
function discovery(b) {
  const p = promptOf(b);
  const exam = (/Exam:\s*([A-Z0-9_-]+)/.exec(p) || [])[1] || '';
  const excluded = new Set([...p.matchAll(/^- (\S+)$/gm)].map((m) => m[1]));
  return { candidates: (DISCOVERY[exam] || DISCOVERY.DEFAULT).filter((c) => !excluded.has(c.url)) };
}

// ------------------------------------------------------------------ PLANNER
function planner(b) {
  const p = promptOf(b);
  const days = Number((/Total days:\s*(\d+)/.exec(p) || [])[1] || 30);
  const exam = (/Exam:\s*(\S+)/.exec(p) || [])[1] || 'exam';
  const level = (/Target level:\s*(\S+)/.exec(p) || [])[1] || '';
  const nRes = new Set([...p.matchAll(/\[R(\d+)\]/g)].map((m) => m[1])).size || 1;
  const n = Math.max(Math.min(3, days), Math.min(4, days));
  const per = Math.floor(days / n);
  const ref = (i) => `[R${(i % nRes) + 1}]`;
  const phases = Array.from({ length: n }, (_, i) => {
    const startDay = i * per + 1;
    const endDay = i === n - 1 ? days : (i + 1) * per;
    return {
      phaseTitle: ['Foundations', 'Skill building', 'Exam technique', 'Mock exams and review'][i] || `Phase ${i + 1}`,
      focus: ['Diagnose gaps and build core grammar', 'Listening and reading every day', 'Timed writing and speaking', 'Full mock exams'][i] || 'Review',
      startDay,
      endDay,
      tasks: [
        `Work through one unit of ${ref(i)} and note new vocabulary.`,
        `Do a 20-minute listening session with ${ref(i + 1)}.`,
        i === 0 ? 'Read the official overview at https://www.example.com/overview and summarise it.' : `Review your error log from ${ref(i + 2)} [R99].`
      ]
    };
  });
  return { summary: `A ${days}-day ${exam} ${level} plan built only from the verified resources.`, phases };
}

// ------------------------------------------------------------------ FORMAT (grounded in the page text)
const SECTION_NAMES = [
  'Compréhension orale', 'Compréhension écrite', 'Expression écrite', 'Expression orale', 'Maîtrise des structures de la langue',
  "Compréhension de l'oral", 'Compréhension des écrits', 'Production écrite', 'Production orale',
  'Listening', 'Reading', 'Writing', 'Speaking',
  'Hören', 'Lesen', 'Schreiben', 'Sprechen'
];
function format(b) {
  const p = promptOf(b);
  const text = (/<<<\n([\s\S]*)\n>>>/.exec(p) || [])[1] || '';
  const low = text.toLowerCase();
  const sections = SECTION_NAMES.filter((n) => low.includes(n.toLowerCase())).slice(0, 6).map((name) => ({
    name,
    durationMinutes: null,
    questionCount: null,
    description: `${name} section as described on the official page.`
  }));
  return { sections, scoring: null, notes: sections.length ? 'Extracted by the mock gateway from the fetched page text.' : null };
}

// ------------------------------------------------------------------ DIAGNOSTIC
const BANK = {
  fr: {
    listening: [
      { transcript: 'Bonjour à tous, le train pour Lyon partira avec vingt minutes de retard à cause des travaux sur la voie. Nous vous prions de nous excuser pour la gêne.', prompt: 'Pourquoi est-ce que le train pour Lyon est en retard ?', options: ['À cause des travaux sur la voie', 'À cause de la neige', 'À cause d\u2019une grève', 'À cause d\u2019un accident'], answerIndex: 0 },
      { transcript: 'Salut Marie, c\u2019est Paul. Je ne peux pas venir au cinéma ce soir, je dois finir un dossier pour le travail. On peut y aller samedi si tu veux ?', prompt: 'Que propose Paul dans son message à Marie ?', options: ['D\u2019aller au cinéma ce soir', 'D\u2019aller au cinéma samedi', 'De finir le dossier avec elle', 'De dîner chez elle'], answerIndex: 1 }
    ],
    reading: [
      { prompt: 'Lisez le texte : « La bibliothèque municipale sera fermée du 1er au 15 août pour des travaux. Les livres peuvent être rendus dans la boîte extérieure. » Que peut-on faire pendant la fermeture ?', options: ['Emprunter des livres', 'Rendre des livres dans la boîte', 'Assister à un atelier', 'Utiliser les ordinateurs'], answerIndex: 1 },
      { prompt: 'Lisez le texte : « Pour réduire les déchets, la ville distribue gratuitement des composteurs aux habitants qui en font la demande. » Que fait la ville pour les habitants ?', options: ['Elle vend des composteurs', 'Elle ferme les déchetteries', 'Elle donne des composteurs', 'Elle augmente les impôts'], answerIndex: 2 }
    ],
    grammar: [
      { prompt: 'Complétez la phrase : « Il faut que vous ___ à l\u2019heure demain matin. »', options: ['êtes', 'soyez', 'serez', 'étiez'], answerIndex: 1 },
      { prompt: 'Complétez la phrase : « Si j\u2019avais le temps, je ___ plus souvent ma famille. »', options: ['vois', 'verrai', 'verrais', 'voyais'], answerIndex: 2 }
    ],
    vocabulary: [
      { prompt: 'Dans la phrase « Elle a décroché un nouvel emploi », que veut dire le mot « décroché » ?', options: ['perdu', 'obtenu', 'refusé', 'quitté'], answerIndex: 1 },
      { prompt: 'Quel mot complète le mieux la phrase : « Il fait très ___ aujourd\u2019hui, prends ton manteau. » ?', options: ['froid', 'chaud', 'sec', 'doux'], answerIndex: 0 }
    ],
    writing: [
      { prompt: 'Vous écrivez un courriel formel à votre propriétaire. Quelle formule de politesse est la plus adaptée pour terminer le message ?', options: ['À plus !', 'Je vous prie d\u2019agréer mes salutations distinguées.', 'Bisous', 'Salut et bonne journée'], answerIndex: 1 },
      { prompt: 'Dans un texte argumentatif, quel connecteur introduit une opposition entre deux idées ?', options: ['De plus', 'Cependant', 'Donc', 'Ensuite'], answerIndex: 1 }
    ],
    speaking: [
      { prompt: 'Un collègue vous demande : « Tu peux m\u2019aider avec ce rapport ? » Quelle réponse est la plus naturelle pour accepter ?', options: ['Oui, bien sûr, je regarde ça tout de suite.', 'Non merci, je n\u2019ai pas faim.', 'Il est trois heures.', 'Je suis né à Paris.'], answerIndex: 0 },
      { prompt: 'Vous êtes dans un magasin et vous voulez essayer une veste. Que dites-vous au vendeur ?', options: ['Je peux essayer cette veste, s\u2019il vous plaît ?', 'Vous avez l\u2019heure ?', 'Je voudrais un café.', 'Où est la gare ?'], answerIndex: 0 }
    ]
  },
  de: {
    listening: [
      { transcript: 'Achtung, liebe Fahrgäste. Der Zug nach Berlin fährt heute nicht von Gleis drei, sondern von Gleis sieben ab. Wir bitten um Ihr Verständnis.', prompt: 'Von welchem Gleis fährt der Zug nach Berlin heute ab?', options: ['Von Gleis drei', 'Von Gleis sieben', 'Von Gleis eins', 'Von Gleis zehn'], answerIndex: 1 },
      { transcript: 'Hallo Anna, hier ist Tom. Ich kann heute leider nicht zum Sport kommen, weil ich krank bin. Wollen wir uns am Freitag treffen?', prompt: 'Warum kann Tom heute nicht zum Sport kommen?', options: ['Weil er arbeiten muss', 'Weil er krank ist', 'Weil er keine Zeit hat', 'Weil es regnet'], answerIndex: 1 }
    ],
    reading: [
      { prompt: 'Lesen Sie den Text: „Die Stadtbibliothek ist im August wegen Renovierung geschlossen. Bücher können Sie in den Briefkasten am Eingang werfen.“ Was kann man im August tun?', options: ['Bücher ausleihen', 'Bücher in den Briefkasten werfen', 'Einen Kurs besuchen', 'Im Lesesaal lernen'], answerIndex: 1 },
      { prompt: 'Lesen Sie den Text: „Ab Montag gibt es in der Kantine jeden Tag ein vegetarisches Gericht.“ Was ist neu in der Kantine?', options: ['Es gibt kein Essen mehr', 'Es gibt jeden Tag ein vegetarisches Gericht', 'Die Kantine ist geschlossen', 'Das Essen ist kostenlos'], answerIndex: 1 }
    ],
    grammar: [
      { prompt: 'Ergänzen Sie den Satz: „Ich weiß nicht, ob er morgen ___.“', options: ['kommt', 'kommen', 'kam', 'gekommen'], answerIndex: 0 },
      { prompt: 'Ergänzen Sie den Satz: „Wenn ich mehr Zeit hätte, ___ ich mehr lesen.“', options: ['werde', 'würde', 'wurde', 'wird'], answerIndex: 1 }
    ],
    vocabulary: [
      { prompt: 'Was bedeutet das Wort „pünktlich“ in dem Satz „Der Bus ist heute pünktlich“?', options: ['zu spät', 'zur richtigen Zeit', 'sehr voll', 'kaputt'], answerIndex: 1 },
      { prompt: 'Welches Wort passt in den Satz: „Es ist kalt, zieh bitte deine ___ an.“?', options: ['Jacke', 'Sonnenbrille', 'Badehose', 'Sandalen'], answerIndex: 0 }
    ],
    writing: [
      { prompt: 'Sie schreiben eine formelle E-Mail an Ihren Vermieter. Welcher Schluss ist am besten für die E-Mail?', options: ['Tschüss!', 'Mit freundlichen Grüßen', 'Bis bald, Küsschen', 'Hau rein'], answerIndex: 1 },
      { prompt: 'Welches Wort leitet in einem Text einen Gegensatz zwischen zwei Ideen ein?', options: ['Außerdem', 'Jedoch', 'Deshalb', 'Danach'], answerIndex: 1 }
    ],
    speaking: [
      { prompt: 'Eine Kollegin fragt Sie: „Kannst du mir mit dem Bericht helfen?“ Was ist die natürlichste Antwort, wenn Sie helfen wollen?', options: ['Ja, klar, ich schaue es mir gleich an.', 'Nein danke, ich habe keinen Hunger.', 'Es ist drei Uhr.', 'Ich wohne in Köln.'], answerIndex: 0 },
      { prompt: 'Sie sind in einem Geschäft und möchten eine Jacke anprobieren. Was sagen Sie zu dem Verkäufer?', options: ['Kann ich die Jacke anprobieren?', 'Wie spät ist es?', 'Ich möchte einen Kaffee.', 'Wo ist der Bahnhof?'], answerIndex: 0 }
    ]
  },
  en: {
    listening: [
      { transcript: 'Good morning, passengers. The train to Manchester will now leave from platform seven instead of platform three. We apologise for the change and thank you for your patience.', prompt: 'Which platform does the train to Manchester leave from now?', options: ['Platform three', 'Platform seven', 'Platform one', 'Platform ten'], answerIndex: 1 },
      { transcript: 'Hi Sarah, it is Mark. I am sorry but I cannot come to the meeting this afternoon because my car broke down. Can we move it to Thursday?', prompt: 'What does Mark ask Sarah to do with the meeting?', options: ['Cancel it completely', 'Move it to Thursday', 'Hold it at his house', 'Start it earlier'], answerIndex: 1 }
    ],
    reading: [
      { prompt: 'Read the text: "The city library will be closed in August for repairs. You can return books through the box by the front door." What can you do in August?', options: ['Borrow new books', 'Return books through the box', 'Attend a workshop', 'Use the computers'], answerIndex: 1 },
      { prompt: 'Read the text: "From Monday the canteen will offer a vegetarian dish every day." What is new in the canteen?', options: ['It will close on Mondays', 'There is a vegetarian dish every day', 'All the food is free', 'It opens earlier'], answerIndex: 1 }
    ],
    grammar: [
      { prompt: 'Choose the word that completes the sentence: "If I had more time, I ___ travel more."', options: ['will', 'would', 'am', 'did'], answerIndex: 1 },
      { prompt: 'Choose the correct form to complete the sentence: "She has lived here ___ 2015."', options: ['for', 'since', 'during', 'from'], answerIndex: 1 }
    ],
    vocabulary: [
      { prompt: 'What does the word "reluctant" mean in the sentence "He was reluctant to leave"?', options: ['eager', 'unwilling', 'unable', 'proud'], answerIndex: 1 },
      { prompt: 'Which word best completes the sentence: "It is freezing, so you should wear a ___."', options: ['coat', 'swimsuit', 'pair of sandals', 'sun hat'], answerIndex: 0 }
    ],
    writing: [
      { prompt: 'You are writing a formal email to your landlord. Which closing is the most appropriate for this email?', options: ['Cheers mate', 'Yours sincerely', 'Love you', 'Later'], answerIndex: 1 },
      { prompt: 'In an essay, which linking word introduces a contrast between two ideas in the text?', options: ['Moreover', 'However', 'Therefore', 'Then'], answerIndex: 1 }
    ],
    speaking: [
      { prompt: 'A colleague asks you: "Can you help me with this report?" What is the most natural reply if you want to help?', options: ['Sure, I will have a look right now.', 'No thanks, I am not hungry.', 'It is three o\u2019clock.', 'I was born in London.'], answerIndex: 0 },
      { prompt: 'You are in a shop and you want to try on a jacket. What do you say to the shop assistant?', options: ['Could I try this jacket on, please?', 'What time is it?', 'I would like a coffee.', 'Where is the station?'], answerIndex: 0 }
    ]
  }
};
const SKILL_ORDER = ['listening', 'reading', 'grammar', 'vocabulary', 'writing', 'speaking'];
function diagnostic(b) {
  const sys = sysOf(b);
  const lang = langOf(sys);
  const at = (/Calibrate around CEFR (A1|A2|B1|B2|C1|C2)/.exec(sys) || [])[1] || 'B1';
  const i = LEVELS.indexOf(at);
  const below = LEVELS[i - 1] || at;
  const above = LEVELS[i + 1] || at;
  // 6 at, 3 below, 3 above (clipped bands collapse onto `at`).
  const bands = [below, at, at, above, at, below, above, at, at, below, above, at];
  const questions = [];
  let k = 0;
  for (const skill of SKILL_ORDER) {
    for (const q of BANK[lang][skill]) {
      questions.push({
        id: `m${k + 1}`,
        skill,
        ...(q.transcript ? { transcript: q.transcript } : {}),
        prompt: q.prompt,
        options: q.options,
        answerIndex: q.answerIndex,
        explanation: lang === 'fr' ? 'La bonne réponse est celle qui correspond au sens de la phrase.' : lang === 'de' ? 'Die richtige Antwort passt zum Sinn des Satzes.' : 'The correct answer fits the meaning of the sentence.',
        cefr: bands[k]
      });
      k++;
    }
  }
  return { questions };
}

// ------------------------------------------------------------------ COACH
function coach(b) {
  const p = JSON.parse(promptOf(b));
  const tasks = p.remainingTasks.map((t) => t.task);
  const days = p.remainingDays;
  const k = Math.max(1, Math.min(3, days, tasks.length));
  const split = (n, parts) => Array.from({ length: parts }, (_, i) => Math.floor(n / parts) + (i < n % parts ? 1 : 0));
  const tc = split(tasks.length, k);
  const dc = split(days, k);
  let ti = 0;
  const phases = tc.map((c, i) => {
    const chunk = tasks.slice(ti, ti + c);
    ti += c;
    return { phaseTitle: `Catch-up block ${i + 1}`, focus: 'Finish the remaining tasks in order', days: dc[i], tasks: chunk };
  });
  return {
    summary: 'You can still finish on time if you study a little every day.',
    phases,
    dropped: [],
    tips: ['Study at the same time every day.', 'Start with the hardest task while you are fresh.']
  };
}

// ------------------------------------------------------------------ PRACTICE
const PRACTICE_TEXT = {
  fr: {
    reading: (i) => `Lisez le texte suivant : « La mairie organise le samedi ${i + 2} une journée de nettoyage du parc. Les habitants qui veulent participer doivent s\u2019inscrire avant jeudi à l\u2019accueil. » Que doivent faire les habitants qui veulent participer ?`,
    grammar: (i) => `Complétez la phrase numéro ${i + 1} : « Je voudrais que tu ___ avec nous ce soir. »`,
    vocabulary: (i) => `Question ${i + 1} : dans la phrase « Il a raté son train », que veut dire le mot « raté » ?`,
    listening: (i) => `Question ${i + 1} : que doit faire la personne qui écoute ce message ?`,
    transcript: (i) => `Bonjour, c\u2019est le cabinet du docteur Martin. Votre rendez-vous du jour ${i + 3} est annulé. Merci de nous rappeler pour choisir une nouvelle date et une nouvelle heure.`,
    writing: (i) => `Tâche ${i + 1} : vous écrivez un courriel à un ami pour lui raconter votre dernier week-end et lui proposer une sortie. Écrivez environ cent vingt mots.`,
    speaking: (i) => `Sujet ${i + 1} : présentez une ville que vous aimez et expliquez pourquoi vous voulez y retourner.`,
    model: 'Salut Julien, je te raconte mon week-end : samedi je suis allé au marché avec ma sœur et le soir nous avons vu un film au cinéma. Dimanche, il a fait beau et nous avons fait une longue promenade. Est-ce que tu veux venir avec nous le week-end prochain ?',
    checklist: ['La tâche est complète', 'Le registre est adapté', 'Les temps du passé sont corrects', 'Le texte est bien organisé'],
    mcq: { reading: ['S\u2019inscrire avant jeudi', 'Venir dimanche', 'Payer une inscription', 'Apporter un repas'], grammar: ['viens', 'viennes', 'viendras', 'venais'], vocabulary: ['manqué', 'pris', 'acheté', 'conduit'], listening: ['Rappeler le cabinet', 'Venir demain', 'Envoyer un courriel', 'Ne rien faire'] },
    expl: 'La bonne réponse correspond au sens du texte.'
  },
  de: {
    reading: (i) => `Lesen Sie den Text: „Die Stadt organisiert am Samstag, den ${i + 2}. Mai, einen Putztag im Park. Wer mitmachen möchte, muss sich bis Donnerstag im Rathaus anmelden.“ Was müssen die Leute tun, die mitmachen wollen?`,
    grammar: (i) => `Ergänzen Sie den Satz Nummer ${i + 1}: „Ich hoffe, dass du heute Abend mit uns ___.“`,
    vocabulary: (i) => `Frage ${i + 1}: Was bedeutet das Wort „verpasst“ in dem Satz „Er hat den Zug verpasst“?`,
    listening: (i) => `Frage ${i + 1}: Was soll die Person tun, die diese Nachricht hört?`,
    transcript: (i) => `Guten Tag, hier ist die Praxis von Doktor Weber. Ihr Termin am ${i + 3}. Juni fällt leider aus. Bitte rufen Sie uns zurück, damit wir einen neuen Termin finden.`,
    writing: (i) => `Aufgabe ${i + 1}: Sie schreiben eine E-Mail an einen Freund und erzählen von Ihrem Wochenende. Schreiben Sie etwa hundert Wörter.`,
    speaking: (i) => `Thema ${i + 1}: Stellen Sie eine Stadt vor, die Sie mögen, und erklären Sie, warum.`,
    model: 'Hallo Jonas, ich erzähle dir von meinem Wochenende: Am Samstag war ich mit meiner Schwester auf dem Markt und am Abend sind wir ins Kino gegangen. Am Sonntag war das Wetter schön und wir sind lange spazieren gegangen. Willst du nächstes Wochenende mitkommen?',
    checklist: ['Die Aufgabe ist vollständig', 'Der Ton ist passend', 'Die Zeitformen sind richtig', 'Der Text ist gut gegliedert'],
    mcq: { reading: ['Sich bis Donnerstag anmelden', 'Am Sonntag kommen', 'Geld bezahlen', 'Essen mitbringen'], grammar: ['kommst', 'kommen', 'kam', 'gekommen'], vocabulary: ['nicht erreicht', 'genommen', 'gekauft', 'gefahren'], listening: ['Die Praxis zurückrufen', 'Morgen kommen', 'Eine E-Mail schreiben', 'Nichts tun'] },
    expl: 'Die richtige Antwort passt zum Sinn des Textes.'
  },
  en: {
    reading: (i) => `Read the text: "The council is organising a park clean-up day on Saturday the ${i + 2}th. Residents who want to take part must sign up at the town hall before Thursday." What must residents do if they want to take part?`,
    grammar: (i) => `Item ${i + 1}: choose the word that completes the sentence: "I wish you ___ here with us tonight."`,
    vocabulary: (i) => `Item ${i + 1}: what does the word "missed" mean in the sentence "He missed the train"?`,
    listening: (i) => `Item ${i + 1}: what should the person who hears this message do?`,
    transcript: (i) => `Hello, this is the surgery of Doctor Smith calling. Your appointment on the ${i + 3}th of June has been cancelled. Please call us back so that we can find a new date and time.`,
    writing: (i) => `Task ${i + 1}: you are writing an email to a friend to tell them about your weekend and to invite them out. Write about one hundred and twenty words.`,
    speaking: (i) => `Topic ${i + 1}: describe a city that you like and explain why you would like to go back there.`,
    model: 'Hi Jamie, I wanted to tell you about my weekend. On Saturday I went to the market with my sister and in the evening we saw a film at the cinema. On Sunday the weather was lovely so we went for a long walk. Would you like to come with us next weekend?',
    checklist: ['The task is complete', 'The register is appropriate', 'Past tenses are correct', 'The text is well organised'],
    mcq: { reading: ['Sign up before Thursday', 'Come on Sunday', 'Pay a fee', 'Bring lunch'], grammar: ['were', 'are', 'will be', 'be'], vocabulary: ['did not catch', 'took', 'bought', 'drove'], listening: ['Call the surgery back', 'Come tomorrow', 'Send an email', 'Do nothing'] },
    expl: 'The correct answer matches the meaning of the text.'
  }
};
function practice(b) {
  const sys = sysOf(b);
  const p = promptOf(b);
  const m = /Write exactly (\d+) (\w+) items/.exec(p) || [];
  const count = Number(m[1] || 5);
  const skill = m[2] || 'reading';
  const L = PRACTICE_TEXT[langOf(sys)];
  const items = Array.from({ length: count }, (_, i) => {
    const base = { id: `p${i + 1}`, skill, explanation: L.expl };
    if (skill === 'writing' || skill === 'speaking') return { ...base, prompt: L[skill](i), modelAnswer: L.model, checklist: L.checklist };
    return {
      ...base,
      ...(skill === 'listening' ? { transcript: L.transcript(i) } : {}),
      prompt: L[skill](i),
      options: L.mcq[skill],
      answerIndex: 0
    };
  });
  return { items };
}

// ------------------------------------------------------------------ EXPANSION
function expansion(b) {
  return {
    resources: [
      { title: 'France Éducation international (exam board)', url: 'https://www.france-education-international.fr/', category: 'Exam board', skills: ['exam_format'], levels: ['B1', 'B2'] },
      { title: 'RFI Français facile', url: 'https://francaisfacile.rfi.fr/fr/', category: 'Listening', skills: ['listening'] },
      { title: 'TV5MONDE', url: 'https://www.tv5monde.com/', category: 'Listening', skills: ['listening', 'vocabulary'] },
      { title: 'RFI', url: 'https://www.rfi.fr/fr/', category: 'News in French', skills: ['reading', 'listening'] },
      { title: 'Unofficial prep site', url: 'https://www.some-unofficial-prep-site.com/tef', category: 'Prep', skills: ['reading'] },
      { title: 'Broken official page', url: 'https://www.france-education-international.fr/this-page-does-not-exist-openexam-e2e', category: 'Broken', skills: ['reading'] }
    ],
    examBoardDomains: ['lefrancaisdesaffaires.fr', 'france-education-international.fr']
  };
}

const HANDLERS = { DISCOVERY: discovery, PLANNER: planner, FORMAT: format, DIAGNOSTIC: diagnostic, COACH: coach, PRACTICE: practice, EXPANSION: expansion };

// ------------------------------------------------------------------ server
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/__calls') return send(res, 200, state.calls);
  if (url.pathname === '/__control' && req.method === 'POST') {
    const c = raw ? JSON.parse(raw) : {};
    if (c.reset) { state.calls = []; state.fail.clear(); state.invalidOnce.clear(); }
    if (Array.isArray(c.fail)) state.fail = new Set(c.fail);
    if (Array.isArray(c.invalidOnce)) for (const a of c.invalidOnce) state.invalidOnce.add(a);
    return send(res, 200, { ok: true, fail: [...state.fail], invalidOnce: [...state.invalidOnce] });
  }
  if (url.pathname === '/v1/models') return send(res, 200, { object: 'list', data: [{ id: 'auto', object: 'model' }] });
  if (url.pathname !== '/v1/chat/completions' || req.method !== 'POST') return send(res, 404, { error: { message: 'not found' } });

  if ((req.headers.authorization || '') !== `Bearer ${EXPECTED_KEY}`) return send(res, 401, { error: { message: 'bad api key' } });
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: { message: 'invalid JSON' } }); }
  const agent = detectAgent(body);
  const retry = body.messages.filter((m) => m.role === 'user').length > 1;
  state.calls.push({ agent, model: body.model, retry, at: new Date().toISOString() });

  if (state.fail.has(agent)) return send(res, 503, { error: { message: `mock: ${agent} forced to fail` } });
  const h = HANDLERS[agent];
  if (!h) return send(res, 400, { error: { message: `mock: unknown agent ${agent}` } });
  let content;
  if (state.invalidOnce.has(agent)) {
    state.invalidOnce.delete(agent);
    content = '```json\n{"oops": true}\n```';
  } else {
    try {
      content = JSON.stringify(h(body));
    } catch (err) {
      return send(res, 500, { error: { message: `mock handler crashed: ${err.message}` } });
    }
  }
  send(res, 200, {
    id: `chatcmpl-mock-${state.calls.length}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: `mock/${body.model || 'auto'}`,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: Math.ceil(content.length / 4), total_tokens: 100 + Math.ceil(content.length / 4) }
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock LLM gateway on http://127.0.0.1:${PORT}/v1`));
