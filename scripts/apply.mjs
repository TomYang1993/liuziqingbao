// Merge classifications from stdin: { "<url>": { relevant, topics, doc_type, summary, duplicate_of? } }. Marks each as ai:true.
import { readFile, writeFile } from 'node:fs/promises';
const ITEMS = new URL('../data/items.json', import.meta.url);
const KINDS = ['proposed rule', 'final rule', 'interim final rule', 'policy alert', 'press release', 'executive action', 'court', 'other'];
const TOPICS = ['H-1B', 'H-4', 'F-1', 'OPT', 'STEM OPT', 'CPT', 'PERM', 'I-140', 'Other'];
let input = '';
for await (const c of process.stdin) input += c;
const result = JSON.parse(input);
const items = JSON.parse(await readFile(ITEMS, 'utf8'));
const urls = new Set(items.map((i) => i.url));
let n = 0;
for (const it of items) {
  const r = result[it.url];
  if (!r) continue;
  if (typeof r.relevant !== 'boolean' || !Array.isArray(r.topics) || !r.topics.every((t) => TOPICS.includes(t)) || !KINDS.includes(r.doc_type) || (r.summary != null && typeof r.summary !== 'string') || (r.duplicate_of != null && (!urls.has(r.duplicate_of) || r.duplicate_of === it.url))) {
    console.error(`skip (bad shape): ${it.url}`);
    continue;
  }
  Object.assign(it, { relevant: r.relevant, topics: r.topics, doc_type: r.doc_type, summary: r.summary ?? null, ai: true });
  if (r.duplicate_of) it.duplicate_of = r.duplicate_of;
  n++;
}
await writeFile(ITEMS, JSON.stringify(items, null, 2) + '\n');
console.log(`applied ${n}`);
