// Public, read-only content feed. Returns only published content.
// Read by js/cms.js on jerrymarottaaviation.com (GitHub Pages) and on pages.dev.
import {json, publicCors} from '../_lib/util.js';

export function onRequestOptions({request}) {
  return new Response(null, {status: 204, headers: publicCors(request)});
}

export async function onRequestGet({request, env}) {
  const cors = publicCors(request);
  if (!env.DB) return json({error: 'Content database unavailable'}, 503, cors);

  const [settings, testimonials, chronicles] = await env.DB.batch([
    env.DB.prepare('SELECT key, value FROM site_settings'),
    env.DB.prepare("SELECT id, reviewer_name, attribution_label, detail, text, rating FROM testimonials WHERE status = 'published' ORDER BY sort_order, created_at"),
    env.DB.prepare("SELECT slug, title, summary, category, deck, read_minutes, published_at FROM chronicles WHERE status = 'published' ORDER BY published_at DESC, updated_at DESC")
  ]);

  const texts = {};
  const facts = {};
  const layouts = {};
  for (const row of settings.results) {
    if (row.key.startsWith('text:')) {
      try { texts[row.key.slice(5)] = JSON.parse(row.value).html; } catch { /* skip malformed rows */ }
    } else if (row.key.startsWith('layout:')) {
      try { layouts[row.key.slice(7)] = JSON.parse(row.value); } catch { /* skip malformed rows */ }
    } else if (row.key.startsWith('fact:')) {
      facts[row.key.slice(5)] = row.value;
    }
  }

  return json({
    texts,
    facts,
    layouts,
    testimonials: testimonials.results.map(row => ({
      id: row.id,
      name: row.reviewer_name || 'Flight training client',
      relationship: row.attribution_label,
      detail: row.detail || '',
      text: row.text,
      rating: row.rating
    })),
    chronicles: chronicles.results
  }, 200, {...cors, 'cache-control': 'no-cache'});
}
