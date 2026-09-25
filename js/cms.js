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

  // The site itself is served from GitHub Pages; saved content, the admin
  // and its login live on Cloudflare Pages.
  var CLOUDFLARE_ORIGIN = 'https://jerry-marotta-aviation.pages.dev';
  var ON_CLOUDFLARE = /(^|\.)jerry-marotta-aviation\.pages\.dev$/.test(location.hostname);
  var API_ORIGIN = ON_CLOUDFLARE ? '' : CLOUDFLARE_ORIGIN;
  var ADMIN_URL = CLOUDFLARE_ORIGIN + '/admin/';
  var SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function chronicleUrl(slug) {
    return ON_CLOUDFLARE ? '/chronicles/' + slug + '/' : '/chronicles/?story=' + slug;
  }

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

  // Groups of sections that can be reordered or hidden from the admin's
  // visual editor. Keys come from each section's original text, so they are
  // computed before any saved text is applied.
  var LAYOUT_CONTAINERS = [
    '.desktop-home-only', '.mobile-home-only', '#view-about', '.about-story-grid',
    '.about-page-stats', '.card-grid', '.mobile-service-rail',
    '.desktop-training-list', '.mobile-training-list'
  ];

  function sectionKey(el) {
    var text = normalize(el.textContent).slice(0, 300);
    return hash(el.tagName + '|' + (text || String(el.className)));
  }

  function layoutGroups(doc) {
    var groups = [];
    LAYOUT_CONTAINERS.forEach(function (selector) {
      Array.prototype.forEach.call(doc.querySelectorAll(selector), function (container, index) {
        var view = container.closest('section.view');
        var children = Array.prototype.filter.call(container.children, function (child) {
          return !/^(SCRIPT|STYLE|TEMPLATE)$/.test(child.tagName);
        });
        if (children.length < 2) return;
        groups.push({
          key: hash(selector + '#' + index),
          selector: selector,
          view: view ? view.id.replace(/^view-/, '') : '',
          container: container,
          children: children.map(function (child) { return {key: sectionKey(child), el: child}; })
        });
      });
    });
    return groups;
  }

  function applyLayout(layouts, groups) {
    groups.forEach(function (group) {
      var layout = layouts[group.key];
      if (!layout) return;
      var byKey = {};
      group.children.forEach(function (child) { byKey[child.key] = child.el; });
      var placed = [];
      (layout.order || []).forEach(function (key) {
        if (byKey[key] && placed.indexOf(byKey[key]) < 0) placed.push(byKey[key]);
      });
      group.children.forEach(function (child) { if (placed.indexOf(child.el) < 0) placed.push(child.el); });
      placed.forEach(function (node) { group.container.appendChild(node); });
      (layout.hidden || []).forEach(function (key) { if (byKey[key]) byKey[key].style.display = 'none'; });
    });
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
    link.href = chronicleUrl(item.slug);
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
    // Each part of the desktop feature and the phone card is updated
    // explicitly; the static quote belongs to the original story, so it is
    // hidden when a different story is featured.
    var latest = list[0];
    var home = document.getElementById('view-home');
    if (!home) return;
    var firstLink = home.querySelector('a[href^="/chronicles/"]:not([href="/chronicles/"])');
    if (!firstLink) return;
    var oldSlug = (firstLink.getAttribute('href').match(/\/chronicles\/(?:\?story=)?([a-z0-9-]+)\/?$/) || [])[1];
    if (oldSlug === latest.slug) return;

    var url = chronicleUrl(latest.slug);
    var summary = latest.summary || latest.deck || '';
    var minutes = latest.read_minutes ? latest.read_minutes + ' minute read' : '';

    home.querySelectorAll('.chronicle-feature').forEach(function (feature) {
      var coverTitle = feature.querySelector('.chronicle-cover h2');
      if (coverTitle) coverTitle.textContent = latest.title;
      var meta = feature.querySelector('.meta');
      if (meta) {
        meta.replaceChildren();
        [latest.category, minutes].filter(Boolean).forEach(function (label) {
          meta.append(element('span', 'pill', label));
        });
      }
      var text = feature.querySelector('.chronicle-copy > p');
      if (text) text.textContent = summary;
      feature.querySelectorAll('.quote').forEach(function (quote) { quote.hidden = true; });
      feature.querySelectorAll('a[href^="/chronicles/"]:not([href="/chronicles/"])').forEach(function (a) { a.setAttribute('href', url); });
    });

    home.querySelectorAll('.mobile-story').forEach(function (card) {
      var small = card.querySelector('small');
      if (small) small.textContent = [latest.category, latest.read_minutes ? latest.read_minutes + ' min read' : ''].filter(Boolean).join(' • ');
      var heading = card.querySelector('h3, h2');
      if (heading) heading.textContent = latest.title;
      var text = card.querySelector('p');
      if (text) text.textContent = summary;
      card.querySelectorAll('a[href^="/chronicles/"]:not([href="/chronicles/"])').forEach(function (a) { a.setAttribute('href', url); });
    });
  }

  function storySlug() {
    var fromQuery = new URLSearchParams(location.search).get('story');
    if (fromQuery) return fromQuery.toLowerCase();
    var match = location.pathname.match(/^\/chronicles\/([a-z0-9-]+)\/?$/);
    return match ? match[1] : null;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Shows a Chronicle saved in the admin, on either host. On GitHub Pages new
  // Chronicles open at /chronicles/?story=<slug>; an edited version of an
  // existing static story replaces the static text.
  function showStory() {
    var slug = storySlug();
    var view = document.getElementById('view-article');
    if (!slug || !SLUG.test(slug) || !view) return;
    fetch(API_ORIGIN + '/api/chronicle?slug=' + encodeURIComponent(slug), {headers: {accept: 'application/json'}})
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (!data || !data.chronicle) return;
        var c = data.chronicle;
        document.querySelectorAll('main section.view').forEach(function (section) {
          section.classList.toggle('active', section === view);
        });
        document.title = c.title + ' | Jerry Marotta Aviation';
        var heroTitle = view.querySelector('.page-hero h1');
        if (heroTitle) heroTitle.textContent = c.title;
        var heroText = view.querySelector('.page-hero p');
        if (heroText) heroText.textContent = c.summary || c.deck || '';
        var readTime = view.querySelector('.article-mobile-bar span');
        if (readTime) readTime.textContent = c.read_minutes ? c.read_minutes + ' minute read' : '';
        var article = view.querySelector('article.article');
        if (!article) return;
        var body = document.createElement('div');
        setSafeHtml(body, c.body);
        var actions = element('div', 'article-end-actions');
        var train = element('a', 'btn btn-primary', 'Train With Jerry');
        train.href = '/book/';
        var back = element('a', 'btn btn-copy', 'Back to Chronicles');
        back.href = '/chronicles/';
        actions.append(train, back);
        article.replaceChildren(
          element('div', 'article-kicker', c.kicker || ['By Jerry Marotta', c.category].filter(Boolean).join(' • ')),
          element('h1', null, c.title));
        if (c.deck) article.append(element('div', 'article-deck', c.deck));
        article.append.apply(article, Array.prototype.slice.call(body.childNodes));
        article.append(actions);
        if (new URLSearchParams(location.search).get('story')) window.scrollTo(0, 0);
      });
  }

  function pointAdminLinks() {
    document.querySelectorAll('a.footer-admin, a[href="/admin/"]').forEach(function (a) {
      a.setAttribute('href', ADMIN_URL);
    });
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
      loading = fetch(API_ORIGIN + '/api/content', {headers: {accept: 'application/json'}})
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
    var layouts = data.layouts || {};
    var groups = Object.keys(layouts).length ? layoutGroups(document) : [];
    var texts = data.texts || {};
    if (Object.keys(texts).length) {
      collect(document).forEach(function (item) {
        if (Object.prototype.hasOwnProperty.call(texts, item.hash)) setSafeHtml(item.el, texts[item.hash]);
      });
    }
    applyFacts(data.facts || {});
    applyLayout(layouts, groups);
    applyChronicles(data.chronicles);
  }

  window.JMCMS = {collect: collect, hash: hash, normalize: normalize, load: load, originalFacts: ORIGINAL_FACTS, chronicleUrl: chronicleUrl, layoutGroups: layoutGroups};

  // ?cms-edit=1 is the admin's visual editor: show the original page and let
  // the admin apply saved and unsaved changes itself.
  var EDIT_MODE = /[?&]cms-edit=1(&|$)/.test(location.search);

  if (!document.documentElement.hasAttribute('data-cms-admin') && !EDIT_MODE) {
    markActiveNav();
    pointAdminLinks();
    showStory();
    load().then(apply);
  }
})();
