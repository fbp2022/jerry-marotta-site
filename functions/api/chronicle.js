// Public, read-only single Chronicle: /api/chronicle?slug=<slug>.
// js/cms.js uses it to show Chronicles on the GitHub Pages site.
import {json, publicCors} from '../_lib/util.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function onRequestOptions({request}) {
  return new Response(null, {status: 204, headers: publicCors(request)});
}

export async function onRequestGet({request, env}) {
  const cors = publicCors(request);
  const slug = String(new URL(request.url).searchParams.get('slug') || '').toLowerCase();
  if (!SLUG.test(slug)) return json({error: 'Unknown Chronicle'}, 404, cors);
  if (!env.DB) return json({error: 'Content database unavailable'}, 503, cors);

  const row = await env.DB.prepare(
    "SELECT slug, title, summary, body, category, kicker, deck, read_minutes, published_at FROM chronicles WHERE slug = ? AND status = 'published'"
  ).bind(slug).first();
  if (!row) return json({error: 'Unknown Chronicle'}, 404, cors);

  return json({chronicle: row}, 200, {...cors, 'cache-control': 'no-cache'});
}
