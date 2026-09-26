// Print items not yet classified, as JSON, for a human or agent to classify.
// --recent: print the last 40 classified items instead, for duplicate checking.
import { readFile } from 'node:fs/promises';
const items = JSON.parse(await readFile(new URL('../data/items.json', import.meta.url), 'utf8'));
const pick = ({ url, title, source, excerpt, doc_type, published }) => ({ url, title, source, excerpt, doc_type, published });
const out = process.argv.includes('--recent')
  ? items.filter((i) => i.ai && i.relevant !== false).slice(0, 40).map(({ url, title, source, published }) => ({ url, title, source, published }))
  : items.filter((i) => !i.ai && i.relevant !== false).map(pick);
console.log(JSON.stringify(out, null, 1));
