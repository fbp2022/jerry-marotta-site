// Shared helpers for Pages Functions.

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

export function error(status, message) {
  return json({error: message}, status);
}

export async function readJson(request, maxBytes = 512 * 1024) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected JSON');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function cleanText(value, max = 500) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export function newId(prefix) {
  return prefix + '-' + crypto.randomUUID().slice(0, 8);
}

const ALLOWED = {
  p: [], br: [], strong: [], b: [], em: [], i: [], u: [],
  span: ['class'], a: ['href', 'title'], div: ['class'],
  h2: ['class'], h3: ['class'], blockquote: [], ul: [], ol: [], li: []
};
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'svg', 'math', 'template', 'noscript', 'img', 'video', 'audio']);

// Allowlist HTML sanitizer used on every rich-text value before it is stored.
export async function sanitizeHtml(html, maxLength = 200000) {
  const source = String(html ?? '').slice(0, maxLength);
  const rewriter = new HTMLRewriter()
    .onDocument({comments(comment) { comment.remove(); }})
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (DROP.has(tag)) { el.remove(); return; }
        const allowed = ALLOWED[tag];
        if (!allowed) { el.removeAndKeepContent(); return; }
        for (const [name, value] of [...el.attributes]) {
          if (!allowed.includes(name)) { el.removeAttribute(name); continue; }
          if (name === 'href' && !/^(https?:|mailto:|tel:|sms:|\/|#)/i.test(value.trim())) el.removeAttribute(name);
          if (name === 'class' && !/^[\w\s-]*$/.test(value)) el.removeAttribute(name);
        }
        if (tag === 'a' && /^https?:/i.test(el.getAttribute('href') || '')) {
          el.setAttribute('rel', 'noopener noreferrer');
          el.setAttribute('target', '_blank');
        }
      }
    });
  return rewriter.transform(new Response(source, {headers: {'content-type': 'text/html; charset=utf-8'}})).text();
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
}
