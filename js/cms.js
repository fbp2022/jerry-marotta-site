// Public content layer. The static HTML is always the default; saved admin
// edits from /api/content are applied on top when the API is available.
// The admin page reuses JMCMS.collect() so both sides agree on item keys.
(function () {
  'use strict';

  var EDITABLE = 'h1,h2,h3,h4,p,li,blockquote,figcaption,dt,dd,.eyebrow,.section-label,.quote,small,strong,span,em,a.btn,a.contact-action strong,label';
  var LEAF_ONLY = /^(SMALL|STRONG|SPAN|EM|A|LABEL)$/;
  var EXCLUDE = [
    '#view-article', '#booking-form', 'dialog', 'script', 'style', 'svg',
    '[data-testimonial-list]', '[data-yelp-excerpt-list]',
    '[data-review-average]', '[data-review-count]', '[data-review-stars]',
    '[data-yelp-live-rating]', '[data-yelp-live-count]', '[data-yelp-live-updated]', '[data-yelp-live-stars]',
    '#device-flow-heading', '#device-flow-copy', '#form-status', '.booking-progress'
  ].join(',');

  var ORIGINAL_FACTS = {
    flight_hours: '8,500',
    years: '35',
    phone_display: '(865) 724-7251',
    phone_digits: '8657247251',
    email: 'jerry.marotta@hotmail.com'
  };

  var ALLOWED = {
    p: [], br: [], strong: [], b: [], em: [], i: [], u: [],
    span: ['class'], a: ['href', 'title', 'class', 'target', 'rel'], div: ['class'],
    h2: ['class'], h3: ['class'], blockquote: [], ul: [], ol: [], li: []
  };
  var DROP = /^(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|svg|math|template|noscript|img|video|audio)$/;

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  // FNV-1a 32-bit hash of the element's original text, in base 36.
  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('000000' + h.toString(36)).slice(-7);
  }

  function hasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i += 1) {
      var node = el.childNodes[i];
      if (node.nodeType === 3 && normalize(node.nodeValue)) return true;
    }
    return false;
  }

  function hasBlockChild(el) {
    for (var i = 0; i < el.children.length; i += 1) {
      if (/^(DIV|P|H[1-6]|UL|OL|LI|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|FORM|TABLE|FIGURE|BLOCKQUOTE)$/.test(el.children[i].tagName)) return true;
    }
    return false;
  }

  function isCandidate(el) {
    if (el.closest(EXCLUDE)) return false;
    if (!normalize(el.textContent)) return false;
    if (el.matches(EDITABLE)) {
      if (LEAF_ONLY.test(el.tagName) && el.children.length) return false;
      return !hasBlockChild(el);
    }
    return el.tagName === 'DIV' && hasDirectText(el) && !hasBlockChild(el);
  }

  function typeOf(el) {
    var tag = el.tagName;
    if (/^H1$/.test(tag)) return 'Main heading';
    if (/^H[2-4]$/.test(tag)) return 'Heading';
    if (tag === 'LI') return 'List item';
    if (tag === 'A') return 'Button';
    if (tag === 'BLOCKQUOTE' || el.classList.contains('quote')) return 'Quote';
    if (tag === 'P' || tag === 'DIV') return 'Paragraph';
    return 'Label';
  }

  // Returns editable items in document order. Items with identical text
  // (desktop and mobile copies) share a key, so one edit updates both.
  function collect(doc) {
    var items = [];
    var chosen = [];
    var views = doc.querySelectorAll('main section.view');
    Array.prototype.forEach.call(views, function (view) {
      var all = view.querySelectorAll('*');
      Array.prototype.forEach.call(all, function (el) {
        if (!isCandidate(el)) return;
        for (var i = chosen.length - 1; i >= 0; i -= 1) {
          if (chosen[i].contains(el)) return;
        }
        chosen.push(el);
        var text = normalize(el.textContent);
        items.push({el: el, hash: hash(text), view: view.id.replace(/^view-/, ''), type: typeOf(el), text: text, html: el.innerHTML.trim()});
      });
    });
    return items;
  }

  function cleanNode(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) { child.remove(); return; }
      var tag = child.tagName.toLowerCase();
      var allowed = ALLOWED[tag];
      if (!allowed) {
        if (DROP.test(tag)) { child.remove(); return; }
        cleanNode(child);
        child.replaceWith.apply(child, Array.prototype.slice.call(child.childNodes));
        return;
      }
      Array.prototype.slice.call(child.attributes).forEach(function (attr) {
        if (allowed.indexOf(attr.name) < 0) child.removeAttribute(attr.name);
        else if (attr.name === 'href' && !/^(https?:|mailto:|tel:|sms:|\/|#)/i.test(attr.value.trim())) child.removeAttribute('href');
      });
      cleanNode(child);
    });
  }

  function setSafeHtml(el, html) {
    var template = document.createElement('template');
    template.innerHTML = String(html || '');
    cleanNode(template.content);
    el.replaceChildren(template.content);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  }

  function applyFacts(facts) {
    var replacements = [];
    function add(key, pattern) {
      var next = facts[key];
      if (next && next !== ORIGINAL_FACTS[key]) replacements.push({pattern: pattern, value: next});
    }
    add('flight_hours', /8,500/g);
    add('years', /\b35(?=\+|\s+years)/gi);
    add('phone_display', new RegExp(escapeRegExp(ORIGINAL_FACTS.phone_display), 'g'));
    add('email', new RegExp(escapeRegExp(ORIGINAL_FACTS.email), 'gi'));

    if (replacements.length) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentElement && node.parentElement.closest('script,style')) continue;
        var text = node.nodeValue;
        replacements.forEach(function (r) { text = text.replace(r.pattern, r.value); });
        if (text !== node.nodeValue) node.nodeValue = text;
      }
    }

    // The hero altimeter shows flight hours through CSS generated content.
    if (facts.flight_hours && facts.flight_hours !== ORIGINAL_FACTS.flight_hours && /^[\d,]+$/.test(facts.flight_hours)) {
      var style = document.createElement('style');
      style.textContent = ".altimeter::after{content:'" + facts.flight_hours.replace(/,/g, '') + "+'}";
      document.head.appendChild(style);
    }

    var digits = facts.phone_digits && facts.phone_digits.replace(/\D/g, '');
    var email = facts.email;
    document.querySelectorAll('a[href^="sms:"], a[href^="tel:"], a[href^="mailto:"]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (digits && href.indexOf(ORIGINAL_FACTS.phone_digits) >= 0) a.setAttribute('href', href.split(ORIGINAL_FACTS.phone_digits).join(digits));
      if (email && href.toLowerCase().indexOf(ORIGINAL_FACTS.email) >= 0) a.setAttribute('href', 'mailto:' + email);
    });
    window.JM_CONTACT = {phone: digits || ORIGINAL_FACTS.phone_digits, email: email || ORIGINAL_FACTS.email};
  }

  function chronicleCard(item) {
    var card = document.createElement('article');
    card.className = 'story-card';
    var cover = document.createElement('div');
    cover.className = 'story-card-cover';
    var small = document.createElement('small');
    small.textContent = item.category || 'Flight Instructor’s Chronicles';
    var h2 = document.createElement('h2');
    h2.textContent = item.title;
    cover.append(small, h2);
    var body = document.createElement('div');
    body.className = 'story-card-body';
    var p = document.createElement('p');
    p.textContent = item.summary || item.deck || '';
    var actions = document.createElement('div');
    actions.style.marginTop = '22px';
    var link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = '/chronicles/' + item.slug + '/';
    link.textContent = 'Read the Story';
    actions.append(link);
    body.append(p, actions);
    card.append(cover, body);
    return card;
  }

  function applyChronicles(list) {
    if (!Array.isArray(list) || !list.length) return;
    document.querySelectorAll('#view-chronicles .chronicles-grid').forEach(function (grid) {
      grid.querySelectorAll('.story-card').forEach(function (card) { card.remove(); });
      var sidebar = grid.querySelector('.sidebar');
      list.forEach(function (item) { grid.insertBefore(chronicleCard(item), sidebar); });
    });

    // Keep the home page feature pointed at the newest published Chronicle.
    var latest = list[0];
    var home = document.getElementById('view-home');
    if (!home) return;
    var links = home.querySelectorAll('a[href^="/chronicles/"]:not([href="/chronicles/"])');
    if (!links.length) return;
    var oldHref = links[0].getAttribute('href');
    var newHref = '/chronicles/' + latest.slug + '/';
    if (oldHref === newHref) return;
    var oldTitle = null;
    home.querySelectorAll('h2, h3').forEach(function (heading) {
      var container = heading.closest('div, article, section');
      if (!container || !container.querySelector('a[href="' + oldHref + '"]')) return;
      oldTitle = oldTitle || normalize(heading.textContent);
      if (normalize(heading.textContent) !== oldTitle) return;
      heading.textContent = latest.title;
      var summary = heading.nextElementSibling;
      if (summary && summary.tagName === 'P') summary.textContent = latest.summary || latest.deck || '';
      container.querySelectorAll('.quote').forEach(function (quote) { quote.hidden = true; });
    });
    links.forEach(function (a) { if (a.getAttribute('href') === oldHref) a.setAttribute('href', newHref); });
  }

  function markActiveNav() {
    var path = location.pathname;
    document.querySelectorAll('.desktop-nav .nav-btn').forEach(function (a) {
      var href = a.getAttribute('href');
      var active = href === '/' ? path === '/' : path.indexOf(href) === 0;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  var loading = null;
  function load() {
    if (!loading) {
      loading = fetch('/api/content', {headers: {accept: 'application/json'}})
        .then(function (response) {
          if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) return null;
          return response.json();
        })
        .catch(function () { return null; });
    }
    return loading;
  }

  function apply(data) {
    if (!data) return;
    var texts = data.texts || {};
    if (Object.keys(texts).length) {
      collect(document).forEach(function (item) {
        if (Object.prototype.hasOwnProperty.call(texts, item.hash)) setSafeHtml(item.el, texts[item.hash]);
      });
    }
    applyFacts(data.facts || {});
    applyChronicles(data.chronicles);
  }

  window.JMCMS = {collect: collect, hash: hash, normalize: normalize, load: load, originalFacts: ORIGINAL_FACTS};

  if (!document.documentElement.hasAttribute('data-cms-admin')) {
    markActiveNav();
    load().then(apply);
  }
})();
