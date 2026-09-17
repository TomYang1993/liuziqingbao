// Print items not yet classified, as JSON, for a human or agent to classify.
import { readFile } from 'node:fs/promises';
const items = JSON.parse(await readFile(new URL('../data/items.json', import.meta.url), 'utf8'));
const pending = items.filter((i) => !i.ai && i.relevant !== false).map(({ url, title, source, excerpt, doc_type }) => ({ url, title, source, excerpt, doc_type }));
console.log(JSON.stringify(pending, null, 1));
