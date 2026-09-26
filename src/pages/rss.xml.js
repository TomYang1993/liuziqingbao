import rss from '@astrojs/rss';
import items from '../../data/items.json';
import { feed } from '../lib/feed.mjs';

export function GET(context) {
  return rss({
    title: '北美留子今天还活着',
    description: 'Official US immigration policy updates for H-1B, F-1, OPT, CPT, STEM OPT, PERM, I-140.',
    site: context.site,
    items: feed(items)
      .map((i) => ({
        title: i.title,
        link: i.url,
        pubDate: new Date(i.published),
        description: i.summary ?? i.excerpt ?? '',
        categories: i.topics ?? [],
      })),
  });
}
