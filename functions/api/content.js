// Public, read-only content feed. Returns only published content.
import {json} from '../_lib/util.js';

export async function onRequestGet({env}) {
  if (!env.DB) return json({error: 'Content database unavailable'}, 503);

  const [settings, testimonials, chronicles] = await env.DB.batch([
    env.DB.prepare('SELECT key, value FROM site_settings'),
    env.DB.prepare("SELECT id, reviewer_name, attribution_label, detail, text, rating FROM testimonials WHERE status = 'published' ORDER BY sort_order, created_at"),
    env.DB.prepare("SELECT slug, title, summary, category, deck, read_minutes, published_at FROM chronicles WHERE status = 'published' ORDER BY published_at DESC, updated_at DESC")
  ]);

  const texts = {};
  const facts = {};
  for (const row of settings.results) {
    if (row.key.startsWith('text:')) {
      try { texts[row.key.slice(5)] = JSON.parse(row.value).html; } catch { /* skip malformed rows */ }
    } else if (row.key.startsWith('fact:')) {
      facts[row.key.slice(5)] = row.value;
    }
  }

  return json({
    texts,
    facts,
    testimonials: testimonials.results.map(row => ({
      id: row.id,
      name: row.reviewer_name || 'Flight training client',
      relationship: row.attribution_label,
      detail: row.detail || '',
      text: row.text,
      rating: row.rating
    })),
    chronicles: chronicles.results
  }, 200, {'cache-control': 'public, max-age=30'});
}
