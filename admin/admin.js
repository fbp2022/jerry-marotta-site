// Website admin for Jerry Marotta Aviation.
// Talks only to /api/admin/* (protected by Cloudflare Access) and reads the
// public pages to discover editable text via JMCMS.collect() from /js/cms.js.
(function () {
  'use strict';

  // The admin only works behind Cloudflare Access on Cloudflare Pages. The
  // public site (and this file) is also served by GitHub Pages, so send
  // anyone who lands on the GitHub copy to the protected one.
  var ADMIN_HOME = 'https://jerry-marotta-aviation.pages.dev/admin/';
  if (!/(^|\.)jerry-marotta-aviation\.pages\.dev$/.test(location.hostname)) {
    location.replace(ADMIN_HOME + location.hash);
    return;
  }

  // Where visitors see the site.
  var SITE = 'https://jerrymarottaaviation.com';

  function storyUrl(slug) {
    return SITE + '/chronicles/?story=' + slug;
  }

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
    if (livePath) live.href = livePath.charAt(0) === '/' ? SITE + livePath : livePath;
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

  // ---------- visual page editor ----------
  // The real page loads in a frame (?cms-edit=1 keeps it original). Text is
  // edited in place; in "Move & hide" mode sections can be dragged, moved with
  // arrows, or hidden. Everything shows in the frame before it is saved.
  var device = 'desktop';
  var arrangeMode = false;

  var EDIT_CSS = [
    '[data-cms-edit]{cursor:text;border-radius:3px}',
    '[data-cms-edit]:hover{outline:2px dashed rgba(223,183,104,.95);outline-offset:3px}',
    '[data-cms-edit]:focus{outline:2px solid #dfb768;outline-offset:3px;background:rgba(223,183,104,.14)}',
    '[data-cms-dirty]{outline:2px solid #e39b2d !important;outline-offset:3px}',
    '[data-cms-section]{position:relative !important;outline:2px dashed rgba(63,119,163,.6);outline-offset:-3px;cursor:grab}',
    '[data-cms-section]:hover{outline:3px solid #3f77a3}',
    '[data-cms-section][data-cms-hidden]{opacity:.35;filter:grayscale(1)}',
    '.cms-dragging{opacity:.45}',
    '.cms-drop-before{box-shadow:inset 0 6px 0 #dfb768 !important}',
    '.cms-drop-after{box-shadow:inset 0 -6px 0 #dfb768 !important}',
    '.cms-drop-before.cms-row{box-shadow:inset 6px 0 0 #dfb768 !important}',
    '.cms-drop-after.cms-row{box-shadow:inset -6px 0 0 #dfb768 !important}',
    '.cms-handle{position:absolute;top:8px;right:8px;z-index:9999;display:flex;gap:4px;font:600 12px/1 system-ui,Segoe UI,Arial,sans-serif;letter-spacing:0;text-transform:none}',
    '.cms-handle button,.cms-handle span{background:#081521;color:#fff;border:0;border-radius:6px;padding:7px 9px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}',
    '.cms-handle span{cursor:grab;background:#3f77a3}',
    '.cms-handle .cms-hide{background:#b3261e}',
    '.cms-handle .cms-show{background:#1f7a4d}',
    '.cms-hidden-badge{position:absolute;top:8px;left:8px;z-index:9999;background:#b3261e;color:#fff;font:700 11px/1 system-ui,sans-serif;padding:6px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.06em}'
  ].join('');

  function savedText(key) {
    var row = state.settings.get(key);
    if (!row) return null;
    try { return JSON.parse(row.value).html; } catch (e) { return null; }
  }

  function savedLayout(key) {
    var row = state.settings.get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch (e) { return null; }
  }

  function waitForFrame(frame) {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function check() {
        var w = frame.contentWindow;
        if (w && w.JMCMS && w.document.readyState !== 'loading') { resolve(w); return; }
        tries += 1;
        if (tries > 60) { reject(new Error('The page preview did not finish loading. Try reloading.')); return; }
        setTimeout(check, 100);
      })();
    });
  }

  function segButton(label, active, onclick) {
    return h('button', {type: 'button', class: 'seg' + (active ? ' active' : ''), 'aria-pressed': String(active), onclick: onclick}, label);
  }

  function renderPage(id) {
    var page = PAGES.find(function (p) { return p.id === id; }) || PAGES[0];
    setTitle(page.label, page.path);

    var frame = h('iframe', {class: 'page-frame', title: 'Editable preview of the ' + page.label + ' page', src: page.path + '?cms-edit=1'});
    var status = h('span', {class: 'editor-status', text: 'Loading the page…'});
    var restoreBtn = toolButton('Restore original', 'Put the selected text back to its original wording', function () {});
    restoreBtn.disabled = true;
    var frameDoc = null;
    function run(command, value) { if (frameDoc) frameDoc.execCommand(command, false, value); }
    var textTools = h('div', {class: 'tools inline'},
      toolButton(h('strong', {text: 'B'}), 'Bold', function () { run('bold'); }),
      toolButton(h('em', {text: 'I'}), 'Italic', function () { run('italic'); }),
      toolButton('Link', 'Add link', function () {
        var url = window.prompt('Link address (for example https://… or /book/):', 'https://');
        if (!url) return;
        if (!/^(https?:|mailto:|tel:|sms:|\/)/i.test(url)) { toast('Links must start with https://, /, mailto:, or tel:', 'error'); return; }
        run('createLink', url);
      }),
      restoreBtn);

    viewEl.append(
      h('div', {class: 'editor-bar'},
        h('div', {class: 'seg-group', role: 'group', 'aria-label': 'Editing mode'},
          segButton('✎ Edit text', !arrangeMode, function () { arrangeMode = false; route(); }),
          segButton('⇅ Move & hide sections', arrangeMode, function () { arrangeMode = true; route(); })),
        arrangeMode ? null : textTools,
        h('div', {class: 'seg-group', role: 'group', 'aria-label': 'Preview size'},
          segButton('Computer', device === 'desktop', function () { device = 'desktop'; route(); }),
          segButton('Phone', device === 'phone', function () { device = 'phone'; route(); }))),
      h('p', {class: 'editor-help'}, status, ' ', arrangeMode
        ? 'Drag a section to a new spot, or use its ↑ ↓ buttons. “Hide” takes a section off the page; “Show” brings it back.'
        : 'Click any text on the page and type. Changes appear right here. Press “Save changes” at the bottom when you’re happy.'),
      h('div', {class: 'frame-wrap' + (device === 'phone' ? ' phone' : '')}, frame),
      h('p', {class: 'muted small', text: 'Flight hours, years, phone number, and email change everywhere at once under Key facts & contact. Testimonials and Chronicles have their own sections.'}));

    frame.addEventListener('load', function () {
      waitForFrame(frame).then(function (w) {
        var d = w.document;
        frameDoc = d;
        var style = d.createElement('style');
        style.textContent = EDIT_CSS;
        d.head.appendChild(style);
        // Links, buttons and forms don't navigate while editing.
        d.addEventListener('click', function (event) {
          if (event.target.closest('.cms-handle')) return;
          if (event.target.closest('a, button, summary, label, input, select, textarea')) event.preventDefault();
        }, true);
        d.addEventListener('submit', function (event) { event.preventDefault(); }, true);
        if (arrangeMode) setupArrange(w, d, page, status);
        else setupText(w, d, page, status, restoreBtn);
      }).catch(function (err) { status.textContent = err.message; });
    });
  }

  function setupText(w, d, page, status, restoreBtn) {
    var groups = {};
    w.JMCMS.collect(d).forEach(function (item) {
      if (item.view !== page.id) return;
      (groups[item.hash] = groups[item.hash] || []).push(item);
    });
    var current = null;

    Object.keys(groups).forEach(function (hashKey) {
      var list = groups[hashKey];
      var original = list[0].html;
      var key = 'text:' + hashKey;
      var saved = savedText(key);
      var baseline = saved !== null ? saved : original;
      var pending = state.dirty.get(key);
      var start = pending === undefined ? baseline : (pending === null ? original : pending.html);
      var singleLine = /heading|Label|Button/.test(list[0].type);

      function sync(source) {
        var html = source.innerHTML.trim();
        list.forEach(function (item) { if (item.el !== source) item.el.innerHTML = html; });
        var empty = !norm(source.textContent);
        if (empty || html === baseline) state.dirty.delete(key);
        else if (html === original) state.dirty.set(key, null);
        else state.dirty.set(key, {html: html, view: page.id, original: list[0].text});
        list.forEach(function (item) { item.el.toggleAttribute('data-cms-dirty', state.dirty.has(key)); });
        restoreBtn.disabled = html === original;
        updateSavebar();
      }

      list.forEach(function (item) {
        var node = item.el;
        if (start !== original) node.innerHTML = start;
        node.contentEditable = 'true';
        node.spellcheck = true;
        node.setAttribute('data-cms-edit', '');
        node.title = list[0].type + ': click to edit';
        node.toggleAttribute('data-cms-dirty', state.dirty.has(key));
        node.addEventListener('keydown', function (event) { if (singleLine && event.key === 'Enter') event.preventDefault(); });
        node.addEventListener('paste', function (event) {
          event.preventDefault();
          var text = event.clipboardData.getData('text/plain');
          if (singleLine) text = text.replace(/\s+/g, ' ');
          d.execCommand('insertText', false, text);
        });
        node.addEventListener('focus', function () {
          current = {el: node, original: original, sync: sync};
          restoreBtn.disabled = node.innerHTML.trim() === original;
        });
        node.addEventListener('input', function () { sync(node); });
      });
    });

    restoreBtn.onclick = function () {
      if (!current) return;
      current.el.innerHTML = current.original;
      current.sync(current.el);
    };
    var count = Object.keys(groups).length;
    status.textContent = count ? count + ' editable text areas on this page.' : 'No editable text on this page.';
  }

  function setupArrange(w, d, page, status) {
    var groups = w.JMCMS.layoutGroups(d).filter(function (group) {
      return group.view === page.id && group.container.getClientRects().length;
    });
    var dragging = null;

    groups.forEach(function (group) {
      var key = 'layout:' + group.key;
      var saved = savedLayout(key);
      var pending = state.dirty.get(key);
      var layout = pending === undefined ? saved : pending;
      var byKey = {};
      group.children.forEach(function (child) { byKey[child.key] = child.el; });
      var originalOrder = group.children.map(function (child) { return child.key; });
      var order = originalOrder.slice();
      var hidden = [];
      if (layout) {
        var listed = (layout.order || []).filter(function (k) { return byKey[k]; });
        order = listed.concat(originalOrder.filter(function (k) { return listed.indexOf(k) < 0; }));
        hidden = (layout.hidden || []).filter(function (k) { return byKey[k]; });
      }
      var first = group.children[0].el.getBoundingClientRect();
      var second = group.children[1].el.getBoundingClientRect();
      var horizontal = Math.abs(first.top - second.top) < 8;

      function same(a, b) { return a.join(',') === b.join(','); }

      function paint() {
        order.forEach(function (k) { group.container.appendChild(byKey[k]); });
        order.forEach(function (k, index) {
          var node = byKey[k];
          var isHidden = hidden.indexOf(k) >= 0;
          node.toggleAttribute('data-cms-hidden', isHidden);
          var handle = node.querySelector(':scope > .cms-handle');
          handle.querySelector('.cms-up').disabled = index === 0;
          handle.querySelector('.cms-down').disabled = index === order.length - 1;
          var toggle = handle.querySelector('.cms-toggle');
          toggle.textContent = isHidden ? 'Show' : 'Hide';
          toggle.className = 'cms-toggle ' + (isHidden ? 'cms-show' : 'cms-hide');
          var badge = node.querySelector(':scope > .cms-hidden-badge');
          if (isHidden && !badge) {
            badge = d.createElement('div');
            badge.className = 'cms-hidden-badge';
            badge.textContent = 'Hidden on website';
            node.appendChild(badge);
          } else if (!isHidden && badge) {
            badge.remove();
          }
        });
      }

      function commit() {
        var isOriginal = same(order, originalOrder) && !hidden.length;
        var matchesSaved = saved ? same(order, saved.order || []) && same(hidden, saved.hidden || []) : isOriginal;
        if (matchesSaved) state.dirty.delete(key);
        else if (isOriginal) state.dirty.set(key, null);
        else state.dirty.set(key, {order: order.slice(), hidden: hidden.slice()});
        updateSavebar();
        paint();
      }

      function move(k, delta) {
        var index = order.indexOf(k);
        var target = index + delta;
        if (target < 0 || target >= order.length) return;
        order.splice(index, 1);
        order.splice(target, 0, k);
        commit();
      }

      group.children.forEach(function (child) {
        var node = child.el;
        var k = child.key;
        if (!node.getClientRects().length && hidden.indexOf(k) < 0) return;
        node.setAttribute('data-cms-section', '');
        node.draggable = true;
        if (horizontal) node.classList.add('cms-row');
        var handle = d.createElement('div');
        handle.className = 'cms-handle';
        var grip = d.createElement('span');
        grip.textContent = '⠿ Drag';
        function button(className, label, onclick) {
          var b = d.createElement('button');
          b.type = 'button';
          b.className = className;
          b.textContent = label;
          b.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); onclick(); });
          return b;
        }
        handle.append(grip,
          button('cms-up', horizontal ? '←' : '↑', function () { move(k, -1); }),
          button('cms-down', horizontal ? '→' : '↓', function () { move(k, 1); }),
          button('cms-toggle', 'Hide', function () {
            var at = hidden.indexOf(k);
            if (at >= 0) hidden.splice(at, 1); else hidden.push(k);
            commit();
          }));
        node.appendChild(handle);

        node.addEventListener('dragstart', function (event) {
          event.stopPropagation();
          dragging = {group: group, key: k};
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', k);
          node.classList.add('cms-dragging');
        });
        node.addEventListener('dragend', function (event) {
          event.stopPropagation();
          dragging = null;
          d.querySelectorAll('.cms-dragging, .cms-drop-before, .cms-drop-after').forEach(function (n) {
            n.classList.remove('cms-dragging', 'cms-drop-before', 'cms-drop-after');
          });
        });
        function side(event) {
          var rect = node.getBoundingClientRect();
          return horizontal
            ? (event.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
            : (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
        }
        node.addEventListener('dragover', function (event) {
          if (!dragging || dragging.group !== group) return;
          event.preventDefault();
          event.stopPropagation();
          var where = side(event);
          node.classList.toggle('cms-drop-before', where === 'before' && dragging.key !== k);
          node.classList.toggle('cms-drop-after', where === 'after' && dragging.key !== k);
        });
        node.addEventListener('dragleave', function () { node.classList.remove('cms-drop-before', 'cms-drop-after'); });
        node.addEventListener('drop', function (event) {
          if (!dragging || dragging.group !== group) return;
          event.preventDefault();
          event.stopPropagation();
          var moving = dragging.key;
          node.classList.remove('cms-drop-before', 'cms-drop-after');
          if (moving === k) return;
          var where = side(event);
          order.splice(order.indexOf(moving), 1);
          var at = order.indexOf(k) + (where === 'after' ? 1 : 0);
          order.splice(at, 0, moving);
          commit();
        });
      });

      paint();
    });

    var total = groups.reduce(function (sum, group) { return sum + group.children.length; }, 0);
    status.textContent = total ? total + ' movable sections on this page.' : 'This page has no movable sections.';
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
      h('a', {class: 'btn primary', href: '#/chronicles/edit/new', text: '+ New post'})));

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
          h('p', {class: 'slug', text: storyUrl(c.slug).replace('https://', '')})),
        h('div', {class: 't-actions'},
          h('a', {class: 'btn', href: '#/chronicles/edit/' + c.id, text: 'Edit'}),
          published ? h('a', {class: 'btn', href: storyUrl(c.slug), target: '_blank', rel: 'noopener', text: 'View ↗'}) : null,
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

  // A short formatting bar, like a blog editor: paragraph, heading, bold,
  // italic, quote, list, and link.
  function blockTools(editor) {
    function block(tag) { return function () { document.execCommand('formatBlock', false, tag); }; }
    return h('div', {class: 'tools post-tools'},
      toolButton('Paragraph', 'Normal text', block('p')),
      toolButton('Heading', 'Section heading', block('h2')),
      toolButton(h('strong', {text: 'B'}), 'Bold', function () { document.execCommand('bold'); }),
      toolButton(h('em', {text: 'I'}), 'Italic', function () { document.execCommand('italic'); }),
      toolButton('“ Quote', 'Quote', block('blockquote')),
      toolButton('• List', 'Bulleted list', function () { document.execCommand('insertUnorderedList'); }),
      toolButton('Link', 'Add link', function () { addLink(editor); }));
  }

  function cleanBody(editor) {
    editor.querySelectorAll('h2:not([class])').forEach(function (el) { el.className = 'article-subhead'; });
    editor.querySelectorAll('[style]').forEach(function (el) { if (!el.closest('.booking-note')) el.removeAttribute('style'); });
    return editor.innerHTML.trim();
  }

  // Blog-style editor: title and story up front, Publish / Save draft at the
  // top, and everything else in a collapsed "Post settings" section that
  // fills itself in automatically.
  function renderChronicleEditor(id) {
    var existing = id === 'new' ? null : state.chronicles.find(function (c) { return c.id === id; });
    if (id !== 'new' && !existing) {
      setTitle('Chronicle not found', null);
      viewEl.append(h('p', {class: 'empty-line', text: 'That Chronicle no longer exists.'}), h('a', {class: 'btn', href: '#/chronicles', text: 'Back to Chronicles'}));
      return;
    }
    var c = existing || {title: '', slug: '', summary: '', body: '<p><br></p>', status: 'draft', published_at: '', category: '', kicker: '', deck: '', read_minutes: ''};
    var isPublished = c.status === 'published';
    setTitle(existing ? 'Edit post' : 'New post', isPublished ? storyUrl(c.slug) : null);

    var title = h('textarea', {class: 'post-title', rows: '1', placeholder: 'Add a title', 'aria-label': 'Title', maxlength: '200'});
    title.value = c.title;
    var body = h('div', {class: 'rich post-body', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Story', spellcheck: 'true', 'data-placeholder': 'Start writing your story…'});
    body.innerHTML = c.body || '<p><br></p>';
    plainPaste(body, false);
    var words = h('p', {class: 'post-count'});
    var error = h('p', {class: 'field-error', hidden: true});

    var summary = h('textarea', {id: 'c-summary', rows: '3', maxlength: '1000', placeholder: 'Leave blank to use the first sentences of the story.'});
    summary.value = c.summary || '';
    var slug = h('input', {type: 'text', id: 'c-slug', value: c.slug, maxlength: '100', spellcheck: 'false'});
    var slugPreview = h('p', {class: 'hint slug'});
    var category = h('input', {type: 'text', id: 'c-category', value: c.category || '', maxlength: '80', placeholder: 'For example: Flight Safety'});
    var date = h('input', {type: 'date', id: 'c-date', value: c.published_at || ''});
    var deck = h('input', {type: 'text', id: 'c-deck', value: c.deck || '', maxlength: '400', placeholder: 'Optional line shown under the title'});
    var slugTouched = !!existing;

    function wordCount() { var text = norm(body.textContent); return text ? text.split(' ').length : 0; }
    function autoSummary() {
      var text = norm(body.textContent);
      if (text.length <= 220) return text;
      var cut = text.slice(0, 220);
      return cut.slice(0, cut.lastIndexOf(' ')) + '…';
    }
    function update() {
      var count = wordCount();
      words.textContent = count.toLocaleString() + ' words · about ' + Math.max(1, Math.round(count / 200)) + ' minute read';
      slugPreview.textContent = storyUrl(slug.value || '…').replace('https://', '');
      title.style.height = 'auto';
      title.style.height = title.scrollHeight + 'px';
    }
    function dirty() { state.editorDirty = true; update(); }
    title.addEventListener('input', function () {
      title.value = title.value.replace(/\n/g, ' ');
      if (!slugTouched) slug.value = slugify(title.value);
      dirty();
    });
    title.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); body.focus(); } });
    slug.addEventListener('input', function () { slugTouched = true; slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); dirty(); });
    [summary, category, date, deck].forEach(function (input) { input.addEventListener('input', dirty); });
    body.addEventListener('input', dirty);

    function payload(statusValue) {
      return {
        title: norm(title.value), slug: slug.value.replace(/^-+|-+$/g, ''), deck: norm(deck.value), body: cleanBody(body),
        status: statusValue, published_at: date.value, category: norm(category.value),
        kicker: existing ? (c.kicker || '') : '',
        summary: summary.value.trim() || autoSummary(),
        read_minutes: Math.max(1, Math.round(wordCount() / 200))
      };
    }

    function save(statusValue, button) {
      error.hidden = true;
      var data = payload(statusValue);
      if (!data.title) { error.textContent = 'Please add a title.'; error.hidden = false; title.focus(); return; }
      if (!wordCount()) { error.textContent = 'The story is empty.'; error.hidden = false; body.focus(); return; }
      if (!data.slug) data.slug = slugify(data.title);
      if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = 'Saving…'; }
      var request = existing ? api('PUT', 'chronicles/' + encodeURIComponent(existing.id), data) : api('POST', 'chronicles', data);
      request
        .then(function (result) {
          state.editorDirty = false;
          return refresh().then(function () { return result.chronicle; });
        })
        .then(function (saved) {
          toast(saved.status === 'published' ? 'Published. It’s live on the website now.' : 'Draft saved. It isn’t on the website yet.');
          var target = '#/chronicles/edit/' + saved.id;
          if (location.hash !== target) location.hash = target; else route();
        })
        .catch(function (err) {
          error.textContent = err.message;
          error.hidden = false;
          if (button) { button.disabled = false; button.textContent = button.dataset.label; }
        });
    }

    function preview() {
      var data = payload(c.status);
      var frame = h('iframe', {class: 'preview-frame', title: 'Story preview'});
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/styles.css"></head><body>' +
        '<main><section class="view active" id="view-article"><header class="page-hero"><div class="section-label">Flight Instructor’s Chronicles</div><h1></h1><p></p></header>' +
        '<div class="page-content"><article class="article"></article></div></section></main></body></html>';
      frame.addEventListener('load', function () {
        var doc = frame.contentDocument;
        doc.querySelector('.page-hero h1').textContent = data.title || 'Untitled post';
        doc.querySelector('.page-hero p').textContent = data.summary || '';
        var article = doc.querySelector('.article');
        article.append(
          Object.assign(doc.createElement('div'), {className: 'article-kicker', textContent: data.kicker || ['By Jerry Marotta', data.category].filter(Boolean).join(' • ')}),
          Object.assign(doc.createElement('h1'), {textContent: data.title}));
        if (data.deck) article.append(Object.assign(doc.createElement('div'), {className: 'article-deck', textContent: data.deck}));
        var wrap = doc.createElement('div');
        wrap.innerHTML = data.body;
        wrap.querySelectorAll('script, iframe, object, embed').forEach(function (node) { node.remove(); });
        article.append.apply(article, Array.from(wrap.childNodes));
      });
      openModal('Preview', frame, [h('button', {type: 'button', class: 'btn primary', text: 'Close preview', onclick: function () { modal.close(); }})], true);
    }

    var primary = h('button', {type: 'button', class: 'btn primary', text: isPublished ? 'Update' : 'Publish'});
    primary.addEventListener('click', function () { save('published', primary); });
    var secondary = h('button', {type: 'button', class: 'btn', text: isPublished ? 'Unpublish' : 'Save draft'});
    secondary.addEventListener('click', function () { save('draft', secondary); });

    viewEl.append(
      h('div', {class: 'post-bar'},
        h('a', {class: 'back-link', href: '#/chronicles', text: '← All posts'}),
        h('span', {class: 'pill ' + (isPublished ? 'pill-live' : 'pill-draft'), text: isPublished ? 'Published' : (existing ? 'Draft' : 'New draft')}),
        h('div', {class: 'post-actions'},
          h('button', {type: 'button', class: 'btn ghost', text: 'Preview', onclick: preview}),
          secondary,
          primary)),
      error,
      h('div', {class: 'post-canvas'}, title, blockTools(body), body, words),
      h('details', {class: 'post-settings'},
        h('summary', null, h('strong', {text: 'Post settings'}), h('span', {class: 'muted small', text: ' Optional. These fill in automatically.'})),
        h('div', {class: 'settings-grid'},
          field('Summary', summary, 'Shown on the Chronicles page and the home page.'),
          h('div', {class: 'field'}, h('label', {for: 'c-slug', text: 'Web address'}), slug, slugPreview),
          field('Category', category, 'Shown on the post’s card.'),
          field('Publish date', date, 'Leave blank to use the day you publish.'),
          field('Subtitle', deck, null)),
        existing ? h('div', {class: 'danger-zone'},
          h('button', {type: 'button', class: 'btn danger-ghost', text: 'Delete this post', onclick: function () { deleteChronicle(existing); }})) : null));

    update();
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
