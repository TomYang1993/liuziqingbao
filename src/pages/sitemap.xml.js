import issues from '../../data/issues.json';
import perm from '../../data/perm.json';
import meta from '../../data/meta.json';

const SITE = 'https://liuzi.win';
const day = (d) => new Date(d).toISOString().slice(0, 10);

export function GET() {
  const urls = [
    { loc: `${SITE}/`, lastmod: day(meta.checked), changefreq: 'daily', priority: '1.0' },
    { loc: `${SITE}/perm`, lastmod: perm.updated, changefreq: 'weekly', priority: '0.8' },
    ...issues.map((i) => ({ loc: `${SITE}/issues/${i.id}`, lastmod: i.timeline.at(-1)?.date ?? day(meta.checked), changefreq: 'weekly', priority: '0.9' })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
