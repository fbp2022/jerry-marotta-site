// Serves Chronicles stored in D1 at /chronicles/<slug>/ using the site's own
// article layout. Anything not published in D1 falls through to static files.
import {escapeHtml} from '../_lib/util.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function onRequestGet({request, env, params, next}) {
  const segments = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean);
  if (segments.length !== 1 || !env.DB) return next();

  const slug = String(segments[0]).toLowerCase();
  if (!SLUG.test(slug)) return next();

  let row = null;
  try {
    row = await env.DB.prepare("SELECT * FROM chronicles WHERE slug = ? AND status = 'published'").bind(slug).first();
  } catch {
    return next();
  }
  if (!row) return next();

  const url = new URL(request.url);
  if (!url.pathname.endsWith('/')) return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);

  const template = await env.ASSETS.fetch(new URL('/chronicles/', url));
  if (!template.ok) return next();

  const title = row.title;
  const summary = row.summary || row.deck || '';
  const minutes = row.read_minutes ? row.read_minutes + ' minute read' : '';
  const kicker = row.kicker || ['By Jerry Marotta', row.category].filter(Boolean).join(' • ');

  const articleHtml =
    '<div class="article-kicker">' + escapeHtml(kicker) + '</div>' +
    '<h1>' + escapeHtml(title) + '</h1>' +
    (row.deck ? '<div class="article-deck">' + escapeHtml(row.deck) + '</div>' : '') +
    row.body +
    '<div class="article-end-actions">' +
    '<a class="btn btn-primary" href="/book/">Train With Jerry</a>' +
    '<a class="btn btn-copy" href="/chronicles/">Back to Chronicles</a>' +
    '</div>';

  const rewritten = new HTMLRewriter()
    .on('title', {element(el) { el.setInnerContent(title + ' | Jerry Marotta Aviation'); }})
    .on('meta[name="description"]', {element(el) { if (summary) el.setAttribute('content', summary); }})
    .on('link[rel="canonical"]', {element(el) { el.setAttribute('href', 'https://jerrymarottaaviation.com/chronicles/' + slug + '/'); }})
    .on('section.view', {element(el) { el.setAttribute('class', el.getAttribute('id') === 'view-article' ? 'view active' : 'view'); }})
    .on('#view-article .article-mobile-bar span', {element(el) { el.setInnerContent(minutes); }})
    .on('#view-article .page-hero h1', {element(el) { el.setInnerContent(title); }})
    .on('#view-article .page-hero p', {element(el) { el.setInnerContent(summary); }})
    .on('#view-article article.article', {element(el) { el.setInnerContent(articleHtml, {html: true}); }})
    .transform(template);

  const headers = new Headers(rewritten.headers);
  headers.set('cache-control', 'public, max-age=60');
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(rewritten.body, {status: 200, headers});
}
