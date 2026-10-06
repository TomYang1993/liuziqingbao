// Background worker: pull official sources, dedupe against data/items.json,
// classify new items with the local `claude` CLI, write back. No server, no DB.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import Parser from 'rss-parser';

const ITEMS = new URL('../data/items.json', import.meta.url);
const META = new URL('../data/meta.json', import.meta.url);
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS ?? 14);
const CLASSIFIER = process.env.CLASSIFIER ?? 'cli'; // cli | none
const cutoff = Date.now() - LOOKBACK_DAYS * 86400e3;
const RELEVANT = /H-?1B|H-?4|OPT\b|CPT\b|F-?1\b|STEM|practical training|specialty occupation|prevailing wage|labor condition|LCA\b|student visa|nonimmigrant|work authorization|EAD\b|grace period|cap-subject|registration|SEVP|SEVIS|DSO\b|student|PERM\b|I-140|labor certification|EB-?[123]\b|immigrant petition|priority date|visa bulletin/i;

const rss = new Parser({ headers: { 'User-Agent': 'Mozilla/5.0 liuziqingbao' }, customFields: { item: ['source'] } });

// News: Google News searches built around events (lawsuits, rulings), kept only from these outlets.
// Edit freely; matched as a case-insensitive substring of the outlet name Google reports.
const NEWS_OUTLETS = ['Reuters', 'Associated Press', 'AP News', 'Bloomberg', 'Inside Higher Ed', 'Forbes', 'NAFSA', "Presidents' Alliance", 'The PIE', 'Times Higher Education', 'Chronicle of Higher Education', 'Higher Ed Dive', 'University World News', 'New York Times', 'Wall Street Journal', 'Washington Post', 'Politico', 'Axios', 'CNBC', 'NPR', 'Law360', 'The Hill', 'Fortune', 'Semafor', 'Fragomen', 'Ogletree', 'Littler', 'Association of American Universities', 'Boundless', 'National Law Review', 'Jurist', 'Newsweek', 'Boston Globe', 'Mealey', 'American Bazaar'];
const NEWS_BLOCK = ['TV18']; // regional syndication that rides on an allowlisted name
const EVENT = '(lawsuit OR sue OR sued OR court OR judge OR injunction OR ruling OR blocks)';
const NEWS_QUERIES = [
  `(CPT OR "curricular practical training") ${EVENT}`,
  `("optional practical training" OR "OPT program" OR "STEM OPT") (${EVENT.slice(1, -1)} OR fee OR rule)`,
  `"duration of status" ${EVENT}`,
  `H-1B ${EVENT}`,
  `H-1B ("grace period" OR fee OR proclamation OR layoffs)`,
  `(PERM OR "labor certification" OR "prevailing wage") (rule OR ${EVENT.slice(1, -1)})`,
  `("international students" OR "F-1 visa") ${EVENT}`,
];

const sources = [
  {
    name: 'USCIS',
    fetch: async () => (await rss.parseURL('https://www.uscis.gov/news/rss-feed/59144')).items.map(rssItem),
  },
  {
    name: 'White House',
    fetch: async () => (await rss.parseURL('https://www.whitehouse.gov/presidential-actions/feed/')).items.map(rssItem),
  },
  {
    name: 'Federal Register',
    fetch: async () => {
      const out = [];
      // DOL (ETA) has no RSS and blocks scrapers; the Federal Register is its official channel.
      const queries = [
        ...['"H-1B"', '"optional practical training"', '"F-1 nonimmigrant"', '"permanent labor certification"', '"I-140"'].map((t) => `conditions[term]=${encodeURIComponent(t)}`),
        ...['"prevailing wage"', 'PERM'].map((t) => `conditions[agencies][]=employment-and-training-administration&conditions[term]=${encodeURIComponent(t)}`),
      ];
      for (const q of queries) {
        const u = `https://www.federalregister.gov/api/v1/documents.json?${q}&order=newest&per_page=100`;
        const { results } = await (await fetch(u)).json();
        for (const r of results) out.push({ title: r.title, url: r.html_url, published: r.publication_date, excerpt: r.abstract ?? '', doc_type: r.type });
      }
      return out;
    },
  },
  {
    name: 'News',
    fetch: async () => {
      const out = [];
      for (const q of NEWS_QUERIES) {
        const u = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=en-US&gl=US&ceid=US:en`;
        for (const i of (await rss.parseURL(u)).items) {
          const outlet = typeof i.source === 'string' ? i.source : i.source?._ ?? '';
          const o = outlet.toLowerCase();
          const name = NEWS_OUTLETS.find((n) => o.includes(n.toLowerCase()));
          if (!name || NEWS_BLOCK.some((b) => o.includes(b.toLowerCase()))) continue;
          out.push({ ...rssItem(i), title: i.title.replace(/\s+-\s+[^-]+$/, ''), excerpt: '', source: name, kind: 'news' });
        }
      }
      return out;
    },
  },
  {
    name: 'ICE',
    fetch: async () => (await rss.parseURL('https://www.ice.gov/rss/news/all')).items.map(rssItem),
  },
  {
    name: 'Study in the States',
    fetch: async () => (await rss.parseURL('https://studyinthestates.dhs.gov/rss.xml')).items.map(rssItem),
  },
  {
    // SEVP blog for DSOs/students. No feed; scrape listing pages until older than cutoff.
    name: 'Study in the States',
    fetch: async () => {
      const out = [];
      for (let page = 0; page < 20; page++) {
        const html = await (await fetch(`https://studyinthestates.dhs.gov/blog?page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0 liuziqingbao' } })).text();
        const re = /<a href="(\/20\d\d\/\d\d\/[^"]+)"[^>]*>(?!Read More)([^<]{10,})<\/a>[\s\S]{0,500}?<time datetime="([^"]+)"/g;
        let m, found = 0, oldest = Date.now();
        while ((m = re.exec(html))) {
          out.push({ title: decode(m[2]), url: `https://studyinthestates.dhs.gov${m[1]}`, published: m[3], excerpt: '' });
          oldest = Math.min(oldest, new Date(m[3]));
          found++;
        }
        if (!found || oldest < cutoff) break;
      }
      return out;
    },
  },
];

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').trim();

function rssItem(i) {
  return { title: i.title, url: i.link, published: i.isoDate ?? i.pubDate, excerpt: (i.contentSnippet ?? '').slice(0, 800) };
}

function run(cmd, args, input) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (c) => (c ? rej(new Error(`${cmd} exit ${c}`)) : res(out)));
    p.stdin.end(input);
  });
}

// One claude call per batch. Returns { [url]: { relevant, topics, doc_type, summary } }.
async function classify(batch) {
  if (CLASSIFIER === 'none' || batch.length === 0) return {};
  const prompt = `You classify US immigration news for international students and H-1B workers.
For each item below return a JSON object keyed by "url" with:
  relevant: boolean (true only if it affects H-1B, H-4, F-1, OPT, CPT, STEM OPT holders or applicants, or employment-based green card applicants via PERM / I-140)
  topics: array from ["H-1B","H-4","F-1","OPT","STEM OPT","CPT","PERM","I-140","Other"]
  doc_type: one of "proposed rule","final rule","policy alert","press release","executive action","court","other"
  summary: 1-2 plain-English sentences: what changed and who is affected. No advice.
Items with kind "news" are press coverage, not official documents: relevant only if they report a new concrete event (lawsuit filed, court ruling or injunction, agency action, official announcement). Opinion, explainers, campus reactions and personal stories are not relevant.
Output ONLY the JSON object, no prose, no code fences.

ITEMS:
${JSON.stringify(batch.map(({ url, title, excerpt, source, kind }) => ({ url, title, source, excerpt, kind })), null, 1)}`;
  const raw = await run('claude', ['-p', '--model', 'haiku', '--output-format', 'json'], prompt);
  const text = JSON.parse(raw).result;
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

const existing = JSON.parse(await readFile(ITEMS, 'utf8'));
const seen = new Set(existing.map((i) => i.url));
const fresh = [];

for (const s of sources) {
  try {
    for (const it of await s.fetch()) {
      if (seen.has(it.url) || new Date(it.published) < cutoff) continue;
      if ((!it.kind && !RELEVANT.test(`${it.title} ${it.excerpt}`)) || /H-2A|H-2B|CW-1/.test(it.title)) continue;
      seen.add(it.url);
      fresh.push({ ...it, source: it.source ?? s.name, first_seen: new Date().toISOString() });
    }
  } catch (e) {
    console.error(`[${s.name}] ${e.message}`);
  }
}
// items published raw by an earlier run (no classifier available) get classified now
const backfill = CLASSIFIER === 'none' ? [] : existing.filter((i) => !i.ai && i.relevant !== false).slice(0, 30);
const todo = [...fresh, ...backfill];
console.log(`${fresh.length} new candidate(s), ${backfill.length} to backfill, classifier=${CLASSIFIER}`);

for (let i = 0; i < todo.length; i += 15) {
  const batch = todo.slice(i, i + 15);
  let result = {};
  try {
    result = await classify(batch);
  } catch (e) {
    console.error(`classify failed, publishing raw: ${e.message}`); // ponytail: AI never blocks publish
  }
  for (const it of batch) Object.assign(it, { relevant: true, topics: [], summary: null, ai: false }, result[it.url] && { ...result[it.url], ai: true });
}

const all = [...fresh, ...existing].sort((a, b) => new Date(b.published) - new Date(a.published));
await writeFile(ITEMS, JSON.stringify(all, null, 2) + '\n');
await writeFile(META, JSON.stringify({ checked: new Date().toISOString(), classifier: CLASSIFIER }, null, 2) + '\n');
console.log(`${fresh.filter((i) => i.relevant).length} relevant, ${all.length} total`);
