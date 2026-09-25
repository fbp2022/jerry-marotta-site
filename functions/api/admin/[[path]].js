// Admin API. Every request is verified against Cloudflare Access before any
// database work happens. Writes are same-origin JSON only and are audited.
import {verifyAccess} from '../../_lib/access.js';
import {json, error, readJson, HttpError, cleanText, newId, sanitizeHtml} from '../../_lib/util.js';

const STATUSES = new Set(['draft', 'published']);
const FACT_KEYS = new Set(['flight_hours', 'years', 'phone_display', 'phone_digits', 'email']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function onRequest({request, env, params}) {
  const auth = await verifyAccess(request, env).catch(() => ({ok: false, reason: 'verification_error'}));
  if (!auth.ok) {
    return auth.reason === 'not_configured'
      ? error(503, 'Secure sign-in is not configured yet.')
      : error(401, 'Please sign in again.');
  }
  if (!env.DB) return error(503, 'Content database unavailable');

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (!origin || new URL(origin).host !== new URL(request.url).host) return error(403, 'Cross-origin request blocked');
  }

  const segments = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  try {
    return await route(request.method, segments, request, env, auth.email);
  } catch (err) {
    if (err instanceof HttpError) return error(err.status, err.message);
    if (/UNIQUE/i.test(String(err && err.message))) return error(409, 'That web address (slug) is already used by another Chronicle.');
    console.error(err);
    return error(500, 'Something went wrong while saving. Please try again.');
  }
}

async function route(method, [resource, id], request, env, email) {
  const db = env.DB;

  if (method === 'GET' && (!resource || resource === 'me')) return json({email});

  if (method === 'GET' && resource === 'content') {
    const [settings, testimonials, chronicles, audit] = await db.batch([
      db.prepare('SELECT key, value, updated_at FROM site_settings ORDER BY key'),
      db.prepare('SELECT * FROM testimonials ORDER BY sort_order, created_at'),
      db.prepare('SELECT * FROM chronicles ORDER BY COALESCE(published_at, updated_at) DESC'),
      db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100')
    ]);
    return json({
      email,
      settings: settings.results,
      testimonials: testimonials.results,
      chronicles: chronicles.results,
      audit: audit.results
    });
  }

  if (method === 'GET' && resource === 'audit') {
    const rows = await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500').all();
    return json({audit: rows.results});
  }

  if (method === 'PUT' && resource === 'settings') {
    const body = await readJson(request);
    const changes = Array.isArray(body.changes) ? body.changes.slice(0, 500) : [];
    if (!changes.length) throw new HttpError(400, 'Nothing to save');
    const statements = [];
    for (const change of changes) {
      const key = String(change.key || '');
      if (change.value === null) {
        assertSettingKey(key);
        statements.push(db.prepare('DELETE FROM site_settings WHERE key = ?').bind(key));
        continue;
      }
      const value = await settingValue(key, change.value);
      statements.push(db.prepare(
        'INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
      ).bind(key, value));
    }
    statements.push(auditStatement(db, email, 'update', 'settings', null, changes.length + ' page text or fact change(s)'));
    await db.batch(statements);
    return json({ok: true, saved: changes.length});
  }

  if (resource === 'testimonials') {
    if (method === 'POST' && !id) {
      const data = testimonialFrom(await readJson(request));
      const newIdValue = newId('testimonial');
      await db.batch([
        db.prepare(
          'INSERT INTO testimonials (id, reviewer_name, attribution_label, detail, text, rating, status, sort_order, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM testimonials), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
        ).bind(newIdValue, data.reviewer_name, data.attribution_label, data.detail, data.text, data.rating, data.status),
        auditStatement(db, email, 'create', 'testimonial', newIdValue, describeTestimonial(data))
      ]);
      return json({testimonial: await db.prepare('SELECT * FROM testimonials WHERE id = ?').bind(newIdValue).first()}, 201);
    }
    if (method === 'PUT' && id) {
      const data = testimonialFrom(await readJson(request));
      const result = await db.prepare(
        'UPDATE testimonials SET reviewer_name = ?, attribution_label = ?, detail = ?, text = ?, rating = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(data.reviewer_name, data.attribution_label, data.detail, data.text, data.rating, data.status, id).run();
      if (!result.meta.changes) throw new HttpError(404, 'Testimonial not found');
      await auditStatement(db, email, 'update', 'testimonial', id, describeTestimonial(data)).run();
      return json({testimonial: await db.prepare('SELECT * FROM testimonials WHERE id = ?').bind(id).first()});
    }
    if (method === 'DELETE' && id) {
      const existing = await db.prepare('SELECT * FROM testimonials WHERE id = ?').bind(id).first();
      if (!existing) throw new HttpError(404, 'Testimonial not found');
      await db.batch([
        db.prepare('DELETE FROM testimonials WHERE id = ?').bind(id),
        auditStatement(db, email, 'delete', 'testimonial', id, describeTestimonial(existing))
      ]);
      return json({ok: true});
    }
  }

  if (method === 'PUT' && resource === 'testimonials-order') {
    const body = await readJson(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
    if (!ids.length) throw new HttpError(400, 'No order supplied');
    const statements = ids.map((value, index) => db.prepare('UPDATE testimonials SET sort_order = ? WHERE id = ?').bind(index + 1, value));
    statements.push(auditStatement(db, email, 'reorder', 'testimonial', null, 'Changed testimonial order'));
    await db.batch(statements);
    return json({ok: true});
  }

  if (resource === 'chronicles') {
    if (method === 'POST' && !id) {
      const data = await chronicleFrom(await readJson(request));
      const newIdValue = newId('chronicle');
      await db.batch([
        db.prepare(
          'INSERT INTO chronicles (id, slug, title, summary, body, status, published_at, category, kicker, deck, read_minutes, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
        ).bind(newIdValue, data.slug, data.title, data.summary, data.body, data.status, data.published_at, data.category, data.kicker, data.deck, data.read_minutes),
        auditStatement(db, email, 'create', 'chronicle', newIdValue, data.title + ' (' + data.status + ')')
      ]);
      return json({chronicle: await db.prepare('SELECT * FROM chronicles WHERE id = ?').bind(newIdValue).first()}, 201);
    }
    if (method === 'PUT' && id) {
      const data = await chronicleFrom(await readJson(request));
      const result = await db.prepare(
        'UPDATE chronicles SET slug = ?, title = ?, summary = ?, body = ?, status = ?, published_at = ?, category = ?, kicker = ?, deck = ?, read_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(data.slug, data.title, data.summary, data.body, data.status, data.published_at, data.category, data.kicker, data.deck, data.read_minutes, id).run();
      if (!result.meta.changes) throw new HttpError(404, 'Chronicle not found');
      await auditStatement(db, email, 'update', 'chronicle', id, data.title + ' (' + data.status + ')').run();
      return json({chronicle: await db.prepare('SELECT * FROM chronicles WHERE id = ?').bind(id).first()});
    }
    if (method === 'DELETE' && id) {
      const existing = await db.prepare('SELECT id, title FROM chronicles WHERE id = ?').bind(id).first();
      if (!existing) throw new HttpError(404, 'Chronicle not found');
      await db.batch([
        db.prepare('DELETE FROM chronicles WHERE id = ?').bind(id),
        auditStatement(db, email, 'delete', 'chronicle', id, existing.title)
      ]);
      return json({ok: true});
    }
  }

  throw new HttpError(404, 'Unknown admin endpoint');
}

function assertSettingKey(key) {
  if (/^text:[a-z0-9]{4,16}$/.test(key)) return 'text';
  if (key.startsWith('fact:') && FACT_KEYS.has(key.slice(5))) return 'fact';
  throw new HttpError(400, 'Unknown setting: ' + key.slice(0, 40));
}

async function settingValue(key, raw) {
  const kind = assertSettingKey(key);
  if (kind === 'fact') {
    const value = cleanText(raw, 120);
    if (!value) throw new HttpError(400, 'Facts cannot be blank');
    return value;
  }
  const html = await sanitizeHtml(raw && raw.html, 20000);
  if (!html.trim()) throw new HttpError(400, 'Page text cannot be blank');
  return JSON.stringify({
    html,
    view: cleanText(raw.view, 40),
    original: cleanText(raw.original, 20000)
  });
}

function testimonialFrom(body) {
  const text = cleanText(body.text, 10000);
  if (!text) throw new HttpError(400, 'Testimonial text is required');
  const hasRating = body.rating !== null && body.rating !== undefined && body.rating !== '';
  const rating = hasRating ? Number(body.rating) : null;
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating must be 1 to 5 stars, or no rating');
  return {
    reviewer_name: cleanText(body.reviewer_name, 120) || null,
    attribution_label: cleanText(body.attribution_label, 160) || 'Student testimonial',
    detail: cleanText(body.detail, 160) || null,
    text,
    rating,
    status: STATUSES.has(body.status) ? body.status : 'draft'
  };
}

async function chronicleFrom(body) {
  const title = cleanText(body.title, 200);
  if (!title) throw new HttpError(400, 'A title is required');
  const slug = cleanText(body.slug, 100).toLowerCase();
  if (!SLUG.test(slug)) throw new HttpError(400, 'The web address may only use lowercase letters, numbers, and single dashes');
  const html = await sanitizeHtml(body.body, 200000);
  if (!html.replace(/<[^>]*>/g, '').trim()) throw new HttpError(400, 'The story body is empty');
  const status = STATUSES.has(body.status) ? body.status : 'draft';
  let publishedAt = cleanText(body.published_at, 10);
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) throw new HttpError(400, 'Publish date must be YYYY-MM-DD');
  if (status === 'published' && !publishedAt) publishedAt = new Date().toISOString().slice(0, 10);
  const minutes = body.read_minutes === '' || body.read_minutes == null ? null : Number(body.read_minutes);
  if (minutes !== null && !(Number.isInteger(minutes) && minutes > 0 && minutes <= 240)) throw new HttpError(400, 'Reading time must be a whole number of minutes');
  return {
    slug,
    title,
    summary: cleanText(body.summary, 1000) || null,
    body: html,
    status,
    published_at: publishedAt || null,
    category: cleanText(body.category, 80) || null,
    kicker: cleanText(body.kicker, 200) || null,
    deck: cleanText(body.deck, 400) || null,
    read_minutes: minutes
  };
}

function describeTestimonial(data) {
  return (data.reviewer_name || data.attribution_label || 'Testimonial') + ' (' + data.status + ')';
}

function auditStatement(db, email, action, entity, entityId, summary) {
  return db.prepare('INSERT INTO audit_log (email, action, entity, entity_id, summary) VALUES (?, ?, ?, ?, ?)')
    .bind(email, action, entity, entityId, cleanText(summary, 300));
}
