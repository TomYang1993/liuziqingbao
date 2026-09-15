// Anonymous egg/flower counters. GET /counts, POST /vote {id, kind}. D1-backed, atomic increments.
const KINDS = ['egg', 'flower', 'banana'];
const MAX_PER_HOUR = 60; // ponytail: per-IP cap in D1; move to Rate Limiting binding if abused

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const { pathname } = new URL(req.url);

    if (req.method === 'GET' && pathname === '/counts') {
      const { results } = await env.DB.prepare('SELECT id, egg, flower, banana FROM votes').all();
      const out = Object.fromEntries(results.map((r) => [r.id, { egg: r.egg, flower: r.flower, banana: r.banana }]));
      return Response.json(out, { headers: cors });
    }

    if (req.method === 'POST' && pathname === '/vote') {
      const body = await req.json().catch(() => ({}));
      const { id, kind } = body;
      if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id) || !KINDS.includes(kind)) {
        return new Response('bad request', { status: 400, headers: cors });
      }
      const ip = req.headers.get('cf-connecting-ip') ?? 'x';
      const key = `${ip}:${Math.floor(Date.now() / 3.6e6)}`;
      const hit = await env.DB.prepare(
        'INSERT INTO hits (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n',
      ).bind(key).first();
      if (hit.n > MAX_PER_HOUR) return new Response('slow down', { status: 429, headers: cors });

      const row = await env.DB.prepare(
        `INSERT INTO votes (id, egg, flower, banana) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ${kind} = ${kind} + 1 RETURNING egg, flower, banana`,
      ).bind(id, ...KINDS.map((k) => (k === kind ? 1 : 0))).first();
      return Response.json(row, { headers: cors });
    }

    if (req.method === 'POST' && pathname === '/feedback') {
      const { text, page } = await req.json().catch(() => ({}));
      if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
        return new Response('bad request', { status: 400, headers: cors });
      }
      const ip = req.headers.get('cf-connecting-ip') ?? 'x';
      const key = `fb:${ip}:${Math.floor(Date.now() / 3.6e6)}`;
      const hit = await env.DB.prepare(
        'INSERT INTO hits (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n',
      ).bind(key).first();
      if (hit.n > 5) return new Response('slow down', { status: 429, headers: cors });
      await env.DB.prepare('INSERT INTO feedback (text, page, ts) VALUES (?, ?, ?)')
        .bind(text.trim(), String(page ?? '').slice(0, 200), new Date().toISOString()).run();
      return Response.json({ ok: true }, { headers: cors });
    }

    return new Response('not found', { status: 404, headers: cors });
  },
};
