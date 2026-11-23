#!/usr/bin/env node
/**
 * Builds docs/growth/free-backlink-targets-1000.csv + FREE_BACKLINK_TARGETS.md
 * Sources: LaunchRanked free-directory extract, research, Gmail-known leads, OpenExam-specific expansions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHRANKED =
  process.env.LAUNCHRANKED_SRC ||
  path.join(
    process.env.USERPROFILE || '',
    '.cursor/projects/c-Users-Jadiss-OneDrive-Bureau-OpenExam/agent-tools/5d03cd11-641b-49f9-9011-532fac28033b.txt'
  );

const byKey = new Map();

function add(row) {
  const domain = String(row.domain || '')
    .toLowerCase()
    .replace(/^www\./, '')
    .trim();
  const key = `${domain}::${String(row.name || '')
    .toLowerCase()
    .trim()}`;
  if (!key || key === '::') return;
  if (byKey.has(key)) return;
  byKey.set(key, {
    priority: 'P2',
    fit: 'general',
    category: 'startup_directory',
    action: 'submit_listing',
    cost: 'free',
    source: 'research',
    notes: '',
    ...row,
    domain,
  });
}

function parseLaunchRanked(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn('LaunchRanked extract missing:', filePath);
    return 0;
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const detailed = lines[i].match(/^- ### (.+)$/);
    if (detailed) {
      const name = detailed[1].trim();
      let domain = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const d = lines[j].trim();
        if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(d)) {
          domain = d.split('/')[0];
          break;
        }
      }
      add({
        name,
        domain,
        category: 'startup_directory',
        action: 'submit_listing',
        priority: 'P2',
        fit: 'general',
        source: 'launchranked',
        notes: 'Free directory listing (verify current free tier before submit)',
      });
      n++;
      continue;
    }
    const compact = lines[i].match(/^- (.+?)\s+([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\s*$/i);
    if (compact) {
      add({
        name: compact[1].trim(),
        domain: compact[2].toLowerCase(),
        category: 'startup_directory',
        action: 'submit_listing',
        priority: 'P2',
        fit: 'general',
        source: 'launchranked',
        notes: 'Free/freemium directory from LaunchRanked free list',
      });
      n++;
    }
  }
  return n;
}

parseLaunchRanked(LAUNCHRANKED);

const curated = [
  {
    name: 'Open Source Europe',
    domain: 'opensourceeurope.org',
    category: 'open_source_org',
    action: 'complete_application',
    priority: 'P0',
    fit: 'high',
    source: 'gmail',
    notes: 'Application already submitted (Gmail). Follow next-step email.',
  },
  {
    name: 'Open Collective',
    domain: 'opencollective.com',
    category: 'funding_directory',
    action: 'claim_profile',
    priority: 'P0',
    fit: 'high',
    source: 'gmail',
    notes: 'Account exists; fiscal host pending. Public profile = backlink.',
  },
  {
    name: 'Ko-fi',
    domain: 'ko-fi.com',
    category: 'funding_directory',
    action: 'optimize_page',
    priority: 'P0',
    fit: 'high',
    source: 'gmail',
    notes: 'Page live: ko-fi.com/openexamhub',
  },
  {
    name: 'Google Search Console',
    domain: 'search.google.com',
    category: 'webmaster',
    action: 'maintain',
    priority: 'P0',
    fit: 'high',
    source: 'gmail',
    notes: 'Property verified for openexamhub.org',
  },
  {
    name: 'Bing Webmaster Tools',
    domain: 'bing.com',
    category: 'webmaster',
    action: 'maintain',
    priority: 'P0',
    fit: 'high',
    source: 'gmail',
    notes: 'Bing outreach already received',
  },
  {
    name: 'LinkedIn Company Page',
    domain: 'linkedin.com',
    category: 'social_profile',
    action: 'publish_articles',
    priority: 'P0',
    fit: 'high',
    source: 'gmail',
    notes: 'Publish free articles + company updates linking to openexamhub.org',
  },
  {
    name: 'X / Twitter profile',
    domain: 'x.com',
    category: 'social_profile',
    action: 'publish_threads',
    priority: 'P1',
    fit: 'high',
    source: 'gmail',
    notes: 'hello@openexamhub.org verified for X',
  },
  {
    name: 'Product Hunt',
    domain: 'producthunt.com',
    category: 'product_launch',
    action: 'launch_product',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Personal maker account; free launch day',
  },
  {
    name: 'AlternativeTo',
    domain: 'alternativeto.net',
    category: 'review_directory',
    action: 'suggest_app',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Suggest as alternative to paid exam prep apps',
  },
  {
    name: 'SaaSHub',
    domain: 'saashub.com',
    category: 'review_directory',
    action: 'submit_product',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Verify with @openexamhub.org email',
  },
  {
    name: 'Indie Hackers',
    domain: 'indiehackers.com',
    category: 'community_article',
    action: 'post_milestone',
    priority: 'P0',
    fit: 'high',
    source: 'gmail+research',
    notes: 'Product page + build-in-public posts',
  },
  {
    name: 'Hacker News Show HN',
    domain: 'news.ycombinator.com',
    category: 'community_post',
    action: 'show_hn',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'One thoughtful Show HN about MIT + official-source planner',
  },
  {
    name: 'Peerlist Launchpad',
    domain: 'peerlist.io',
    category: 'product_launch',
    action: 'launch',
    priority: 'P1',
    fit: 'medium',
    source: 'research',
    notes: 'Weekly Monday launches',
  },
  {
    name: 'Uneed',
    domain: 'uneed.best',
    category: 'product_launch',
    action: 'queue_launch',
    priority: 'P1',
    fit: 'medium',
    source: 'research',
    notes: 'Free queue; avoid paid skip-the-line',
  },
  {
    name: 'DevHunt',
    domain: 'devhunt.org',
    category: 'product_launch',
    action: 'list_free',
    priority: 'P2',
    fit: 'medium',
    source: 'research',
    notes: 'Free listing available',
  },
  {
    name: 'Future Tools',
    domain: 'futuretools.io',
    category: 'ai_directory',
    action: 'submit_tool',
    priority: 'P1',
    fit: 'medium',
    source: 'research',
    notes: 'AI study planner angle',
  },
  {
    name: "There's An AI For That",
    domain: 'theresanaiforthat.com',
    category: 'ai_directory',
    action: 'submit_tool',
    priority: 'P1',
    fit: 'medium',
    source: 'research',
    notes: 'AI for language exam prep',
  },
  {
    name: 'Toolify AI',
    domain: 'toolify.ai',
    category: 'ai_directory',
    action: 'submit_tool',
    priority: 'P2',
    fit: 'medium',
    source: 'research',
    notes: 'AI tools directory',
  },
  {
    name: 'Dang.ai',
    domain: 'dang.ai',
    category: 'ai_directory',
    action: 'submit_tool',
    priority: 'P2',
    fit: 'medium',
    source: 'research',
    notes: 'AI tools directory',
  },
  {
    name: 'Medium',
    domain: 'medium.com',
    category: 'free_article',
    action: 'publish_articles',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Series on TEF/TCF/IELTS free plans; link openexamhub.org',
  },
  {
    name: 'DEV Community',
    domain: 'dev.to',
    category: 'free_article',
    action: 'publish_articles',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Open-source build posts + EdTech',
  },
  {
    name: 'Hashnode',
    domain: 'hashnode.com',
    category: 'free_article',
    action: 'publish_articles',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Own blog; republish guides',
  },
  {
    name: 'Substack',
    domain: 'substack.com',
    category: 'free_article',
    action: 'publish_newsletter',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'Free exam-prep newsletter with CTAs',
  },
  {
    name: 'LinkedIn Articles',
    domain: 'linkedin.com',
    category: 'free_article',
    action: 'publish_articles',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Immigration / language exam guides for professionals',
  },
  {
    name: 'Vocal.media',
    domain: 'vocal.media',
    category: 'free_article',
    action: 'publish_articles',
    priority: 'P2',
    fit: 'medium',
    source: 'research',
    notes: 'Free publishing platform',
  },
  {
    name: 'WordPress.com',
    domain: 'wordpress.com',
    category: 'free_article',
    action: 'publish_blog',
    priority: 'P2',
    fit: 'medium',
    source: 'research',
    notes: 'Free plan blog for exam guides',
  },
  {
    name: 'Hackernoon',
    domain: 'hackernoon.com',
    category: 'guest_article',
    action: 'submit_draft',
    priority: 'P1',
    fit: 'medium',
    source: 'research',
    notes: 'Tech/education writing; editorial review',
  },
  {
    name: 'freeCodeCamp News',
    domain: 'freecodecamp.org',
    category: 'guest_article',
    action: 'pitch_article',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'High-authority contribution if accepted',
  },
  {
    name: 'eLearning Industry',
    domain: 'elearningindustry.com',
    category: 'guest_article',
    action: 'pitch_article',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'EdTech guest posts; strong topical fit',
  },
  {
    name: 'EdSurge',
    domain: 'edsurge.com',
    category: 'guest_article',
    action: 'pitch_op_ed',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'Education journalism pitch',
  },
  {
    name: 'EdTech Current',
    domain: 'edtechcurrent.com',
    category: 'edtech_directory',
    action: 'submit_tool',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'Free tool submission for review consideration',
  },
  {
    name: 'awesome-language-learning (Vuizur)',
    domain: 'github.com',
    category: 'awesome_list_pr',
    action: 'open_pr',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'https://github.com/Vuizur/awesome-language-learning',
  },
  {
    name: 'awesome-language-learning (nachologic)',
    domain: 'github.com',
    category: 'awesome_list_pr',
    action: 'open_pr',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'https://github.com/nachologic/awesome-language-learning',
  },
  {
    name: 'awesome-english (yvoronoy)',
    domain: 'github.com',
    category: 'awesome_list_pr',
    action: 'open_pr',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'https://github.com/yvoronoy/awesome-english',
  },
  {
    name: 'Awesome FSRS',
    domain: 'github.com',
    category: 'awesome_list_pr',
    action: 'open_pr',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'Spaced-repetition angle fits OpenExam planner',
  },
  {
    name: 'SourceForge',
    domain: 'sourceforge.net',
    category: 'open_source_directory',
    action: 'create_project',
    priority: 'P1',
    fit: 'medium',
    source: 'research',
    notes: 'Import from GitHub',
  },
  {
    name: 'Quora',
    domain: 'quora.com',
    category: 'qa_content',
    action: 'answer_questions',
    priority: 'P0',
    fit: 'high',
    source: 'research',
    notes: 'Answer TEF/TCF/IELTS how-tos; link blog guides',
  },
  {
    name: 'Settlement.org Ontario',
    domain: 'settlement.org',
    category: 'resource_list_outreach',
    action: 'suggest_resource',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'Ask to list free official-source exam planner',
  },
  {
    name: 'Moving2Canada',
    domain: 'moving2canada.com',
    category: 'resource_list_outreach',
    action: 'pitch_resource',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'Immigration resource lists',
  },
];

for (const r of curated) add(r);

const redditSubs = [
  ['r/IELTS', 'P0'],
  ['r/TEFCanada', 'P0'],
  ['r/TEFResources', 'P0'],
  ['r/TEFTCF', 'P0'],
  ['r/learnfrench', 'P0'],
  ['r/French', 'P1'],
  ['r/languagelearning', 'P0'],
  ['r/ImmigrationCanada', 'P0'],
  ['r/ExpressEntry', 'P0'],
  ['r/TOEFL', 'P1'],
  ['r/German', 'P1'],
  ['r/Spanish', 'P1'],
  ['r/opensource', 'P1'],
  ['r/SideProject', 'P1'],
  ['r/InternetIsBeautiful', 'P2'],
  ['r/Anki', 'P1'],
  ['r/productivity', 'P2'],
  ['r/webdev', 'P2'],
  ['r/javascript', 'P2'],
  ['r/canada', 'P2'],
];
for (const [sub, priority] of redditSubs) {
  add({
    name: `Reddit ${sub}`,
    domain: 'reddit.com',
    category: 'community_post',
    action: 'helpful_posts',
    priority,
    fit: 'high',
    source: 'research',
    notes: 'Value-first; disclose when promoting; follow sub rules',
  });
}

const articleAngles = [
  ['TEF Canada 30-day free study plan from official sources', 'tef-canada'],
  ['TCF Canada NCLC 7 roadmap without paid courses', 'tcf-canada'],
  ['IELTS 6.5 practice schedule using free official materials', 'ielts'],
  ['TOEFL iBT free official-source study path', 'toefl'],
  ['Goethe-Zertifikat B1 30-day free plan', 'goethe'],
  ['DELE A2-B2 free practice roadmap', 'dele'],
  ['How OpenExam Hub link-checks official exam resources', 'product'],
  ['Why we built an MIT open-source exam planner', 'oss'],
  ['Express Entry language scores: CLB/NCLC mapped to TEF/TCF', 'immigration'],
  ['Spaced repetition (FSRS) for language exam prep', 'srs'],
  ['Free vs paid exam prep: what official boards already publish', 'education'],
  ['Building a calm study planner for immigration applicants', 'ux'],
];
const articlePlatforms = [
  ['Medium', 'medium.com', 'P0'],
  ['DEV.to', 'dev.to', 'P0'],
  ['Hashnode', 'hashnode.com', 'P0'],
  ['LinkedIn Article', 'linkedin.com', 'P0'],
  ['Substack', 'substack.com', 'P1'],
  ['Vocal.media', 'vocal.media', 'P2'],
  ['WordPress.com free blog', 'wordpress.com', 'P2'],
  ['Indie Hackers post', 'indiehackers.com', 'P0'],
  ['eLearning Industry pitch', 'elearningindustry.com', 'P1'],
  ['Hackernoon', 'hackernoon.com', 'P1'],
];
for (const [angle, tag] of articleAngles) {
  for (const [plat, domain, priority] of articlePlatforms) {
    add({
      name: `Article: ${angle} -> ${plat}`,
      domain,
      category: 'free_article_brief',
      action: 'write_and_publish',
      priority,
      fit: 'high',
      source: 'generated',
      notes: `Topic tag=${tag}. Disclose OpenExam Hub; link https://openexamhub.org and matching /exams/* guide. No fake stats.`,
    });
  }
}

const quoraTopics = [
  'How to prepare for TEF Canada for free',
  'Best free TCF Canada resources',
  'IELTS self study plan 30 days',
  'NCLC 7 TEF Canada score requirements',
  'Difference between TCF and TCF Canada',
  'Goethe B1 vs TestDaF which exam',
  'DELE exam free practice materials',
  'Is Duolingo enough for TEF Canada',
  'Official free IELTS practice tests',
  'How long to prepare for TEF Canada from B1',
  'CLB 7 French test options Canada',
  'Best free TOEFL preparation websites',
  'Open source language learning tools',
  'How to make a day by day language exam study plan',
  'TV5Monde and RFI for TCF listening practice',
  'TCF Canada vs TEF Canada which is easier',
  'Free Goethe practice tests online',
  'IRCC accepted French tests list explained',
  'Study plan for IELTS Academic vs General',
  'How to use official sample papers for TEF oral',
];
for (const q of quoraTopics) {
  add({
    name: `Quora: ${q}`,
    domain: 'quora.com',
    category: 'qa_content',
    action: 'answer_with_guide_link',
    priority: 'P1',
    fit: 'high',
    source: 'generated',
    notes: 'Answer fully; soft link to matching OpenExam guide/blog',
  });
}

const facebookGroups = [
  'TEF Canada preparation groups',
  'TCF Canada preparation groups',
  'IELTS Free Preparation groups',
  'Express Entry language test groups',
  'Goethe-Zertifikat study groups',
  'DELE exam preparation groups',
  'Immigration Canada French test groups',
  'Alliance Francaise student groups',
];
for (const g of facebookGroups) {
  add({
    name: `Facebook group: ${g}`,
    domain: 'facebook.com',
    category: 'facebook_group',
    action: 'join_and_share_value',
    priority: 'P1',
    fit: 'high',
    source: 'research',
    notes: 'Find exact group; share free official-source planner; no spam',
  });
}

const moreDirs = [
  ['BetaList', 'betalist.com'],
  ['Launching Next', 'launchingnext.com'],
  ['Startup Buffer', 'startupbuffer.com'],
  ['Microlaunch', 'microlaunch.net'],
  ['SideProjectors', 'sideprojectors.com'],
  ['WIP.co', 'wip.co'],
  ['Console.dev', 'console.dev'],
  ['SaaSWorthy', 'saasworthy.com'],
  ['Crozdesk', 'crozdesk.com'],
  ['SoftwareWorld', 'softwareworld.co'],
  ['Serchen', 'serchen.com'],
  ['StackShare', 'stackshare.io'],
  ['Slant', 'slant.co'],
  ['LibHunt', 'libhunt.com'],
  ['Awesome Open Source', 'awesomeopensource.com'],
  ['Open Source Alternative', 'opensourcealternative.to'],
  ['OpenAlternative', 'openalternative.co'],
  ['GoodFirms', 'goodfirms.co'],
  ['F6S', 'f6s.com'],
  ['EU-Startups', 'eu-startups.com'],
  ['Startup Tracker', 'startuptracker.io'],
  ['TinyLaunch', 'tinylaunch.com'],
  ['ToolFinder', 'toolfinder.co'],
  ['NoCodeList', 'nocodelist.co'],
  ['Alternative.me', 'alternative.me'],
  ['WebCatalog', 'webcatalog.io'],
  ['FOSSHub', 'fosshub.com'],
  ['OER Commons', 'oercommons.org'],
  ['MERLOT', 'merlot.org'],
  ['Class Central', 'classcentral.com'],
  ['Common Sense Education', 'commonsense.org'],
];
for (const [name, domain] of moreDirs) {
  add({
    name,
    domain,
    category: 'startup_directory',
    action: 'submit_listing',
    priority: 'P2',
    fit: 'medium',
    source: 'research',
    notes: 'Confirm free submission still available before spending time',
  });
}

const unis = [
  'University of Toronto language centre resource page',
  'UBC English Language Institute resources',
  'McGill language resources for international students',
  'Concordia language school resources',
  'University of Ottawa French immersion resources',
  'York University ESL resources',
  'SFU language training resources',
  'Universite de Montreal FLE resources',
  'Alliance Francaise Toronto resources',
  'Alliance Francaise Vancouver resources',
  'Alliance Francaise Montreal resources',
  'British Council Greece exam prep resources',
  'British Council Canada exam resources',
  'Goethe-Institut Athens exam resources',
  'Instituto Cervantes Athens resources',
  'Hellenic American Union language exams resources',
  'Campus France language requirements pages',
  'DAAD German exam requirements pages',
  'Sorbonne FLE resources page',
  'Le Wagon alumni language resources (community)',
];
for (const name of unis) {
  add({
    name,
    domain: '',
    category: 'institution_outreach',
    action: 'email_suggest_resource',
    priority: 'P2',
    fit: 'high',
    source: 'generated',
    notes: 'Find public contact; ask to list free official-source planner. Prefer partners@openexamhub.org.',
  });
}

const newsletterPitches = [
  'TLDR Newsletter tip',
  'Hacker Newsletter',
  'JavaScript Weekly',
  'Node Weekly',
  'React Status',
  'Pointer.io',
  'Bytes.dev',
  "Ben's Bites",
  'Class Central newsletter',
  'FluentU blog pitch',
  'I Will Teach You A Language pitch',
  'Canada immigration newsletter pitch',
  'Changelog newsletter pitch',
  'Console newsletter',
  'AlphaSignal',
];
for (const name of newsletterPitches) {
  add({
    name: `Newsletter pitch: ${name}`,
    domain: '',
    category: 'newsletter_pitch',
    action: 'pitch_feature',
    priority: 'P2',
    fit: 'medium',
    source: 'generated',
    notes: 'One-paragraph pitch: free MIT planner built from official exam materials',
  });
}

const profileSites = [
  ['Crunchbase', 'crunchbase.com'],
  ['Wellfound', 'wellfound.com'],
  ['About.me', 'about.me'],
  ['Linktree', 'linktr.ee'],
  ['Peerlist profile', 'peerlist.io'],
  ['Mastodon profile', 'mastodon.social'],
  ['Bluesky profile', 'bsky.app'],
  ['YouTube channel', 'youtube.com'],
  ['TikTok education account', 'tiktok.com'],
  ['Instagram education account', 'instagram.com'],
  ['Pinterest idea pins', 'pinterest.com'],
  ['Flipboard magazine', 'flipboard.com'],
];
for (const [name, domain] of profileSites) {
  add({
    name: `Profile: ${name}`,
    domain,
    category: 'social_profile',
    action: 'create_optimize',
    priority: 'P2',
    fit: 'medium',
    source: 'generated',
    notes: 'Bio + link to https://openexamhub.org',
  });
}

const chatCommunities = [
  ['Discord language learning servers', 'discord.com'],
  ['Discord IELTS study servers', 'discord.com'],
  ['Discord TEF/TCF Canada servers', 'discord.com'],
  ['Telegram TEF Canada channels', 'telegram.org'],
  ['Telegram IELTS prep channels', 'telegram.org'],
];
for (const [name, domain] of chatCommunities) {
  add({
    name,
    domain,
    category: 'chat_community',
    action: 'join_share_value',
    priority: 'P2',
    fit: 'high',
    source: 'research',
    notes: 'Find invites via Reddit; never spam',
  });
}

// Pad to 1000 with explicit research queue slots (to be replaced with verified URLs)
let n = 1;
while (byKey.size < 1000) {
  add({
    name: `Research queue: free education/tool directory #${n}`,
    domain: '',
    category: 'research_queue',
    action: 'discover_and_submit',
    priority: 'P3',
    fit: 'unknown',
    source: 'placeholder',
    notes:
      'Replace with a verified free listing URL (LaunchRanked / Google: submit free education OR language learning tool directory). Do not email until filled.',
  });
  n++;
}

const rows = [...byKey.values()];
const priRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
const fitRank = { high: 0, medium: 1, low: 2, unknown: 3, general: 4 };
rows.sort(
  (a, b) =>
    (priRank[a.priority] ?? 9) - (priRank[b.priority] ?? 9) ||
    (fitRank[a.fit] ?? 9) - (fitRank[b.fit] ?? 9) ||
    a.name.localeCompare(b.name)
);

const final = rows.slice(0, 1000);
while (final.length < 1000) {
  final.push({
    name: `Research backlog slot ${final.length + 1}`,
    domain: '',
    category: 'research_queue',
    action: 'discover_and_submit',
    cost: 'free',
    priority: 'P3',
    fit: 'unknown',
    source: 'placeholder',
    notes: 'Replace with verified free listing URL',
  });
}

function esc(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const header = [
  'id',
  'priority',
  'fit',
  'category',
  'action',
  'name',
  'domain',
  'url_hint',
  'cost',
  'source',
  'status',
  'notes',
];
const csv = [header.join(',')]
  .concat(
    final.map((r, i) =>
      [
        i + 1,
        r.priority,
        r.fit,
        r.category,
        r.action,
        r.name,
        r.domain,
        r.domain ? `https://${r.domain}` : '',
        r.cost || 'free',
        r.source,
        'todo',
        r.notes,
      ]
        .map(esc)
        .join(',')
    )
  )
  .join('\n');

const outDir = path.join(ROOT, 'docs', 'growth');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'free-backlink-targets-1000.csv'), csv);

const counts = {};
const priCounts = {};
for (const r of final) {
  counts[r.category] = (counts[r.category] || 0) + 1;
  priCounts[r.priority] = (priCounts[r.priority] || 0) + 1;
}
const real = final.filter((r) => r.source !== 'placeholder').length;
const placeholders = final.filter((r) => r.source === 'placeholder').length;

const md = [];
md.push('# OpenExam Hub — 1000 free backlink and free-article targets');
md.push('');
md.push('Generated for outreach via Gmail (`elantakidijadiss@gmail.com` / `partners@openexamhub.org`).');
md.push('');
md.push(
  '**Product:** [openexamhub.org](https://openexamhub.org) — free study roadmaps from official exam materials (TEF, TCF, IELTS, TOEFL, Goethe, DELE). MIT OSS.'
);
md.push('');
md.push('## Rules');
md.push('- Free only. Skip paid guest posts and paid directories.');
md.push('- No fake stats, testimonials, or guaranteed-score claims.');
md.push('- Value-first in communities; disclose when promoting.');
md.push('- Prefer language-exam / immigration / EdTech / OSS relevance over spammy general directories.');
md.push('- Replace `research_queue` placeholders with verified URLs before outreach.');
md.push('');
md.push('## Already started (from Gmail)');
md.push('- Open Source Europe application (follow next-step email)');
md.push('- Open Collective account');
md.push('- Ko-fi page');
md.push('- Google Search Console + Bing Webmaster');
md.push('- LinkedIn page setup');
md.push('');
md.push('## Counts');
md.push(`- Total rows: **${final.length}**`);
md.push(`- Named/researched targets: **${real}**`);
md.push(`- Research placeholders still to fill: **${placeholders}**`);
md.push('');
md.push('### By priority');
for (const k of ['P0', 'P1', 'P2', 'P3']) md.push(`- ${k}: ${priCounts[k] || 0}`);
md.push('');
md.push('### By category');
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) md.push(`- ${k}: ${v}`);
md.push('');
md.push('## File');
md.push('- CSV: [`free-backlink-targets-1000.csv`](./free-backlink-targets-1000.csv)');
md.push('');
md.push('## First 30 P0 targets');
final
  .filter((r) => r.priority === 'P0')
  .slice(0, 30)
  .forEach((r, i) => {
    md.push(`${i + 1}. **${r.name}** (${r.domain || 'n/a'}) — ${r.action}`);
  });
md.push('');
md.push('## Next phase');
md.push('1. Fill remaining research placeholders with verified free URLs.');
md.push('2. Draft article pack (EN/FR) for Medium / DEV / LinkedIn / Substack.');
md.push('3. Gmail outreach sequences from `partners@openexamhub.org`.');
md.push('4. Track `status` in the CSV (`todo` → `submitted` → `live`).');

fs.writeFileSync(path.join(outDir, 'FREE_BACKLINK_TARGETS.md'), md.join('\n'));

console.log(
  JSON.stringify(
    {
      total: final.length,
      real,
      placeholders,
      priCounts,
      topCategories: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
      outDir,
    },
    null,
    2
  )
);
