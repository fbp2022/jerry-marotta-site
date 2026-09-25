// Website admin for Jerry Marotta Aviation.
// Talks only to /api/admin/* (protected by Cloudflare Access) and reads the
// public pages to discover editable text via JMCMS.collect() from /js/cms.js.
(function () {
  'use strict';

  var PAGES = [
    {id: 'home', label: 'Home', path: '/'},
    {id: 'about', label: 'About', path: '/about/'},
    {id: 'training', label: 'Training', path: '/training/'},
    {id: 'chronicles', label: 'Chronicles page', path: '/chronicles/'},
    {id: 'book', label: 'Book a Lesson', path: '/book/'},
    {id: 'contact', label: 'Contact', path: '/contact/'}
  ];

  var FACTS = [
    {key: 'flight_hours', label: 'Flight hours', example: function (v) { return v + '+ Flight Hours'; },
      hint: 'Enter the number only, for example 9,000. It updates every place the site says “8,500+ flight hours”.',
      valid: function (v) { return /^\d{1,3}(,?\d{3})*$/.test(v); }, error: 'Use digits and an optional comma, like 9,000.'},
    {key: 'years', label: 'Years in aviation', example: function (v) { return v + '+ Years in Aviation'; },
      hint: 'Enter the number only, for example 36.',
      valid: function (v) { return /^\d{1,3}$/.test(v); }, error: 'Use a whole number, like 36.'},
    {key: 'phone_display', label: 'Phone number (for texts)', example: function (v) { return 'Text Jerry: ' + v; },
      hint: 'Used for every “Text Jerry” button and booking requests on phones.',
      valid: function (v) { return v.replace(/\D/g, '').length === 10; }, error: 'Enter a 10-digit US phone number.'},
    {key: 'email', label: 'Email address', example: function (v) { return 'Email Jerry: ' + v; },
      hint: 'Used for every “Email” button, booking requests on computers, and calendar invites.',
      valid: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }, error: 'Enter a valid email address.'}
  ];

  var state = {
    me: '',
    settings: new Map(),
    testimonials: [],
    chronicles: [],
    audit: [],
    pages: {},
    dirty: new Map(),
    editorDirty: false
  };

  var viewEl = document.getElementById('view');
  var modal = document.getElementById('modal');
  var savebar = document.getElementById('savebar');
  var savebarText = document.getElementById('savebar-text');
  var toastEl = document.getElementById('toast');

  // ---------- small DOM helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.indexOf('on') === 0) el.addEventListener(key.slice(2), value);
        else if (key === 'value') el.value = value;
        else if (value === true) el.setAttribute(key, '');
        else el.setAttribute(key, value);
      });
    }
    for (var i = 2; i < arguments.length; i += 1) add(el, arguments[i]);
    return el;
  }

  function add(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(el, c); }); return; }
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function norm(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

  function toast(message, kind) {
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { toastEl.className = 'toast'; }, kind === 'error' ? 7000 : 3500);
  }

  function formatDate(value, withTime) {
    if (!value) return '';
    var iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00' : String(value).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(value) ? '' : 'Z');
    var date = new Date(iso);
    if (isNaN(date.getTime())) return value;
    return withTime
      ? date.toLocaleString([], {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'})
      : date.toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'});
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  // ---------- API ----------
  function api(method, path, body) {
    var options = {method: method, headers: {accept: 'application/json'}, credentials: 'same-origin'};
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch('/api/admin/' + path, options).then(function (response) {
      var type = response.headers.get('content-type') || '';
      if (!type.includes('json')) {
        var expired = new Error('Your sign-in has expired. Reload this page to sign in again.');
        expired.status = 401;
        throw expired;
      }
      return response.json().then(function (data) {
        if (!response.ok) {
          var err = new Error(data.error || 'Something went wrong.');
          err.status = response.status;
          throw err;
        }
        return data;
      });
    }, function () {
      var offline = new Error('Could not reach the website. Check your connection, or reload the page to sign in again.');
      offline.status = 0;
      throw offline;
    });
  }

  function ingest(data) {
    state.me = data.email;
    state.settings = new Map(data.settings.map(function (row) { return [row.key, row]; }));
    state.testimonials = data.testimonials;
    state.chronicles = data.chronicles;
    state.audit = data.audit;
    document.getElementById('who').textContent = state.me;
    var drafts = state.testimonials.filter(function (t) { return t.status !== 'published'; }).length;
    var badge = document.querySelector('[data-count="testimonials"]');
    badge.textContent = drafts ? drafts + ' draft' + (drafts === 1 ? '' : 's') : '';
    badge.hidden = !drafts;
    var cDrafts = state.chronicles.filter(function (c) { return c.status !== 'published'; }).length;
    var cBadge = document.querySelector('[data-count="chronicles"]');
    cBadge.textContent = cDrafts ? cDrafts + ' draft' + (cDrafts === 1 ? '' : 's') : '';
    cBadge.hidden = !cDrafts;
  }

  function refresh() { return api('GET', 'content').then(ingest); }

  // ---------- chrome ----------
  function setTitle(title, livePath) {
    document.getElementById('page-title').textContent = title;
    document.title = title + ' · Website Admin';
    var live = document.getElementById('view-live');
    live.hidden = !livePath;
    if (livePath) live.href = livePath;
  }

  function setActiveNav(routeKey) {
    document.querySelectorAll('#nav a').forEach(function (a) {
      var active = a.dataset.route === routeKey;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
  }

  function updateSavebar() {
    var n = state.dirty.size;
    savebar.hidden = !n;
    document.body.classList.toggle('has-savebar', !!n);
    savebarText.textContent = plural(n, 'unsaved change');
  }

  function saveAll() {
    var button = document.getElementById('save-all');
    var changes = [];
    state.dirty.forEach(function (value, key) { changes.push({key: key, value: value}); });
    if (!changes.length) return;
    button.disabled = true;
    button.textContent = 'Saving…';
    api('PUT', 'settings', {changes: changes})
      .then(function () {
        state.dirty.clear();
        state.pages = {};
        return refresh();
      })
      .then(function () {
        updateSavebar();
        route();
        toast('Saved. Your changes are live on the website.');
      })
      .catch(function (err) { toast(err.message, 'error'); })
      .finally(function () {
        button.disabled = false;
        button.textContent = 'Save changes';
      });
  }

  function discardAll() {
    confirmDialog('Discard unsaved changes?', 'This throws away ' + plural(state.dirty.size, 'change') + ' you have not saved yet.', 'Discard', true)
      .then(function (ok) {
        if (!ok) return;
        state.dirty.clear();
        updateSavebar();
        route();
      });
  }

  // ---------- modal ----------
  function openModal(title, body, actions, wide) {
    var form = h('form', {method: 'dialog', class: 'modal-card' + (wide ? ' wide' : '')},
      h('header', {class: 'modal-head'},
        h('h2', {text: title}),
        h('button', {type: 'button', class: 'icon-btn', 'aria-label': 'Close', text: '✕', onclick: function () { modal.close(); }})),
      h('div', {class: 'modal-body'}, body),
      h('footer', {class: 'modal-foot'}, actions));
    form.addEventListener('submit', function (event) { event.preventDefault(); });
    modal.replaceChildren(form);
    if (!modal.open) modal.showModal();
    return form;
  }

  function confirmDialog(title, message, confirmLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(value) { if (done) return; done = true; modal.close(); resolve(value); }
      openModal(title, h('p', {text: message}), [
        h('button', {type: 'button', class: 'btn', text: 'Cancel', onclick: function () { finish(false); }}),
        h('button', {type: 'button', class: 'btn ' + (danger ? 'danger' : 'primary'), text: confirmLabel, onclick: function () { finish(true); }})
      ]);
      modal.addEventListener('close', function () { finish(false); }, {once: true});
    });
  }

  // ---------- rich text helpers ----------
  function plainPaste(editor, singleLine) {
    editor.addEventListener('paste', function (event) {
      event.preventDefault();
      var text = (event.clipboardData || window.clipboardData).getData('text/plain');
      if (singleLine) text = text.replace(/\s+/g, ' ');
      document.execCommand('insertText', false, text);
    });
    if (singleLine) {
      editor.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') event.preventDefault();
      });
    }
  }

  function toolButton(label, title, action) {
    return h('button', {type: 'button', class: 'tool', title: title, 'aria-label': title,
      onmousedown: function (event) { event.preventDefault(); },
      onclick: action}, label);
  }

  function addLink(editor) {
    var url = window.prompt('Link address (for example https://… or /book/):', 'https://');
    if (!url) return;
    if (!/^(https?:|mailto:|tel:|sms:|\/)/i.test(url)) { toast('Links must start with https://, /, mailto:, or tel:', 'error'); return; }
    editor.focus();
    document.execCommand('createLink', false, url);
  }

  function inlineTools(editor) {
    return h('div', {class: 'tools'},
      toolButton(h('strong', {text: 'B'}), 'Bold', function () { document.execCommand('bold'); }),
      toolButton(h('em', {text: 'I'}), 'Italic', function () { document.execCommand('italic'); }),
      toolButton('Link', 'Add link', function () { addLink(editor); }),
      toolButton('Clear', 'Remove formatting', function () { document.execCommand('removeFormat'); document.execCommand('unlink'); }));
  }

  // ---------- dashboard ----------
  function factValues() {
    var values = Object.assign({}, JMCMS.originalFacts);
    Object.keys(values).forEach(function (key) {
      var row = state.settings.get('fact:' + key);
      if (row) values[key] = row.value;
      var dirty = state.dirty.get('fact:' + key);
      if (dirty) values[key] = dirty;
    });
    return values;
  }

  function statCard(label, value, sub, href) {
    return h('a', {class: 'stat', href: href},
      h('span', {class: 'stat-label', text: label}),
      h('strong', {class: 'stat-value', text: String(value)}),
      h('span', {class: 'stat-sub', text: sub}));
  }

  function quickAction(title, text, href) {
    return h('a', {class: 'quick', href: href}, h('strong', {text: title}), h('span', {text: text}));
  }

  function activityList(rows) {
    if (!rows.length) return h('p', {class: 'empty-line', text: 'No changes yet. Everything you and Jerry change will be listed here.'});
    return h('ul', {class: 'activity'}, rows.map(function (row) {
      return h('li', null,
        h('span', {class: 'activity-dot ' + row.action}),
        h('div', null,
          h('p', null, h('strong', {text: row.email}), ' ', describeAction(row)),
          h('time', {text: formatDate(row.at, true)})));
    }));
  }

  function describeAction(row) {
    var verbs = {create: 'added', update: 'updated', delete: 'deleted', reorder: 'reordered'};
    var things = {testimonial: 'a testimonial', chronicle: 'a Chronicle', settings: 'page text'};
    var text = (verbs[row.action] || row.action) + ' ' + (things[row.entity] || row.entity);
    return row.summary ? text + ': ' + row.summary : text;
  }

  function renderDashboard() {
    setTitle('Dashboard', '/');
    var facts = factValues();
    var tPub = state.testimonials.filter(function (t) { return t.status === 'published'; }).length;
    var tDraft = state.testimonials.length - tPub;
    var cPub = state.chronicles.filter(function (c) { return c.status === 'published'; }).length;
    var cDraft = state.chronicles.length - cPub;
    var edits = Array.from(state.settings.keys()).filter(function (k) { return k.indexOf('text:') === 0; }).length;

    viewEl.append(
      h('section', {class: 'welcome'},
        h('p', {class: 'eyebrow', text: 'Signed in as ' + state.me}),
        h('h2', {text: 'Your website, in one place.'}),
        h('p', {class: 'muted', text: 'Everything you can change on jerrymarottaaviation.com is in the menu on the left. Changes go live within about a minute of saving.'})),
      h('div', {class: 'stat-grid'},
        statCard('Testimonials', tPub, tDraft ? 'published · ' + tDraft + ' draft' + (tDraft === 1 ? '' : 's') : 'published', '#/testimonials'),
        statCard('Chronicles', cPub, cDraft ? 'published · ' + cDraft + ' draft' + (cDraft === 1 ? '' : 's') : 'published', '#/chronicles'),
        statCard('Flight hours', facts.flight_hours + '+', facts.years + '+ years in aviation', '#/facts'),
        statCard('Page edits', edits, 'text blocks changed from the original', '#/page/home')),
      h('section', {class: 'panel'},
        h('div', {class: 'panel-head'}, h('h3', {text: 'Quick actions'})),
        h('div', {class: 'quick-grid'},
          quickAction('Add a testimonial', 'Add a new student testimonial to the website.', '#/testimonials/new'),
          quickAction('Write a Chronicle', 'Start a new story. It stays private until you publish it.', '#/chronicles/edit/new'),
          quickAction('Update flight hours', 'Change hours, years, phone, or email everywhere at once.', '#/facts'),
          quickAction('Edit the home page', 'Change headings, descriptions, and buttons.', '#/page/home'))),
      h('section', {class: 'panel'},
        h('div', {class: 'panel-head'}, h('h3', {text: 'Recent changes'}), h('a', {href: '#/activity', text: 'See all'})),
        activityList(state.audit.slice(0, 6))));
  }

  // ---------- page text editor ----------
  function loadPageItems(page) {
    if (state.pages[page.id]) return Promise.resolve(state.pages[page.id]);
    return fetch(page.path, {cache: 'no-store'})
      .then(function (response) {
        if (!response.ok) throw new Error('Could not load ' + page.path);
        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var byHash = new Map();
        JMCMS.collect(doc).forEach(function (item) {
          if (item.view !== page.id) return;
          var existing = byHash.get(item.hash);
          if (existing) existing.count += 1;
          else byHash.set(item.hash, {hash: item.hash, view: item.view, type: item.type, text: item.text, html: item.html, count: 1});
        });
        state.pages[page.id] = Array.from(byHash.values());
        return state.pages[page.id];
      });
  }

  function savedText(key) {
    var row = state.settings.get(key);
    if (!row) return null;
    try { return JSON.parse(row.value).html; } catch (e) { return null; }
  }

  function textBlock(item) {
    var key = 'text:' + item.hash;
    var saved = savedText(key);
    var baseline = saved !== null ? saved : item.html;
    var pending = state.dirty.get(key);
    var current = pending === undefined ? baseline : (pending === null ? item.html : pending.html);
    var singleLine = /heading|Label|Button/.test(item.type);

    var editor = h('div', {class: 'rich' + (singleLine ? ' single' : ''), contenteditable: 'true', role: 'textbox', spellcheck: 'true',
      'aria-multiline': singleLine ? 'false' : 'true', 'aria-label': item.type + ': ' + item.text.slice(0, 80)});
    editor.innerHTML = current;
    plainPaste(editor, singleLine);

    var restore = h('button', {type: 'button', class: 'link-btn', text: 'Restore original wording'});
    var error = h('p', {class: 'field-error', hidden: true, text: 'This text can’t be empty. Restore the original or type new wording.'});
    var block = h('article', {class: 'block', dataset: {search: item.text.toLowerCase()}},
      h('div', {class: 'block-head'},
        h('div', {class: 'badges'},
          h('span', {class: 'badge type', text: item.type}),
          item.count > 1 ? h('span', {class: 'badge', title: 'This text appears in more than one place (for example the computer and phone layouts). One edit updates all of them.', text: 'Appears ' + item.count + '×'}) : null,
          h('span', {class: 'badge edited', text: 'Changed from original'}),
          h('span', {class: 'badge unsaved', text: 'Unsaved'})),
        restore),
      singleLine ? null : inlineTools(editor),
      editor,
      error,
      h('details', {class: 'original'}, h('summary', {text: 'Original wording'}), h('p', {text: item.text})));

    function sync() {
      var html = editor.innerHTML.trim();
      var empty = !norm(editor.textContent);
      error.hidden = !empty;
      if (empty || html === baseline) state.dirty.delete(key);
      else if (html === item.html) state.dirty.set(key, null);
      else state.dirty.set(key, {html: html, view: item.view, original: item.text});
      var pendingNow = state.dirty.get(key);
      var effective = pendingNow === undefined ? baseline : (pendingNow === null ? item.html : pendingNow.html);
      block.classList.toggle('is-dirty', state.dirty.has(key));
      block.classList.toggle('is-edited', effective !== item.html);
      restore.hidden = html === item.html;
      updateSavebar();
    }

    editor.addEventListener('input', sync);
    restore.addEventListener('click', function () { editor.innerHTML = item.html; sync(); });
    sync();
    return block;
  }

  function renderPage(id) {
    var page = PAGES.find(function (p) { return p.id === id; }) || PAGES[0];
    setTitle(page.label, page.path);
    var search = h('input', {type: 'search', class: 'search', placeholder: 'Find text on this page…', 'aria-label': 'Find text on this page'});
    var onlyEdited = h('input', {type: 'checkbox'});
    var count = h('span', {class: 'muted small'});
    var list = h('div', {class: 'block-list'}, h('p', {class: 'loading', text: 'Loading the ' + page.label + ' page…'}));

    viewEl.append(
      h('div', {class: 'callout'},
        h('strong', {text: 'How this works'}),
        h('p', {text: 'Click any text below and type. When you’re happy, press “Save changes” at the bottom of the screen. Text that appears in both the computer and phone layouts is listed once, and one edit updates both.'})),
      h('div', {class: 'toolbar'}, search, h('label', {class: 'check'}, onlyEdited, ' Changed text only'), count),
      list);

    loadPageItems(page).then(function (items) {
      if (!items.length) { list.replaceChildren(h('p', {class: 'empty-line', text: 'No editable text was found on this page.'})); return; }
      list.replaceChildren.apply(list, items.map(textBlock));
      function filter() {
        var q = search.value.trim().toLowerCase();
        var shown = 0;
        list.querySelectorAll('.block').forEach(function (block) {
          var match = (!q || block.dataset.search.indexOf(q) >= 0 || block.querySelector('.rich').textContent.toLowerCase().indexOf(q) >= 0) &&
            (!onlyEdited.checked || block.classList.contains('is-edited') || block.classList.contains('is-dirty'));
          block.hidden = !match;
          if (match) shown += 1;
        });
        count.textContent = shown + ' of ' + items.length + ' text blocks';
      }
      search.addEventListener('input', filter);
      onlyEdited.addEventListener('change', filter);
      filter();
    }).catch(function (err) {
      list.replaceChildren(h('p', {class: 'field-error', text: err.message}));
    });
  }

  // ---------- key facts ----------
  function renderFacts() {
    setTitle('Key facts & contact', '/contact/');
    var values = factValues();
    var saved = {};
    Object.keys(JMCMS.originalFacts).forEach(function (key) {
      var row = state.settings.get('fact:' + key);
      saved[key] = row ? row.value : JMCMS.originalFacts[key];
    });

    var fields = FACTS.map(function (fact) {
      var input = h('input', {type: fact.key === 'email' ? 'email' : 'text', id: 'fact-' + fact.key, value: values[fact.key], autocomplete: 'off',
        inputmode: fact.key === 'email' ? 'email' : (fact.key === 'phone_display' ? 'tel' : 'numeric')});
      var example = h('p', {class: 'fact-example'});
      var error = h('p', {class: 'field-error', hidden: true, text: fact.error});
      function sync() {
        var value = input.value.trim();
        var ok = fact.valid(value);
        error.hidden = ok;
        input.setAttribute('aria-invalid', String(!ok));
        example.textContent = 'Preview: ' + fact.example(value || '…');
        var key = 'fact:' + fact.key;
        if (!ok || value === saved[fact.key]) state.dirty.delete(key);
        else state.dirty.set(key, value);
        if (fact.key === 'phone_display') {
          var digits = value.replace(/\D/g, '');
          if (!ok || digits === saved.phone_digits) state.dirty.delete('fact:phone_digits');
          else state.dirty.set('fact:phone_digits', digits);
        }
        updateSavebar();
      }
      input.addEventListener('input', sync);
      sync();
      return h('div', {class: 'fact-field'},
        h('label', {for: 'fact-' + fact.key, text: fact.label}),
        input,
        h('p', {class: 'hint', text: fact.hint}),
        example,
        error);
    });

    viewEl.append(
      h('div', {class: 'callout'},
        h('strong', {text: 'Change once, update everywhere'}),
        h('p', {text: 'These details appear in many places across the site, on both the computer and phone layouts. Change them here and every copy updates when you press “Save changes”.'})),
      h('section', {class: 'panel'}, h('div', {class: 'fact-grid'}, fields)),
      h('section', {class: 'panel'},
        h('h3', {text: 'Meeting places, airports, and other contact wording'}),
        h('p', {class: 'muted', text: 'Training airports, meeting details, and the wording on the Contact page are regular page text. Edit them on these pages:'}),
        h('div', {class: 'chip-row'},
          h('a', {class: 'chip', href: '#/page/training', text: 'Training page'}),
          h('a', {class: 'chip', href: '#/page/contact', text: 'Contact page'}),
          h('a', {class: 'chip', href: '#/page/book', text: 'Book a Lesson page'}))));
  }

  // ---------- testimonials ----------
  var testimonialFilter = 'all';

  function stars(rating) {
    return rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '';
  }

  function renderTestimonials(openNew) {
    setTitle('Testimonials', '/');
    var list = state.testimonials.slice();
    var counts = {
      all: list.length,
      published: list.filter(function (t) { return t.status === 'published'; }).length,
      draft: list.filter(function (t) { return t.status !== 'published'; }).length
    };
    var search = h('input', {type: 'search', class: 'search', placeholder: 'Search testimonials…', 'aria-label': 'Search testimonials'});
    var tabs = h('div', {class: 'tabs', role: 'tablist'}, [['all', 'All'], ['published', 'Published'], ['draft', 'Drafts']].map(function (pair) {
      return h('button', {type: 'button', role: 'tab', class: 'tab' + (testimonialFilter === pair[0] ? ' active' : ''), 'aria-selected': String(testimonialFilter === pair[0]),
        onclick: function () { testimonialFilter = pair[0]; route(); }}, pair[1] + ' ', h('span', {class: 'tab-count', text: String(counts[pair[0]])}));
    }));
    var container = h('div', {class: 't-list'});

    viewEl.append(
      h('div', {class: 'section-head'},
        h('p', {class: 'muted', text: 'Student testimonials shown on the website, in this order. They’re kept separate from Yelp.'}),
        h('button', {type: 'button', class: 'btn primary', text: '+ Add testimonial', onclick: function () { openTestimonialEditor(null); }})),
      h('div', {class: 'toolbar'}, tabs, search),
      container);

    function draw() {
      var q = search.value.trim().toLowerCase();
      var visible = list.filter(function (t) {
        if (testimonialFilter === 'published' && t.status !== 'published') return false;
        if (testimonialFilter === 'draft' && t.status === 'published') return false;
        if (!q) return true;
        return [t.reviewer_name, t.attribution_label, t.detail, t.text].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      if (!state.testimonials.length) {
        container.replaceChildren(h('div', {class: 'empty'},
          h('h3', {text: 'No testimonials in the admin yet'}),
          h('p', {class: 'muted', text: 'The website currently shows the testimonials saved in its original file. Bring them in here so you can edit, reorder, and unpublish them.'}),
          h('button', {type: 'button', class: 'btn primary', text: 'Bring in the current website testimonials', onclick: importTestimonials})));
        return;
      }
      if (!visible.length) { container.replaceChildren(h('p', {class: 'empty-line', text: 'Nothing matches.'})); return; }
      container.replaceChildren.apply(container, visible.map(function (t) { return testimonialCard(t, list.indexOf(t), list.length); }));
    }
    search.addEventListener('input', draw);
    draw();
    if (openNew) openTestimonialEditor(null);
  }

  function testimonialCard(t, index, total) {
    var published = t.status === 'published';
    return h('article', {class: 't-card' + (published ? '' : ' is-draft')},
      h('div', {class: 't-order'},
        h('button', {type: 'button', class: 'icon-btn', 'aria-label': 'Move up', title: 'Move up', disabled: index === 0, text: '↑', onclick: function () { moveTestimonial(index, -1); }}),
        h('span', {class: 't-position', text: String(index + 1)}),
        h('button', {type: 'button', class: 'icon-btn', 'aria-label': 'Move down', title: 'Move down', disabled: index === total - 1, text: '↓', onclick: function () { moveTestimonial(index, 1); }})),
      h('div', {class: 't-body'},
        h('div', {class: 't-meta'},
          h('span', {class: 'pill ' + (published ? 'pill-live' : 'pill-draft'), text: published ? 'Published' : 'Draft · not on website'}),
          t.rating ? h('span', {class: 'stars', 'aria-label': t.rating + ' out of 5 stars', text: stars(t.rating)}) : h('span', {class: 'muted small', text: 'No star rating'})),
        h('p', {class: 't-text', text: t.text}),
        h('p', {class: 't-who'},
          h('strong', {text: t.reviewer_name || 'Name not provided'}),
          ' · ' + t.attribution_label + (t.detail ? ' · ' + t.detail : ''))),
      h('div', {class: 't-actions'},
        h('button', {type: 'button', class: 'btn', text: 'Edit', onclick: function () { openTestimonialEditor(t); }}),
        h('button', {type: 'button', class: 'btn', text: published ? 'Unpublish' : 'Publish', onclick: function () { setTestimonialStatus(t, published ? 'draft' : 'published'); }}),
        h('button', {type: 'button', class: 'btn danger-ghost', text: 'Delete', onclick: function () { deleteTestimonial(t); }})));
  }

  function testimonialPayload(t, overrides) {
    return Object.assign({
      reviewer_name: t.reviewer_name || '',
      attribution_label: t.attribution_label || '',
      detail: t.detail || '',
      text: t.text,
      rating: t.rating || null,
      status: t.status
    }, overrides || {});
  }

  function setTestimonialStatus(t, status) {
    api('PUT', 'testimonials/' + encodeURIComponent(t.id), testimonialPayload(t, {status: status}))
      .then(refresh)
      .then(function () { route(); toast(status === 'published' ? 'Published. It’s now on the website.' : 'Unpublished. It’s no longer on the website.'); })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function moveTestimonial(index, delta) {
    var ids = state.testimonials.map(function (t) { return t.id; });
    var target = index + delta;
    if (target < 0 || target >= ids.length) return;
    var moved = ids.splice(index, 1)[0];
    ids.splice(target, 0, moved);
    api('PUT', 'testimonials-order', {ids: ids})
      .then(refresh)
      .then(function () { route(); toast('Order saved.'); })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function deleteTestimonial(t) {
    confirmDialog('Delete this testimonial?', 'This permanently removes the testimonial from ' + (t.reviewer_name || 'this reviewer') + '. If you only want to hide it, choose Unpublish instead.', 'Delete permanently', true)
      .then(function (ok) {
        if (!ok) return;
        return api('DELETE', 'testimonials/' + encodeURIComponent(t.id))
          .then(refresh)
          .then(function () { route(); toast('Testimonial deleted.'); });
      })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function openTestimonialEditor(t) {
    var isNew = !t;
    var data = t ? Object.assign({}, t) : {reviewer_name: '', attribution_label: '', detail: '', text: '', rating: null, status: 'draft'};

    var name = h('input', {type: 'text', id: 't-name', value: data.reviewer_name || '', maxlength: '120', placeholder: 'For example: Tristan M.'});
    var relationship = h('input', {type: 'text', id: 't-rel', value: data.attribution_label || '', maxlength: '160', placeholder: 'For example: Instrument Student'});
    var detail = h('input', {type: 'text', id: 't-detail', value: data.detail || '', maxlength: '160', placeholder: 'For example: Student since 2018'});
    var text = h('textarea', {id: 't-text', rows: '9', maxlength: '10000', placeholder: 'Paste the testimonial exactly as the student wrote it.'});
    text.value = data.text || '';
    var charCount = h('span', {class: 'muted small'});
    var rating = data.rating || 0;
    var ratingRow = h('div', {class: 'rating-picker', role: 'radiogroup', 'aria-label': 'Star rating'});
    var status = h('select', {id: 't-status'},
      h('option', {value: 'draft', text: 'Draft: not shown on the website'}),
      h('option', {value: 'published', text: 'Published: shown on the website'}));
    status.value = data.status === 'published' ? 'published' : 'draft';
    var error = h('p', {class: 'field-error', hidden: true});

    var preview = h('div', {class: 'preview-card'});
    function drawRating() {
      ratingRow.replaceChildren(
        h('button', {type: 'button', role: 'radio', 'aria-checked': String(!rating), class: 'rating-none' + (!rating ? ' active' : ''), text: 'No rating', onclick: function () { rating = 0; drawRating(); drawPreview(); }}),
        [1, 2, 3, 4, 5].map(function (n) {
          return h('button', {type: 'button', role: 'radio', 'aria-checked': String(rating === n), 'aria-label': n + ' star' + (n > 1 ? 's' : ''),
            class: 'star' + (n <= rating ? ' on' : ''), text: '★', onclick: function () { rating = n; drawRating(); drawPreview(); }});
        }));
    }
    function drawPreview() {
      var who = norm(name.value) || 'Flight training client';
      var rel = norm(relationship.value) || 'Student testimonial';
      charCount.textContent = text.value.length.toLocaleString() + ' characters';
      preview.replaceChildren(
        h('p', {class: 'preview-label', text: 'Preview on the website'}),
        rating ? h('div', {class: 'preview-stars', text: stars(rating)}) : null,
        h('p', {class: 'preview-text', text: text.value.trim() || 'The testimonial text will appear here.'}),
        h('p', {class: 'preview-who'}, h('strong', {text: who}), h('span', {text: rel + (norm(detail.value) ? ' · ' + norm(detail.value) : '')})));
    }
    [name, relationship, detail, text].forEach(function (el) { el.addEventListener('input', drawPreview); });
    drawRating();
    drawPreview();

    var body = h('div', {class: 'editor-split'},
      h('div', {class: 'form-grid'},
        field('Reviewer name', name, 'Optional. If blank, the website shows “Flight training client”.'),
        field('Who they are', relationship, 'Shown under the name.'),
        field('Extra detail', detail, 'Optional, for example how long they’ve trained with Jerry.'),
        h('div', {class: 'field'}, h('span', {class: 'label', text: 'Star rating'}), ratingRow, h('p', {class: 'hint', text: 'Only add stars if the reviewer gave a rating. Leave “No rating” otherwise.'})),
        h('div', {class: 'field full'}, h('label', {for: 't-text', text: 'Testimonial'}), text, charCount),
        field('Visibility', status, null),
        error),
      preview);

    var saveButton = h('button', {type: 'button', class: 'btn primary', text: isNew ? 'Add testimonial' : 'Save changes'});
    saveButton.addEventListener('click', function () {
      if (!text.value.trim()) { error.textContent = 'Please add the testimonial text.'; error.hidden = false; text.focus(); return; }
      saveButton.disabled = true;
      var payload = {reviewer_name: norm(name.value), attribution_label: norm(relationship.value), detail: norm(detail.value), text: text.value.trim(), rating: rating || null, status: status.value};
      var request = isNew ? api('POST', 'testimonials', payload) : api('PUT', 'testimonials/' + encodeURIComponent(t.id), payload);
      request
        .then(refresh)
        .then(function () {
          modal.close();
          if (location.hash !== '#/testimonials') location.hash = '#/testimonials'; else route();
          toast(payload.status === 'published' ? 'Saved and published.' : 'Saved as a draft. It isn’t on the website yet.');
        })
        .catch(function (err) { error.textContent = err.message; error.hidden = false; saveButton.disabled = false; });
    });

    openModal(isNew ? 'Add a testimonial' : 'Edit testimonial', body, [
      h('button', {type: 'button', class: 'btn', text: 'Cancel', onclick: function () { modal.close(); }}),
      saveButton
    ], true);
    (isNew ? name : text).focus();
  }

  function field(label, input, hint) {
    return h('div', {class: 'field'},
      h('label', {for: input.id, text: label}),
      input,
      hint ? h('p', {class: 'hint', text: hint}) : null);
  }

  function importTestimonials() {
    fetch('/data/testimonials.json', {cache: 'no-store'})
      .then(function (response) { return response.json(); })
      .then(function (data) {
        var reviews = Array.isArray(data.reviews) ? data.reviews : [];
        return reviews.reduce(function (chain, review) {
          return chain.then(function () {
            return api('POST', 'testimonials', {
              reviewer_name: review.name === 'Flight training client' ? '' : (review.name || ''),
              attribution_label: review.relationship || '',
              detail: /directly shared/i.test(review.detail || '') ? '' : (review.detail || ''),
              text: review.text || '',
              rating: review.rating || null,
              status: 'published'
            });
          });
        }, Promise.resolve()).then(function () { return reviews.length; });
      })
      .then(function (count) { return refresh().then(function () { route(); toast(plural(count, 'testimonial') + ' brought in and published.'); }); })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  // ---------- chronicles ----------
  var FEATURED_SLUG = 'the-day-fear-took-the-controls';

  function renderChronicles() {
    setTitle('Chronicles', '/chronicles/');
    var hasFeatured = state.chronicles.some(function (c) { return c.slug === FEATURED_SLUG; });

    viewEl.append(h('div', {class: 'section-head'},
      h('p', {class: 'muted', text: 'Jerry’s stories from the right seat. Drafts stay private until you publish them. The newest published story is featured on the home page.'}),
      h('a', {class: 'btn primary', href: '#/chronicles/edit/new', text: '+ Write a new Chronicle'})));

    if (!hasFeatured) {
      viewEl.append(h('div', {class: 'callout gold'},
        h('strong', {text: '“The Day Fear Took the Controls” is still a fixed page'}),
        h('p', {text: 'Bring it into the admin so it can be edited here like any other Chronicle. The story stays exactly as it reads today.'}),
        h('button', {type: 'button', class: 'btn primary', text: 'Bring it into the admin', onclick: importFeaturedChronicle})));
    }

    if (!state.chronicles.length) {
      viewEl.append(h('div', {class: 'empty'}, h('h3', {text: 'No Chronicles in the admin yet'}), h('p', {class: 'muted', text: 'Write a new one, or bring in the existing story above.'})));
      return;
    }

    viewEl.append(h('div', {class: 'c-list'}, state.chronicles.map(function (c) {
      var published = c.status === 'published';
      return h('article', {class: 'c-row'},
        h('div', {class: 'c-main'},
          h('div', {class: 't-meta'},
            h('span', {class: 'pill ' + (published ? 'pill-live' : 'pill-draft'), text: published ? 'Published' : 'Draft'}),
            c.category ? h('span', {class: 'muted small', text: c.category}) : null,
            h('span', {class: 'muted small', text: published ? formatDate(c.published_at) : 'Last edited ' + formatDate(c.updated_at, true)})),
          h('h3', null, h('a', {href: '#/chronicles/edit/' + c.id, text: c.title})),
          c.summary ? h('p', {class: 'muted', text: c.summary}) : null,
          h('p', {class: 'slug', text: 'jerrymarottaaviation.com/chronicles/' + c.slug + '/'})),
        h('div', {class: 't-actions'},
          h('a', {class: 'btn', href: '#/chronicles/edit/' + c.id, text: 'Edit'}),
          published ? h('a', {class: 'btn', href: '/chronicles/' + c.slug + '/', target: '_blank', rel: 'noopener', text: 'View ↗'}) : null,
          h('button', {type: 'button', class: 'btn danger-ghost', text: 'Delete', onclick: function () { deleteChronicle(c); }})));
    })));
  }

  function importFeaturedChronicle() {
    fetch('/chronicles/' + FEATURED_SLUG + '/', {cache: 'no-store'})
      .then(function (response) { return response.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var section = doc.getElementById('view-article');
        var article = section && section.querySelector('article.article');
        if (!article) throw new Error('Could not find the story on the page.');
        var clone = article.cloneNode(true);
        var get = function (sel) { var el = clone.querySelector(sel); return el ? norm(el.textContent) : ''; };
        var payload = {
          slug: FEATURED_SLUG,
          title: get('h1'),
          kicker: get('.article-kicker'),
          deck: get('.article-deck'),
          summary: norm((section.querySelector('.page-hero p') || {}).textContent),
          category: 'Flight Safety',
          read_minutes: parseInt((section.querySelector('.article-mobile-bar span') || {}).textContent, 10) || '',
          status: 'published'
        };
        clone.querySelectorAll('.article-kicker, h1, .article-deck, .article-end-actions').forEach(function (el) { el.remove(); });
        clone.querySelectorAll('div[style]').forEach(function (el) { if (el.querySelector('a.btn')) el.remove(); });
        payload.body = clone.innerHTML.trim();
        return api('POST', 'chronicles', payload);
      })
      .then(refresh)
      .then(function () { route(); toast('Brought in. You can now edit it here.'); })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function deleteChronicle(c) {
    var extra = c.slug === FEATURED_SLUG ? ' The original fixed version of this story will show again on the website.' : '';
    confirmDialog('Delete “' + c.title + '”?', 'This permanently deletes this Chronicle from the admin.' + extra + ' If you only want to hide it, set it to Draft instead.', 'Delete permanently', true)
      .then(function (ok) {
        if (!ok) return;
        return api('DELETE', 'chronicles/' + encodeURIComponent(c.id))
          .then(refresh)
          .then(function () {
            state.editorDirty = false;
            if (location.hash !== '#/chronicles') location.hash = '#/chronicles'; else route();
            toast('Chronicle deleted.');
          });
      })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function slugify(text) {
    return norm(text).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
  }

  function blockTools(editor) {
    function block(tag) { return function () { document.execCommand('formatBlock', false, tag); }; }
    return h('div', {class: 'tools sticky'},
      toolButton('Paragraph', 'Normal paragraph', block('p')),
      toolButton('Heading', 'Section heading', block('h2')),
      toolButton(h('strong', {text: 'B'}), 'Bold', function () { document.execCommand('bold'); }),
      toolButton(h('em', {text: 'I'}), 'Italic', function () { document.execCommand('italic'); }),
      toolButton('Quote', 'Quote', block('blockquote')),
      toolButton('• List', 'Bulleted list', function () { document.execCommand('insertUnorderedList'); }),
      toolButton('Link', 'Add link', function () { addLink(editor); }),
      toolButton('Safety note', 'Insert a safety note box', function () {
        editor.focus();
        document.execCommand('insertHTML', false, '<div class="booking-note"><strong>Safety note:</strong> Type the note here.</div><p><br></p>');
      }),
      toolButton('Clear', 'Remove formatting', function () { document.execCommand('removeFormat'); }));
  }

  function cleanBody(editor) {
    editor.querySelectorAll('h2:not([class])').forEach(function (el) { el.className = 'article-subhead'; });
    editor.querySelectorAll('[style]').forEach(function (el) { if (!el.closest('.booking-note')) el.removeAttribute('style'); });
    return editor.innerHTML.trim();
  }

  function renderChronicleEditor(id) {
    var existing = id === 'new' ? null : state.chronicles.find(function (c) { return c.id === id; });
    if (id !== 'new' && !existing) {
      setTitle('Chronicle not found', null);
      viewEl.append(h('p', {class: 'empty-line', text: 'That Chronicle no longer exists.'}), h('a', {class: 'btn', href: '#/chronicles', text: 'Back to Chronicles'}));
      return;
    }
    var c = existing || {title: '', slug: '', summary: '', body: '<p><br></p>', status: 'draft', published_at: '', category: '', kicker: 'By Jerry Marotta', deck: '', read_minutes: ''};
    setTitle(existing ? 'Edit Chronicle' : 'New Chronicle', existing && existing.status === 'published' ? '/chronicles/' + existing.slug + '/' : null);

    var title = h('input', {type: 'text', class: 'title-input', placeholder: 'Story title', 'aria-label': 'Story title', value: c.title, maxlength: '200'});
    var deck = h('input', {type: 'text', class: 'deck-input', placeholder: 'Opening line shown under the title (optional)', 'aria-label': 'Opening line', value: c.deck || '', maxlength: '400'});
    var body = h('div', {class: 'rich article-body', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Story', spellcheck: 'true'});
    body.innerHTML = c.body || '<p><br></p>';
    plainPaste(body, false);

    var status = h('select', {id: 'c-status'}, h('option', {value: 'draft', text: 'Draft (private)'}), h('option', {value: 'published', text: 'Published (on the website)'}));
    status.value = c.status === 'published' ? 'published' : 'draft';
    var date = h('input', {type: 'date', id: 'c-date', value: c.published_at || ''});
    var slug = h('input', {type: 'text', id: 'c-slug', value: c.slug, maxlength: '100', spellcheck: 'false'});
    var slugPreview = h('p', {class: 'hint slug'});
    var category = h('input', {type: 'text', id: 'c-category', value: c.category || '', maxlength: '80', placeholder: 'For example: Flight Safety'});
    var kicker = h('input', {type: 'text', id: 'c-kicker', value: c.kicker || '', maxlength: '200', placeholder: 'By Jerry Marotta • Flight Safety'});
    var summary = h('textarea', {id: 'c-summary', rows: '4', maxlength: '1000', placeholder: 'One or two sentences for the Chronicles list and search engines.'});
    summary.value = c.summary || '';
    var minutes = h('input', {type: 'number', id: 'c-minutes', min: '1', max: '240', value: c.read_minutes || '', placeholder: 'Auto'});
    var words = h('p', {class: 'hint'});
    var error = h('p', {class: 'field-error', hidden: true});
    var slugTouched = !!existing;

    function update() {
      var count = norm(body.textContent) ? norm(body.textContent).split(' ').length : 0;
      words.textContent = count.toLocaleString() + ' words · about ' + Math.max(1, Math.round(count / 200)) + ' minute read';
      slugPreview.textContent = 'jerrymarottaaviation.com/chronicles/' + (slug.value || '…') + '/';
    }
    function dirty() { state.editorDirty = true; update(); }
    title.addEventListener('input', function () { if (!slugTouched) slug.value = slugify(title.value); dirty(); });
    slug.addEventListener('input', function () { slugTouched = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); dirty(); });
    [deck, status, date, category, kicker, summary, minutes].forEach(function (el) { el.addEventListener('input', dirty); el.addEventListener('change', dirty); });
    body.addEventListener('input', dirty);
    update();

    function payload(statusValue) {
      var count = norm(body.textContent) ? norm(body.textContent).split(' ').length : 0;
      return {
        title: norm(title.value), slug: slug.value.replace(/^-+|-+$/g, ''), deck: norm(deck.value), body: cleanBody(body),
        status: statusValue, published_at: date.value, category: norm(category.value), kicker: norm(kicker.value),
        summary: summary.value.trim(), read_minutes: minutes.value ? Number(minutes.value) : Math.max(1, Math.round(count / 200))
      };
    }

    function save(statusValue) {
      error.hidden = true;
      var data = payload(statusValue);
      if (!data.title) { error.textContent = 'Please give the story a title.'; error.hidden = false; title.focus(); return; }
      if (!data.slug) { error.textContent = 'Please add a web address.'; error.hidden = false; slug.focus(); return; }
      var request = existing ? api('PUT', 'chronicles/' + encodeURIComponent(existing.id), data) : api('POST', 'chronicles', data);
      request
        .then(function (result) {
          state.editorDirty = false;
          return refresh().then(function () { return result.chronicle; });
        })
        .then(function (saved) {
          toast(saved.status === 'published' ? 'Published. It’s live at /chronicles/' + saved.slug + '/' : 'Draft saved. It isn’t on the website yet.');
          var target = '#/chronicles/edit/' + saved.id;
          if (location.hash !== target) location.hash = target; else route();
        })
        .catch(function (err) { error.textContent = err.message; error.hidden = false; });
    }

    function preview() {
      var data = payload(status.value);
      var frame = h('iframe', {class: 'preview-frame', title: 'Story preview'});
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css"></head><body>' +
        '<main><section class="view active" id="view-article"><header class="page-hero"><div class="section-label">Flight Instructor’s Chronicles</div><h1></h1><p></p></header>' +
        '<div class="page-content"><article class="article"></article></div></section></main></body></html>';
      frame.addEventListener('load', function () {
        var doc = frame.contentDocument;
        doc.querySelector('.page-hero h1').textContent = data.title || 'Untitled story';
        doc.querySelector('.page-hero p').textContent = data.summary || data.deck || '';
        var article = doc.querySelector('.article');
        article.append(
          Object.assign(doc.createElement('div'), {className: 'article-kicker', textContent: data.kicker}),
          Object.assign(doc.createElement('h1'), {textContent: data.title}));
        if (data.deck) article.append(Object.assign(doc.createElement('div'), {className: 'article-deck', textContent: data.deck}));
        var bodyWrap = doc.createElement('div');
        bodyWrap.innerHTML = data.body;
        bodyWrap.querySelectorAll('script, iframe, object, embed').forEach(function (el) { el.remove(); });
        article.append.apply(article, Array.from(bodyWrap.childNodes));
      });
      openModal('Preview', frame, [h('button', {type: 'button', class: 'btn primary', text: 'Close preview', onclick: function () { modal.close(); }})], true);
    }

    var isPublished = existing && existing.status === 'published';
    var actions = h('div', {class: 'side-actions'},
      isPublished
        ? [h('button', {type: 'button', class: 'btn primary', text: 'Save changes', onclick: function () { save(status.value); }}),
          h('button', {type: 'button', class: 'btn', text: 'Unpublish (make draft)', onclick: function () { save('draft'); }})]
        : [h('button', {type: 'button', class: 'btn primary', text: 'Publish to website', onclick: function () { save('published'); }}),
          h('button', {type: 'button', class: 'btn', text: 'Save draft', onclick: function () { save('draft'); }})],
      h('button', {type: 'button', class: 'btn', text: 'Preview', onclick: preview}),
      existing ? h('button', {type: 'button', class: 'btn danger-ghost', text: 'Delete', onclick: function () { deleteChronicle(existing); }}) : null);

    viewEl.append(
      h('a', {class: 'back-link', href: '#/chronicles', text: '← All Chronicles'}),
      h('div', {class: 'chronicle-editor'},
        h('div', {class: 'writer'}, title, deck, blockTools(body), body, words),
        h('aside', {class: 'side-panel'},
          actions,
          error,
          field('Status', status, null),
          field('Publish date', date, 'Leave blank to use the day you publish.'),
          h('div', {class: 'field'}, h('label', {for: 'c-slug', text: 'Web address'}), slug, slugPreview),
          field('Category', category, 'Shown on the story card.'),
          field('Byline', kicker, 'Shown above the title.'),
          field('Summary', summary, 'Shown on the Chronicles page, the home page feature, and in search results.'),
          field('Reading time (minutes)', minutes, 'Leave blank to calculate it automatically.'))));
    if (!existing) title.focus();
  }

  // ---------- yelp ----------
  function renderYelp() {
    setTitle('Yelp (read-only)', 'https://www.yelp.com/biz/jerry-marotta-alcoa');
    viewEl.append(
      h('div', {class: 'callout'},
        h('strong', {text: 'Yelp reviews can’t be edited here'}),
        h('p', {text: 'Yelp reviews belong to Yelp and the reviewers. The website links visitors to Jerry’s Yelp page to read and write reviews. Website testimonials are managed separately under Testimonials.'})),
      h('section', {class: 'panel'},
        h('h3', {text: 'How Yelp appears on the website'}),
        h('p', {class: 'muted', text: 'The website shows “Read reviews on Yelp” and “Write a review on Yelp” buttons. It does not copy Yelp’s rating or reviews, so it can never show out-of-date numbers.'}),
        h('div', {class: 'chip-row'},
          h('a', {class: 'chip', href: 'https://www.yelp.com/biz/jerry-marotta-alcoa', target: '_blank', rel: 'noopener', text: 'Open Jerry’s Yelp page ↗'}),
          h('a', {class: 'chip', href: 'https://biz.yelp.com/', target: '_blank', rel: 'noopener', text: 'Yelp for Business ↗'}))),
      h('section', {class: 'panel'},
        h('h3', {text: 'Good to know'}),
        h('ul', {class: 'plain-list'},
          h('li', {text: 'Yelp decides which reviews are “recommended.” Reviews it doesn’t recommend are hidden at the bottom of the Yelp page, and no one can change that from the website.'}),
          h('li', {text: 'Jerry’s listing is currently unclaimed. Claiming it for free at biz.yelp.com lets Jerry respond to reviews and add Yelp’s official review badge to the website.'}))));
  }

  // ---------- activity ----------
  function renderActivity() {
    setTitle('Activity log', null);
    viewEl.append(
      h('p', {class: 'muted', text: 'Every change made in this admin, newest first. Only you and Jerry can make changes.'}),
      h('section', {class: 'panel'}, activityList(state.audit)));
  }

  // ---------- blocked / setup screens ----------
  function renderBlocked(err) {
    document.body.classList.add('blocked');
    setTitle(err.status === 503 ? 'Almost ready' : 'Sign in required', '/');
    var message = err.status === 503
      ? 'Secure sign-in for this admin is still being set up. Once it’s finished, Jerry and the site owner will sign in with a one-time code sent to their email.'
      : err.message;
    viewEl.replaceChildren(h('section', {class: 'panel blocked-panel'},
      h('img', {src: '/images/winged-compass-logo.png', alt: '', width: '120'}),
      h('h2', {text: err.status === 503 ? 'Secure sign-in is being set up' : 'Please sign in again'}),
      h('p', {class: 'muted', text: message}),
      h('div', {class: 'chip-row'},
        h('button', {type: 'button', class: 'btn primary', text: 'Reload', onclick: function () { location.reload(); }}),
        h('a', {class: 'btn', href: '/', text: 'Back to the website'}))));
  }

  // ---------- router ----------
  function route() {
    var hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    var parts = hash.split('/');
    var section = parts[0];
    setActiveNav(section === 'page' ? 'page/' + parts[1] : section);
    setMenu(false);
    if (modal.open) modal.close();
    viewEl.replaceChildren();
    window.scrollTo(0, 0);
    if (section === 'page') return renderPage(parts[1]);
    if (section === 'facts') return renderFacts();
    if (section === 'testimonials') return renderTestimonials(parts[1] === 'new');
    if (section === 'chronicles') return parts[1] === 'edit' ? renderChronicleEditor(parts[2]) : renderChronicles();
    if (section === 'yelp') return renderYelp();
    if (section === 'activity') return renderActivity();
    return renderDashboard();
  }

  var lastHash = location.hash;
  window.addEventListener('hashchange', function () {
    if (state.editorDirty && !window.confirm('You have unsaved changes to this Chronicle. Leave without saving?')) {
      history.replaceState(null, '', lastHash || '#/');
      return;
    }
    state.editorDirty = false;
    lastHash = location.hash;
    route();
  });

  window.addEventListener('beforeunload', function (event) {
    if (state.dirty.size || state.editorDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  document.getElementById('menu-toggle').addEventListener('click', function () { setMenu(!document.body.classList.contains('menu-open')); });
  document.getElementById('scrim').addEventListener('click', function () { setMenu(false); });
  document.getElementById('save-all').addEventListener('click', saveAll);
  document.getElementById('discard').addEventListener('click', discardAll);

  api('GET', 'content')
    .then(function (data) {
      ingest(data);
      document.body.classList.remove('loading');
      route();
    })
    .catch(function (err) {
      document.body.classList.remove('loading');
      renderBlocked(err);
    });
})();
