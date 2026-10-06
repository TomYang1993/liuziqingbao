// Collapse items that report the same action from different sources (White House posts a
// proclamation, Federal Register publishes it days later; FR correction notices; a USCIS
// press release for an FR rule flagged via `duplicate_of`). Earliest item wins; the rest
// become `also` links on it. Data is untouched, this is display-only.
const WINDOW_DAYS = 45;
const words = (t) => new Set(t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w.length > 2));
const similar = (a, b) => {
  const A = words(a), B = words(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / (A.size + B.size - inter) >= 0.85; // ponytail: Jaccard on titles, upgrade to classifier-set duplicate_of if it misfires
};

export function feed(items) {
  // unjudged news stays hidden until the classifier has looked at it
  const sorted = items.filter((i) => i.relevant !== false && !(i.kind === 'news' && !i.ai)).sort((a, b) => new Date(a.published) - new Date(b.published));
  const groups = [];
  for (const it of sorted) {
    const t = new Date(it.published);
    const g = groups.find(
      (g) =>
        (it.duplicate_of && g.some((m) => m.url === it.duplicate_of)) ||
        g.some((m) => Math.abs(t - new Date(m.published)) <= WINDOW_DAYS * 864e5 && similar(m.title, it.title)),
    );
    g ? g.push(it) : groups.push([it]);
  }
  return groups
    .map((g) => [g.find((m) => m.kind !== 'news') ?? g[0], ...g.filter((m) => m !== (g.find((x) => x.kind !== 'news') ?? g[0]))]) // official source leads its group
    .map(([head, ...rest]) => ({
      ...head,
      summary: head.summary ?? rest.find((r) => r.summary)?.summary ?? null,
      topics: head.topics?.length ? head.topics : rest.find((r) => r.topics?.length)?.topics ?? [],
      also: rest
        .filter((r, k) => r.kind !== 'news' || (r.source !== head.source && rest.findIndex((x) => x.source === r.source) === k)) // one link per news outlet
        .map(({ source, url, published }) => ({ source, url, published })),
    }))
    .sort((a, b) => new Date(b.published) - new Date(a.published));
}

// self-check: node src/lib/feed.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = feed([
    { url: 'wh', title: 'Enhancing Program Integrity and Integrity and Interagency Coordination in the Administration of the H-1B Nonimmigrant Visa Program', published: '2026-09-18T22:00:00Z', source: 'White House' },
    { url: 'fr', title: 'Enhancing Program Integrity and Interagency Coordination in the Administration of the H-1B Nonimmigrant Visa Program', published: '2026-09-23', source: 'Federal Register', summary: 's' },
    { url: 'old', title: 'Restriction on Entry of Certain Nonimmigrant Workers', published: '2025-09-24', source: 'Federal Register' },
    { url: 'new', title: 'Restriction on Entry of Certain Nonimmigrant Workers', published: '2026-09-18', source: 'White House' },
    { url: 'uscis', title: 'DHS Proposes Additional H-1B Fee', published: '2026-08-24', source: 'USCIS' },
    { url: 'nprm', title: 'Fee for Certain H-1B Petitions', published: '2026-08-25', source: 'Federal Register', duplicate_of: 'uscis' },
    { url: 'corr', title: 'Fee for Certain H-1B Petitions', published: '2026-09-10', source: 'Federal Register' },
    { url: 'raw-news', title: 'Unjudged', published: '2026-09-11', source: 'Reuters', kind: 'news' },
    { url: 'n1', title: 'Judge blocks rule', published: '2026-09-12', source: 'Reuters', kind: 'news', ai: true },
    { url: 'o1', title: 'Court order on rule', published: '2026-09-13', source: 'USCIS', duplicate_of: 'n1' },
  ]);
  const by = Object.fromEntries(out.map((o) => [o.url, o.also.map((a) => a.url)]));
  console.assert(out.length === 5, 'groups', out.length);
  console.assert(!out.some((o) => o.url === 'raw-news'), 'unjudged news hidden');
  console.assert(out.find((o) => o.url === 'o1')?.also.map((a) => a.url).join() === 'n1', 'official leads over news');
  console.assert(by.wh?.join() === 'fr' && by.wh && out.find((o) => o.url === 'wh').summary === 's', 'wh+fr merged, summary inherited');
  console.assert(by.old && by.new, '2025 and 2026 same title stay separate');
  console.assert(by.uscis?.join() === 'nprm,corr', 'duplicate_of + correction chain');
  console.log('ok');
}
