import rss from '@astrojs/rss';
import items from '../../data/items.json';

export function GET(context) {
  return rss({
    title: '留子情报 · liuziqingbao',
    description: 'Official US immigration policy updates for H-1B, F-1, OPT, CPT, STEM OPT.',
    site: context.site,
    items: items
      .filter((i) => i.relevant !== false)
      .map((i) => ({
        title: i.title,
        link: i.url,
        pubDate: new Date(i.published),
        description: i.summary ?? i.excerpt ?? '',
        categories: i.topics ?? [],
      })),
  });
}
