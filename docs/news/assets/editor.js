// The Villager News editor (news/editor/). Everything happens in the browser: an edition is kept as a draft
// in this browser (localStorage) while you work, and Publish downloads it as one JSON file to upload to
// docs/news/editions/ on GitHub. The "Build news" workflow then gives it its page at news/<slug>/.
import {
  renderPage,
  renderTicker,
  startTicker,
  layoutSlide,
  overflows,
  fontsReady,
  fit,
  loadEdition,
  loadIndex,
  plain,
  resolve,
  VILLAGERS,
  COLORS,
} from './news.js?v=4af17cf6';

const BASE = '../'; // the editor is at news/editor/, edition paths are relative to news/
const SITE_ROOT = '../../';
const REPO = 'mathijsboogaert/Voxel';
const LS = 'vn-editor:';
const $ = (id) => document.getElementById(id);

// ---- Small DOM helper -----------------------------------------------------------

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list' && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat())
    if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

const ICONS = {
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M8 8h12v12H8z"/><path d="M16 8V4H4v12h4"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const ibtn = (icon, label, onclick, disabled = false) =>
  h('button', {
    type: 'button',
    class: 'ne-ibtn',
    'aria-label': label,
    title: label,
    html: ICONS[icon],
    onclick,
    disabled,
  });

// ---- Templates ------------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2, 9);
const V = (i) => ({ ...VILLAGERS[i], name: undefined, flip: false });
const clean = (o) => JSON.parse(JSON.stringify(o));

/** Page layouts to start a new page from. */
const TEMPLATES = [
  {
    id: 'cover',
    name: 'Cover',
    note: 'The big Villager News sign',
    page: () => ({ layout: 'cover', sign: 'VILLAGER\nNEWS', ticker: false, villager: null, blocks: [] }),
  },
  {
    id: 'breaking',
    name: 'Breaking news',
    note: 'Headline and two paragraphs, reporter villager',
    page: () => ({
      sign: 'BREAKING NEWS!',
      villager: V(0),
      blocks: [
        { type: 'lead', text: 'Something big just happened on Voxel!' },
        {
          type: 'text',
          text: 'Tell the story here. Use **double stars** for bold and *single stars* for italic.',
        },
        { type: 'text', text: 'Add a second paragraph with the details.' },
      ],
    }),
  },
  {
    id: 'event',
    name: 'Event announcement',
    note: 'A date or time in big letters',
    page: () => ({
      sign: 'EVENT ANNOUNCED!',
      villager: V(3),
      blocks: [
        { type: 'lead', text: 'That’s right!' },
        { type: 'text', text: 'What is happening, and why everyone should come:' },
        { type: 'big', text: 'Saturday at 20:00!', color: 'red' },
        { type: 'text', text: 'Where to meet, and what to bring.' },
      ],
    }),
  },
  {
    id: 'shops',
    name: 'Two shops',
    note: 'Side by side, with shop icons',
    page: () => ({
      sign: 'NEW SHOPS IN THE SHOPPING DISTRICT',
      villager: null,
      blocks: [
        {
          type: 'columns',
          cols: [
            {
              icon: '',
              lead: 'First shop headline,',
              text: 'Who opened it, what it sells and for how much.',
            },
            {
              icon: '',
              lead: 'Second shop headline!',
              text: 'Who opened it, what it sells and for how much.',
            },
          ],
        },
      ],
    }),
  },
  {
    id: 'spotlight',
    name: 'Spotlight with callout',
    note: 'Columns plus a highlighted note',
    page: () => ({
      sign: 'SPOTLIGHT',
      villager: null,
      blocks: [
        {
          type: 'columns',
          size: 's',
          cols: [
            { icon: '', lead: 'Headline,', text: 'Story.' },
            { icon: '', lead: 'Headline!', text: 'Story.' },
          ],
        },
        {
          type: 'callout',
          icon: '',
          lead: 'A short highlight, like a badge someone earned.',
          text: 'A playful follow-up line.',
        },
      ],
    }),
  },
  {
    id: 'chips',
    name: 'List with icons',
    note: 'Badges, items, winners…',
    page: () => ({
      sign: 'THE LIST',
      villager: null,
      blocks: [
        { type: 'text', text: 'An introduction to the list:' },
        { type: 'lead', text: 'The big reveal!', size: 'l' },
        {
          type: 'chips',
          items: [
            { icon: '', label: 'First' },
            { icon: '', label: 'Second' },
            { icon: '', label: 'Third' },
          ],
        },
      ],
    }),
  },
  {
    id: 'rules',
    name: 'Rules or definitions',
    note: 'Term on the left, explanation on the right',
    page: () => ({
      sign: 'THE RULES',
      villager: null,
      blocks: [
        {
          type: 'list',
          items: [
            { term: 'Rule one:', text: 'What it means.' },
            { term: 'Rule two:', text: 'What it means.' },
          ],
        },
      ],
    }),
  },
  {
    id: 'arrival',
    name: 'New arrival',
    note: 'Welcome a new player',
    page: () => ({
      sign: 'NEW ARRIVAL ON VOXEL',
      villager: V(2),
      blocks: [
        { type: 'lead', text: 'And that’s not all the server news!' },
        { type: 'text', text: 'We’ve welcomed a new member to our server:' },
        { type: 'big', text: 'PlayerName (Name)' },
        { type: 'lead', text: 'Welcome to Voxel!', color: 'ink' },
      ],
    }),
  },
  {
    id: 'photo',
    name: 'Photo',
    note: 'A screenshot with a caption',
    page: () => ({
      sign: 'SPOTTED ON VOXEL',
      villager: null,
      blocks: [{ type: 'image', src: '', caption: 'What we see here.', h: 520 }],
    }),
  },
  {
    id: 'weather',
    name: 'Weather',
    note: 'The forecast, villager with arms crossed',
    page: () => ({
      sign: 'AND NOW, THE WEATHER',
      villager: V(4),
      blocks: [
        { type: 'text', text: 'Before we wrap things up, the forecast is **rain again**.', size: 's' },
        { type: 'lead', text: 'What a surprise!' },
        { type: 'text', text: 'Don’t forget your umbrellas.', size: 's' },
      ],
    }),
  },
  {
    id: 'signoff',
    name: 'Sign-off',
    note: 'Until next week!',
    page: () => ({
      sign: 'Well, that’s it for this edition of Villager News!',
      transition: 'fade',
      villager: V(1),
      blocks: [{ type: 'big', text: 'Until next week!', size: 'l' }],
    }),
  },
  {
    id: 'blank',
    name: 'Blank',
    note: 'Just a sign and a card',
    page: () => ({ sign: 'HEADLINE', villager: null, blocks: [{ type: 'text', text: 'New paragraph.' }] }),
  },
];

function newPage(tpl) {
  const p = {
    id: uid(),
    layout: 'story',
    sign: '',
    transition: 'push',
    ticker: true,
    villager: null,
    blocks: [],
    ...clean(tpl),
  };
  p.id = uid();
  return p;
}

const BLOCKS = {
  lead: { name: 'Headline', make: () => ({ type: 'lead', text: 'Headline' }) },
  text: { name: 'Paragraph', make: () => ({ type: 'text', text: 'New paragraph.' }) },
  big: { name: 'Big line', note: 'Minecraft font', make: () => ({ type: 'big', text: 'Big news!' }) },
  columns: {
    name: 'Columns',
    note: '2 or 3 side by side',
    make: () => ({
      type: 'columns',
      cols: [
        { icon: '', lead: 'Headline', text: 'Text' },
        { icon: '', lead: 'Headline', text: 'Text' },
      ],
    }),
  },
  callout: {
    name: 'Callout',
    note: 'Highlighted box with icon',
    make: () => ({ type: 'callout', icon: '', lead: 'A highlight', text: '' }),
  },
  chips: {
    name: 'Icon list',
    note: 'Small labels with icons',
    make: () => ({ type: 'chips', items: [{ icon: '', label: 'Label' }] }),
  },
  list: {
    name: 'Rules list',
    note: 'Term + explanation',
    make: () => ({ type: 'list', items: [{ term: 'Term:', text: 'Explanation.' }] }),
  },
  image: {
    name: 'Image',
    note: 'Screenshot or photo',
    make: () => ({ type: 'image', src: '', caption: '', h: 480 }),
  },
};

const DEFAULT_TICKER = {
  label: 'Villager News',
  items: ['Breaking: nothing happened', 'Squid declines interview'],
};

const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
};
const slugify = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// ---- State ----------------------------------------------------------------------

let ed = null; // the edition being edited
let cur = 0; // current page
let sel = null; // selected block index on the current page, or 'sign' / 'badge'
const open = new Set(); // block cards that are folded open (by object)
let past = [];
let future = [];
let lastKey = null;
let lastTime = 0;
let index = []; // published editions

const page = () => ed.pages[cur];

/** Change the edition. Coalesces typing in one field (same key) into one undo step. */
function change(fn, { key = null, panel = false, thumbs = 'cur', preview = true } = {}) {
  const now = Date.now();
  if (!(key && key === lastKey && now - lastTime < 1200)) {
    past.push(JSON.stringify({ ed, cur }));
    if (past.length > 200) past.shift();
    future = [];
  }
  lastKey = key;
  lastTime = now;
  fn();
  cur = Math.max(0, Math.min(ed.pages.length - 1, cur));
  save();
  if (preview) renderPreview();
  if (thumbs === 'all') renderThumbs();
  else if (thumbs === 'cur') renderThumb(cur);
  if (panel) renderPanel();
  updateHistory();
}

function undo() {
  if (!past.length) return;
  future.push(JSON.stringify({ ed, cur }));
  ({ ed, cur } = JSON.parse(past.pop()));
  lastKey = null;
  afterLoad(false);
}
function redo() {
  if (!future.length) return;
  past.push(JSON.stringify({ ed, cur }));
  ({ ed, cur } = JSON.parse(future.pop()));
  lastKey = null;
  afterLoad(false);
}
function updateHistory() {
  $('undo').disabled = !past.length;
  $('redo').disabled = !future.length;
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS + 'draft', JSON.stringify({ ed, at: Date.now() }));
      status(
        `Draft saved in this browser · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      );
    } catch {
      status('Couldn’t save the draft here (too many big images?). Download it to be safe.');
    }
  }, 300);
}
const status = (t) => ($('status').textContent = t);

function load(edition, { keepHistory = false } = {}) {
  ed = edition;
  ed.v = 1;
  ed.ticker = ed.ticker || clean(DEFAULT_TICKER);
  ed.pages = (ed.pages || []).map((p) => ({ id: p.id || uid(), ...p }));
  if (!ed.pages.length) ed.pages.push(newPage(TEMPLATES[0].page()));
  cur = 0;
  sel = null;
  open.clear();
  if (!keepHistory) {
    past = [];
    future = [];
  }
  afterLoad();
  save();
}

function afterLoad(resetSel = true) {
  if (resetSel) sel = null;
  cur = Math.max(0, Math.min(ed.pages.length - 1, cur));
  $('title').value = ed.title || '';
  renderThumbs();
  renderPreview();
  renderPanel();
  renderEditionPanel();
  renderTickerPanel();
  updateHistory();
  history.replaceState(null, '', ed.slug ? `?e=${encodeURIComponent(ed.slug)}` : location.pathname);
}

// ---- Preview ----------------------------------------------------------------------

const stage = $('stage');
const box = $('canvasBox');
let ticker = null;
let k = 1;

function renderTickerEl() {
  ticker?.remove();
  ticker = renderTicker(ed.ticker);
  stage.appendChild(ticker);
  startTicker(ticker, false);
}

function renderPreview() {
  const p = page();
  stage.querySelectorAll('.vn-slide, .vn-front').forEach((n) => n.remove());
  const { slide, front } = renderPage(p, ed, { base: BASE });
  stage.prepend(slide, front);
  if (!ticker || ticker.dataset.sig !== JSON.stringify(ed.ticker)) {
    renderTickerEl();
    ticker.dataset.sig = JSON.stringify(ed.ticker);
  }
  ticker.classList.toggle('off', p.layout === 'cover' || p.ticker === false);
  layoutSlide(slide);
  $('warn').hidden = !overflows(slide);
  markSelection();
  const v = front.querySelector('.vn-villager');
  if (v) dragVillager(v);
}

function markSelection() {
  stage.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
  let t = null;
  if (typeof sel === 'number') t = stage.querySelector(`[data-block="${sel}"]`);
  else if (sel === 'sign') t = stage.querySelector('[data-sign], .vn-cover-title');
  else if (sel === 'badge') t = stage.querySelector('.vn-badge');
  t?.classList.add('is-selected');
}

function refit() {
  k = fit(stage, box);
}
new ResizeObserver(refit).observe(box);

stage.addEventListener('click', (e) => {
  const b = e.target.closest('[data-block]');
  if (b) return select(+b.dataset.block, true);
  if (e.target.closest('[data-sign], .vn-cover-title')) return select('sign', true);
  if (e.target.closest('.vn-badge')) return select('badge', true);
  select(null);
});

function select(what, focus = false) {
  sel = what;
  showTab('page');
  markSelection();
  document
    .querySelectorAll('.ne-block')
    .forEach((c) => c.classList.toggle('is-selected', +c.dataset.i === what && typeof what === 'number'));
  if (typeof what === 'number') {
    const blk = page().blocks[what];
    if (blk && !open.has(blk)) {
      open.add(blk);
      renderPanel();
    }
    const card = document.querySelector(`.ne-block[data-i="${what}"]`);
    card?.classList.add('is-selected');
    if (focus) {
      card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      card?.querySelector('textarea, input[type="text"]')?.focus({ preventScroll: true });
    }
  } else if (what === 'sign' || what === 'badge') {
    const f = $(what === 'sign' ? 'f-sign' : 'f-badge');
    f?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (focus) f?.focus({ preventScroll: true });
  }
}

/** Drag the villager around the slide; it lands where you let go. */
function dragVillager(img) {
  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    img.setPointerCapture(e.pointerId);
    img.classList.add('is-dragging');
    const v = page().villager;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = +v.x || 0;
    const oy = +v.y || 0;
    let nx = ox;
    let ny = oy;
    const move = (ev) => {
      nx = Math.round(ox + (ev.clientX - sx) / k);
      ny = Math.round(oy + (ev.clientY - sy) / k);
      img.style.left = nx + 'px';
      img.style.top = ny + 'px';
    };
    const up = () => {
      img.removeEventListener('pointermove', move);
      img.classList.remove('is-dragging');
      if (nx !== ox || ny !== oy) change(() => Object.assign(page().villager, { x: nx, y: ny }));
    };
    img.addEventListener('pointermove', move);
    img.addEventListener('pointerup', up, { once: true });
    img.addEventListener('pointercancel', up, { once: true });
  });
}

// ---- Page thumbnails -----------------------------------------------------------------

const thumbs = $('thumbs');
let dragFrom = null;

function thumb(i) {
  const p = ed.pages[i];
  const s = h('div', { class: 'vn-stage' });
  const { slide, front } = renderPage(p, ed, { base: BASE });
  s.append(slide, front);
  const t = renderTicker({ label: ed.ticker.label, items: [] });
  if (p.layout === 'cover' || p.ticker === false) t.classList.add('off');
  s.appendChild(t);
  const frame = h('div', { class: 'ne-thumb__frame' }, s);
  const li = h(
    'li',
    {
      class: 'ne-thumb',
      draggable: 'true',
      'aria-current': String(i === cur),
      tabindex: '0',
      'aria-label': `Page ${i + 1}: ${plain(p.sign).replace(/\n/g, ' ') || p.layout}`,
      onclick: () => goTo(i),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goTo(i);
        }
      },
    },
    h('span', { class: 'ne-thumb__n' }, String(i + 1)),
    frame,
    h(
      'div',
      { class: 'ne-thumb__tools', onclick: (e) => e.stopPropagation() },
      ibtn('up', 'Move page up', () => movePage(i, i - 1), i === 0),
      ibtn('down', 'Move page down', () => movePage(i, i + 1), i === ed.pages.length - 1),
      ibtn('copy', 'Duplicate page', () => duplicatePage(i)),
      ibtn('del', 'Delete page', () => deletePage(i), ed.pages.length < 2),
    ),
  );
  li.addEventListener('dragstart', (e) => {
    dragFrom = i;
    li.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('is-dragging');
    thumbs
      .querySelectorAll('.drop-before, .drop-after')
      .forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  });
  li.addEventListener('dragover', (e) => {
    if (dragFrom === null) return;
    e.preventDefault();
    const r = li.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    thumbs
      .querySelectorAll('.drop-before, .drop-after')
      .forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  li.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dragFrom === null) return;
    const after = li.classList.contains('drop-after');
    let to = i + (after ? 1 : 0);
    if (dragFrom < to) to--;
    const from = dragFrom;
    dragFrom = null;
    if (from !== to) movePage(from, to);
  });
  return { li, slide };
}

function renderThumbs() {
  thumbs.replaceChildren();
  ed.pages.forEach((_, i) => {
    const { li, slide } = thumb(i);
    thumbs.appendChild(li);
    layoutSlide(slide);
    li.classList.toggle('is-over', overflows(slide));
  });
}

function renderThumb(i) {
  const old = thumbs.children[i];
  if (!old) return renderThumbs();
  const { li, slide } = thumb(i);
  old.replaceWith(li);
  layoutSlide(slide);
  li.classList.toggle('is-over', overflows(slide));
}

function goTo(i) {
  if (i === cur) return;
  cur = i;
  sel = null;
  [...thumbs.children].forEach((li, j) => li.setAttribute('aria-current', String(j === cur)));
  thumbs.children[cur]?.scrollIntoView({ block: 'nearest' });
  renderPreview();
  renderPanel();
}

function movePage(from, to) {
  if (to < 0 || to >= ed.pages.length) return;
  change(
    () => {
      const [p] = ed.pages.splice(from, 1);
      ed.pages.splice(to, 0, p);
      cur = to;
    },
    { thumbs: 'all', panel: true },
  );
}
function duplicatePage(i) {
  change(
    () => {
      const copy = clean(ed.pages[i]);
      copy.id = uid();
      ed.pages.splice(i + 1, 0, copy);
      cur = i + 1;
    },
    { thumbs: 'all', panel: true },
  );
}
function deletePage(i) {
  if (ed.pages.length < 2) return;
  change(
    () => {
      ed.pages.splice(i, 1);
      if (cur >= i && cur > 0) cur--;
    },
    { thumbs: 'all', panel: true },
  );
  status('Page deleted. Undo with Ctrl+Z.');
}
function insertPage(p) {
  change(
    () => {
      ed.pages.splice(cur + 1, 0, newPage(p));
      cur++;
      sel = null;
    },
    { thumbs: 'all', panel: true },
  );
}

// ---- Popover menu ---------------------------------------------------------------------

const menu = $('menu');
function showMenu(anchor, build) {
  menu.replaceChildren();
  build(menu);
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.left)) + 'px';
  menu.style.top = (r.bottom + mh + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - mh - 4)) + 'px';
  menu.querySelector('button')?.focus();
}
const hideMenu = () => (menu.hidden = true);
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[aria-haspopup]')) hideMenu();
});
const menuItem = (name, note, onclick) =>
  h(
    'button',
    { type: 'button', onclick: () => (hideMenu(), onclick()) },
    h('b', {}, name),
    note ? h('small', {}, note) : null,
  );

function myTemplates() {
  try {
    return JSON.parse(localStorage.getItem(LS + 'templates') || '[]');
  } catch {
    return [];
  }
}

$('addPage').addEventListener('click', (e) =>
  showMenu(e.currentTarget, (m) => {
    m.append(h('h4', {}, 'Layouts'));
    for (const t of TEMPLATES) m.append(menuItem(t.name, t.note, () => insertPage(t.page())));
    const mine = myTemplates();
    if (mine.length) {
      m.append(h('h4', {}, 'Your templates'));
      mine.forEach((t, i) =>
        m.append(
          h(
            'div',
            { class: 'ne-menu__row' },
            menuItem(t.name, 'Saved in this browser', () => insertPage(t.page)),
            ibtn('x', `Remove template ${t.name}`, () => {
              const list = myTemplates();
              list.splice(i, 1);
              localStorage.setItem(LS + 'templates', JSON.stringify(list));
              hideMenu();
            }),
          ),
        ),
      );
    }
  }),
);

// ---- Images and icons -----------------------------------------------------------------------

/** Reads an image file as a data URL: small pixel art as-is, photos scaled down to 1600 px and compressed. */
function readImage(file, max = 1600) {
  return new Promise((ok, fail) => {
    const fr = new FileReader();
    fr.onerror = fail;
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => fail(new Error('Not an image'));
      img.onload = () => {
        if (Math.max(img.width, img.height) <= 256 || file.type === 'image/gif') return ok(fr.result);
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const webp = c.toDataURL('image/webp', 0.85);
        ok(webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function pickFile(accept = 'image/*') {
  return new Promise((ok) => {
    const f = $('file');
    f.accept = accept;
    f.value = '';
    f.onchange = () => ok(f.files[0] || null);
    f.click();
  });
}
async function uploadImage(max) {
  const file = await pickFile();
  if (!file) return null;
  try {
    return await readImage(file, max);
  } catch {
    status('That file isn’t an image.');
    return null;
  }
}

let iconLib = null;
async function icons() {
  if (iconLib) return iconLib;
  const get = (u) =>
    fetch(u)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  const [shops, badges] = await Promise.all([
    get(SITE_ROOT + 'shops.json'),
    get(SITE_ROOT + 'data/badges.json'),
  ]);
  const tiers = ['bronze', 'silver', 'gold', 'diamond'];
  iconLib = {
    Shops: (shops || []).filter((s) => s.icon).map((s) => ({ src: s.icon, name: s.label })),
    Badges: (badges?.badges || []).flatMap((b) =>
      tiers.map((t) => ({
        src: `../assets/voxel-badges/${t}_${b.id}.png`,
        name: `${t[0].toUpperCase() + t.slice(1)} ${b.name}`,
      })),
    ),
  };
  return iconLib;
}

function iconField(value, onPick) {
  const btn = h('button', {
    type: 'button',
    class: 'ne-iconbtn' + (value ? ' has-icon' : ''),
    'aria-haspopup': 'true',
    'aria-label': value ? 'Change icon' : 'Choose an icon',
    title: value ? 'Change icon' : 'Choose an icon',
    html: value ? `<img src="${resolve(value, BASE)}" alt="">` : 'Icon',
  });
  btn.onclick = async () => {
    const lib = await icons();
    showMenu(btn, (m) => {
      for (const [group, list] of Object.entries(lib)) {
        if (!list.length) continue;
        m.append(h('h4', {}, group));
        m.append(
          h(
            'div',
            { class: 'ne-icongrid' },
            list.map((ic) =>
              h(
                'button',
                {
                  type: 'button',
                  title: ic.name,
                  'aria-label': ic.name,
                  onclick: () => (hideMenu(), onPick(ic.src)),
                },
                h('img', { src: resolve(ic.src, BASE), alt: '' }),
              ),
            ),
          ),
        );
      }
      m.append(h('h4', {}, 'Other'));
      m.append(
        menuItem('Upload an image…', 'PNG pixel art stays sharp', async () => {
          const src = await uploadImage(400);
          if (src) onPick(src);
        }),
      );
      if (value) m.append(menuItem('No icon', null, () => onPick('')));
    });
  };
  return btn;
}

// ---- Form fields -----------------------------------------------------------------------------

let fieldN = 0;
function textField(label, value, onInput, { rows = 0, hint = '', key, id, placeholder = '' } = {}) {
  const fid = id || 'f' + ++fieldN;
  const input = rows
    ? h('textarea', { id: fid, rows, placeholder })
    : h('input', { id: fid, type: 'text', placeholder });
  input.value = value ?? '';
  input.addEventListener('input', () => onInput(input.value, key || fid));
  return h(
    'div',
    { class: 'ne-field' },
    label ? h('label', { for: fid, class: 'ne-label' }, label) : null,
    input,
    hint ? h('small', {}, hint) : null,
  );
}
function seg(options, value, onPick, label) {
  return h(
    'div',
    { class: 'ne-seg', role: 'group', 'aria-label': label },
    Object.entries(options).map(([v, name]) =>
      h(
        'button',
        { type: 'button', 'aria-pressed': String(v === String(value)), onclick: () => onPick(v) },
        name,
      ),
    ),
  );
}
function check(label, value, onToggle) {
  const c = h('input', { type: 'checkbox' });
  c.checked = !!value;
  c.addEventListener('change', () => onToggle(c.checked));
  return h('label', { class: 'ne-check' }, c, label);
}
function range(label, value, min, max, step, onInput, unit = '') {
  const out = h('output', {}, value + unit);
  const r = h('input', { type: 'range', min, max, step, 'aria-label': label });
  r.value = value;
  r.addEventListener('input', () => {
    out.textContent = r.value + unit;
    onInput(+r.value);
  });
  return h('div', { class: 'ne-range' }, h('span', {}, label), r, out);
}
const section = (title, ...kids) =>
  h(
    'div',
    { class: 'ne-section' },
    title ? h('div', { class: 'ne-section__head' }, h('h3', {}, title)) : null,
    ...kids,
  );
const MARKUP = 'Use **bold**, *italic* and Enter for a new line.';

// ---- Page panel -------------------------------------------------------------------------------

function renderPanel() {
  const panel = $('panel-page');
  const p = page();
  const edit = (fn, opts = {}) => change(fn, opts);
  const typing = (fn) => (v, key) => change(() => fn(v), { key });
  const isCover = p.layout === 'cover';

  const head = section(
    `Page ${cur + 1} of ${ed.pages.length}`,
    h(
      'div',
      { class: 'ne-field' },
      h('span', {}, 'Layout'),
      seg({ story: 'Story', cover: 'Cover' }, p.layout || 'story', (v) =>
        edit(
          () => {
            p.layout = v;
            if (v === 'cover' && !p.sign) p.sign = 'VILLAGER\nNEWS';
          },
          { panel: true },
        ),
      ),
    ),
    textField(
      isCover ? 'Sign title' : 'Sign',
      p.sign,
      typing((v) => (p.sign = v)),
      {
        rows: 2,
        id: 'f-sign',
        hint: isCover ? 'Enter for a new line.' : 'The wooden sign in the top left. It grows with the text.',
      },
    ),
    isCover
      ? textField(
          'Edition badge',
          p.badge ?? '',
          typing((v) => (p.badge = v || undefined)),
          {
            id: 'f-badge',
            placeholder: ed.edition || 'Special Edition',
            hint: 'Empty uses the edition name from the Edition tab.',
          },
        )
      : null,
    isCover ? check('Show Angela holding the sign', p.host !== false, (v) => edit(() => (p.host = v))) : null,
    h(
      'div',
      { class: 'ne-row' },
      h(
        'div',
        { class: 'ne-field' },
        h('span', {}, 'Comes in with'),
        seg({ push: 'Slide', fade: 'Fade' }, p.transition || 'push', (v) =>
          edit(() => (p.transition = v), { panel: true, thumbs: false }),
        ),
      ),
      !isCover
        ? h(
            'div',
            { class: 'ne-field' },
            h('span', {}, 'News bar'),
            seg({ true: 'Show', false: 'Hide' }, String(p.ticker !== false), (v) =>
              edit(() => (p.ticker = v === 'true'), { panel: true }),
            ),
          )
        : null,
    ),
  );

  // Villager
  const v = p.villager;
  const vgrid = h(
    'div',
    { class: 'ne-villagers' },
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(!v),
        onclick: () => edit(() => (p.villager = null), { panel: true }),
      },
      'None',
    ),
    VILLAGERS.map((vl, i) =>
      h(
        'button',
        {
          type: 'button',
          title: vl.name,
          'aria-label': vl.name,
          'aria-pressed': String(v?.src === vl.src),
          onclick: () => edit(() => (p.villager = { ...V(i), flip: v?.flip || false }), { panel: true }),
        },
        h('img', { src: resolve(vl.src, BASE), alt: '' }),
      ),
    ),
    v && !VILLAGERS.some((x) => x.src === v.src)
      ? h(
          'button',
          { type: 'button', 'aria-pressed': 'true', title: 'Your own picture' },
          h('img', { src: resolve(v.src, BASE), alt: '' }),
        )
      : null,
    h(
      'button',
      {
        type: 'button',
        title: 'Upload your own picture (PNG with a see-through background works best)',
        onclick: async () => {
          const src = await uploadImage(900);
          if (src) edit(() => (p.villager = { src, x: 1380, y: 560, w: 460, flip: false }), { panel: true });
        },
      },
      '+ Own',
    ),
  );
  const vsec = section('Villager', vgrid);
  if (v) {
    vsec.append(
      check('Mirror', v.flip, (val) => edit(() => (v.flip = val))),
      range('Size', +v.w || 440, 200, 900, 10, (val) => change(() => (v.w = val), { key: 'vsize' }), ' px'),
      h(
        'div',
        { class: 'ne-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'ne-btn ne-btn--small',
            onclick: () =>
              edit(
                () => {
                  const d = VILLAGERS.find((x) => x.src === v.src) || { x: 1380, y: 560, w: 460 };
                  Object.assign(v, { x: d.x, y: d.y, w: d.w });
                },
                { panel: true },
              ),
          },
          'Reset position',
        ),
        h('span', { class: 'ne-small' }, 'Drag it on the slide to move it.'),
      ),
    );
  }

  // Content blocks
  let content = null;
  if (!isCover) {
    const list = h('div', { class: 'ne-blocks' });
    (p.blocks || []).forEach((b, i) => list.appendChild(blockCard(p, b, i)));
    const add = h(
      'button',
      { type: 'button', class: 'ne-btn ne-btn--small', 'aria-haspopup': 'true' },
      '+ Add block',
    );
    add.onclick = () =>
      showMenu(add, (m) => {
        for (const [, d] of Object.entries(BLOCKS))
          m.append(
            menuItem(d.name, d.note, () => {
              const b = d.make();
              open.add(b);
              const at = typeof sel === 'number' ? sel + 1 : p.blocks.length;
              edit(() => p.blocks.splice(at, 0, b), { panel: true });
              select(at, true);
            }),
          );
      });
    content = section('Content', list, h('div', { class: 'ne-row', style: 'margin-top:8px' }, add));
  }

  const tools = section(
    null,
    h(
      'div',
      { class: 'ne-row' },
      h(
        'button',
        { type: 'button', class: 'ne-btn ne-btn--small', onclick: () => duplicatePage(cur) },
        'Duplicate page',
      ),
      h(
        'button',
        { type: 'button', class: 'ne-btn ne-btn--small', onclick: saveTemplate },
        'Save as template',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ne-btn ne-btn--small ne-btn--danger',
          onclick: () => deletePage(cur),
          disabled: ed.pages.length < 2,
        },
        'Delete page',
      ),
    ),
  );

  panel.replaceChildren(head, vsec, content || '', tools);
}

function saveTemplate() {
  const name = prompt('Name for this template:', plain(page().sign).slice(0, 40) || 'My layout');
  if (!name) return;
  const tpl = clean(page());
  delete tpl.id;
  const list = myTemplates();
  list.push({ name, page: tpl });
  try {
    localStorage.setItem(LS + 'templates', JSON.stringify(list));
    status(`Saved “${name}”. Find it under + Add page.`);
  } catch {
    status('Couldn’t save the template (too big?).');
  }
}

function peek(b) {
  return plain(
    b.text ||
      b.lead ||
      b.caption ||
      b.cols?.map((c) => c.lead || c.text).join(' · ') ||
      b.items?.map((x) => x.label || x.term).join(' · ') ||
      '',
  );
}

function blockCard(p, b, i) {
  const edit = (fn, opts = {}) => change(fn, opts);
  const typing = (fn) => (v, key) => change(() => fn(v), { key });
  const blocks = p.blocks;
  const card = h('div', {
    class: 'ne-block' + (open.has(b) ? ' is-open' : '') + (sel === i ? ' is-selected' : ''),
    'data-i': i,
  });
  const headEl = h(
    'div',
    {
      class: 'ne-block__head',
      onclick: (e) => {
        if (e.target.closest('button')) return;
        open.has(b) ? open.delete(b) : open.add(b);
        card.classList.toggle('is-open', open.has(b));
        sel = i;
        markSelection();
        document.querySelectorAll('.ne-block').forEach((c) => c.classList.toggle('is-selected', c === card));
      },
    },
    h('span', { class: 'ne-block__type' }, BLOCKS[b.type]?.name || b.type),
    h('span', { class: 'ne-block__peek' }, peek(b)),
    ibtn(
      'up',
      'Move up',
      () => edit(() => blocks.splice(i - 1, 0, blocks.splice(i, 1)[0]), { panel: true }),
      i === 0,
    ),
    ibtn(
      'down',
      'Move down',
      () => edit(() => blocks.splice(i + 1, 0, blocks.splice(i, 1)[0]), { panel: true }),
      i === blocks.length - 1,
    ),
    ibtn('copy', 'Duplicate', () => edit(() => blocks.splice(i + 1, 0, clean(b)), { panel: true })),
    ibtn('del', 'Delete', () => {
      edit(() => blocks.splice(i, 1), { panel: true });
      sel = null;
      markSelection();
    }),
  );
  const body = h('div', { class: 'ne-block__body' });
  const T = (v) => typing(v);

  if (b.type === 'lead' || b.type === 'text' || b.type === 'big') {
    body.append(
      textField(
        null,
        b.text,
        T((v) => (b.text = v)),
        { rows: b.type === 'text' ? 4 : 2, hint: MARKUP },
      ),
      h(
        'div',
        { class: 'ne-row' },
        seg(
          { s: 'S', m: 'M', l: 'L' },
          b.size || 'm',
          (v) => edit(() => (b.size = v === 'm' ? undefined : v), { panel: true }),
          'Size',
        ),
        seg(
          { left: 'Left', center: 'Center' },
          b.align || 'left',
          (v) => edit(() => (b.align = v === 'left' ? undefined : v), { panel: true }),
          'Align',
        ),
        colorSelect(b, edit),
      ),
    );
  } else if (b.type === 'columns') {
    const items = h('div', { class: 'ne-items' });
    b.cols.forEach((c, j) =>
      items.append(
        h(
          'div',
          { class: 'ne-item' },
          iconField(c.icon, (src) => edit(() => (c.icon = src), { panel: true })),
          h(
            'div',
            { class: 'ne-item__fields' },
            textField(
              null,
              c.lead,
              T((v) => (c.lead = v)),
              { placeholder: 'Headline' },
            ),
            textField(
              null,
              c.text,
              T((v) => (c.text = v)),
              { rows: 4, placeholder: 'Text' },
            ),
          ),
          h(
            'div',
            { class: 'ne-item__tools' },
            ibtn(
              'up',
              'Move left',
              () => edit(() => b.cols.splice(j - 1, 0, b.cols.splice(j, 1)[0]), { panel: true }),
              j === 0,
            ),
            ibtn(
              'del',
              'Remove column',
              () => edit(() => b.cols.splice(j, 1), { panel: true }),
              b.cols.length < 2,
            ),
          ),
        ),
      ),
    );
    body.append(
      items,
      h(
        'div',
        { class: 'ne-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'ne-btn ne-btn--small',
            disabled: b.cols.length >= 3,
            onclick: () =>
              edit(() => b.cols.push({ icon: '', lead: 'Headline', text: 'Text' }), { panel: true }),
          },
          '+ Column',
        ),
        seg(
          { s: 'S', m: 'M', l: 'L' },
          b.size || 'm',
          (v) => edit(() => (b.size = v === 'm' ? undefined : v), { panel: true }),
          'Text size',
        ),
      ),
      h('small', { class: 'ne-small' }, MARKUP),
    );
  } else if (b.type === 'callout') {
    body.append(
      h(
        'div',
        { class: 'ne-item' },
        iconField(b.icon, (src) => edit(() => (b.icon = src), { panel: true })),
        h(
          'div',
          { class: 'ne-item__fields' },
          textField(
            null,
            b.lead,
            T((v) => (b.lead = v)),
            { rows: 2, placeholder: 'Bold line' },
          ),
          textField(
            null,
            b.text,
            T((v) => (b.text = v)),
            { rows: 2, placeholder: 'Italic line (optional)' },
          ),
        ),
        h('span'),
      ),
    );
  } else if (b.type === 'chips' || b.type === 'list') {
    const isChips = b.type === 'chips';
    const items = h('div', { class: 'ne-items' });
    b.items.forEach((it, j) =>
      items.append(
        h(
          'div',
          { class: 'ne-item' },
          isChips ? iconField(it.icon, (src) => edit(() => (it.icon = src), { panel: true })) : h('span'),
          h(
            'div',
            { class: 'ne-item__fields' },
            isChips
              ? textField(
                  null,
                  it.label,
                  T((v) => (it.label = v)),
                  { placeholder: 'Label' },
                )
              : [
                  textField(
                    null,
                    it.term,
                    T((v) => (it.term = v)),
                    { placeholder: 'Term, like “Road:”' },
                  ),
                  textField(
                    null,
                    it.text,
                    T((v) => (it.text = v)),
                    { rows: 3, placeholder: 'Explanation' },
                  ),
                ],
          ),
          h(
            'div',
            { class: 'ne-item__tools' },
            ibtn(
              'up',
              'Move up',
              () => edit(() => b.items.splice(j - 1, 0, b.items.splice(j, 1)[0]), { panel: true }),
              j === 0,
            ),
            ibtn(
              'down',
              'Move down',
              () => edit(() => b.items.splice(j + 1, 0, b.items.splice(j, 1)[0]), { panel: true }),
              j === b.items.length - 1,
            ),
            ibtn('del', 'Remove', () => edit(() => b.items.splice(j, 1), { panel: true })),
          ),
        ),
      ),
    );
    body.append(
      items,
      h(
        'button',
        {
          type: 'button',
          class: 'ne-btn ne-btn--small',
          onclick: () =>
            edit(
              () =>
                b.items.push(
                  isChips ? { icon: '', label: 'Label' } : { term: 'Term:', text: 'Explanation.' },
                ),
              { panel: true },
            ),
        },
        isChips ? '+ Label' : '+ Row',
      ),
    );
  } else if (b.type === 'image') {
    body.append(
      h(
        'div',
        { class: 'ne-row', style: 'margin-bottom:12px' },
        h(
          'button',
          {
            type: 'button',
            class: 'ne-btn ne-btn--small',
            onclick: async () => {
              const src = await uploadImage(1600);
              if (src) edit(() => (b.src = src), { panel: true });
            },
          },
          b.src ? 'Replace image' : 'Upload image',
        ),
        b.src
          ? h(
              'button',
              {
                type: 'button',
                class: 'ne-btn ne-btn--small ne-btn--ghost',
                onclick: () => edit(() => (b.src = ''), { panel: true }),
              },
              'Remove',
            )
          : null,
      ),
      textField(
        'Caption',
        b.caption,
        T((v) => (b.caption = v)),
      ),
      range('Height', +b.h || 420, 160, 640, 10, (v) => change(() => (b.h = v), { key: 'imgh' + i }), ' px'),
    );
  }
  card.append(headEl, body);
  return card;
}

function colorSelect(b, edit) {
  const s = h(
    'select',
    { 'aria-label': 'Colour', style: 'width:auto' },
    h('option', { value: '' }, 'Colour'),
    Object.entries(COLORS).map(([v, n]) => h('option', { value: v }, n)),
  );
  s.value = b.color || '';
  s.onchange = () => edit(() => (b.color = s.value || undefined));
  return s;
}

// ---- Edition and news bar panels --------------------------------------------------------------

function renderEditionPanel() {
  const panel = $('panel-edition');
  const typing =
    (fn, o = {}) =>
    (v, key) =>
      change(() => fn(v), { key, ...o });
  const slugF = textField(
    'Link',
    ed.slug,
    typing((v) => (ed.slug = slugify(v) || ed.slug), { preview: false, thumbs: false }),
    {
      hint: `The page will be at /news/${ed.slug || '…'}/. Lowercase letters, digits and dashes.`,
    },
  );
  slugF.querySelector('input').addEventListener('change', (e) => {
    e.target.value = ed.slug;
    renderEditionPanel();
  });
  const date = h('input', { type: 'date', id: 'f-date' });
  date.value = ed.date || '';
  date.addEventListener(
    'change',
    () =>
      change(
        () => {
          const auto = !ed.slug || ed.slug === ed.date;
          ed.date = date.value;
          if (auto && date.value) ed.slug = date.value;
        },
        { preview: false, thumbs: false, panel: false },
      ) || renderEditionPanel(),
  );
  panel.replaceChildren(
    section(
      'Edition',
      textField(
        'Title',
        ed.title,
        typing(
          (v) => {
            ed.title = v;
            $('title').value = v;
          },
          { preview: false, thumbs: false },
        ),
        { hint: 'Shown in the archive and in link previews on Discord.' },
      ),
      textField(
        'Edition name',
        ed.edition,
        typing((v) => (ed.edition = v), { thumbs: 'all' }),
        { hint: 'On the cover badge, like “Edition #2” or “Special Edition”.' },
      ),
      h('div', { class: 'ne-field' }, h('label', { for: 'f-date', class: 'ne-label' }, 'Date'), date),
      slugF,
      textField(
        'Summary',
        ed.summary,
        typing((v) => (ed.summary = v), { preview: false, thumbs: false }),
        { rows: 3, hint: 'One or two sentences for the archive and Discord.' },
      ),
    ),
    section(
      'Sound',
      check('Play the intro jingle when the edition opens', ed.intro !== false, (v) =>
        change(() => (ed.intro = v), { preview: false, thumbs: false }),
      ),
    ),
  );
}

function renderTickerPanel() {
  const panel = $('panel-ticker');
  const t = ed.ticker;
  const items = h('textarea', { id: 'f-ticker', rows: 14 });
  items.value = (t.items || []).join('\n');
  items.addEventListener('input', () =>
    change(
      () =>
        (t.items = items.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)),
      { key: 'ticker', thumbs: false },
    ),
  );
  panel.replaceChildren(
    section(
      'News bar',
      textField('Label', t.label, (v, key) => change(() => (t.label = v), { key, thumbs: 'all' }), {
        hint: 'The red box on the left.',
      }),
      h(
        'div',
        { class: 'ne-field' },
        h('label', { for: 'f-ticker', class: 'ne-label' }, 'Headlines'),
        items,
        h('small', {}, 'One per line. They run past in a loop.'),
      ),
    ),
    section(
      'On which pages',
      h(
        'div',
        { class: 'ne-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'ne-btn ne-btn--small',
            onclick: () =>
              change(() => ed.pages.forEach((p) => p.layout !== 'cover' && (p.ticker = true)), {
                thumbs: 'all',
                panel: true,
              }),
          },
          'Show on every page',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'ne-btn ne-btn--small',
            onclick: () =>
              change(() => ed.pages.forEach((p) => (p.ticker = false)), { thumbs: 'all', panel: true }),
          },
          'Hide everywhere',
        ),
      ),
      h(
        'p',
        { class: 'ne-small' },
        'Per page: the News bar switch on the Page tab. The cover never shows it.',
      ),
    ),
  );
}

$('title').addEventListener('input', (e) =>
  change(() => (ed.title = e.target.value), { key: 'title', preview: false, thumbs: false }),
);
$('title').addEventListener('change', renderEditionPanel);

function showTab(name) {
  for (const t of ['page', 'edition', 'ticker']) {
    $('tab-' + t).setAttribute('aria-selected', String(t === name));
    $('panel-' + t).hidden = t !== name;
  }
}
for (const t of ['page', 'edition', 'ticker']) $('tab-' + t).addEventListener('click', () => showTab(t));

// ---- Dialogs: open, publish ------------------------------------------------------------------------

const dialog = $('dialog');
function showDialog(title, body, foot = []) {
  dialog.replaceChildren(
    h('div', { class: 'ne-dialog__body' }, h('h2', {}, title), body),
    h(
      'div',
      { class: 'ne-dialog__foot' },
      ...foot,
      h('button', { type: 'button', class: 'ne-btn', onclick: () => dialog.close() }, 'Close'),
    ),
  );
  if (!dialog.open) dialog.showModal();
}

async function newEdition() {
  let prev = null;
  if (index[0]) prev = await loadEdition(index[0].slug, BASE).catch(() => null);
  const n = index.length + 1;
  const date = nextSaturday();
  const signoff = TEMPLATES.find((t) => t.id === 'signoff').page();
  signoff.sign = 'Well, that’s it for this edition of Villager News!';
  return {
    v: 1,
    slug: date,
    title: `Villager News #${n}`,
    edition: `Edition #${n}`,
    date,
    summary: '',
    intro: true,
    ticker: clean(prev?.ticker || DEFAULT_TICKER),
    pages: [newPage(TEMPLATES[0].page()), newPage(TEMPLATES[1].page()), newPage(signoff)],
  };
}

function openDialog(first = false) {
  const draft = readDraft();
  const list = h('ul', { class: 'ne-list' });
  for (const e of index)
    list.append(
      h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            onclick: async () => {
              if (
                !first &&
                !confirm(
                  `Open “${e.title}”? Your current draft is replaced (download it first if you want to keep it).`,
                )
              )
                return;
              try {
                load(await loadEdition(e.slug, BASE));
                dialog.close();
                status(`Opened “${e.title}”. Changes stay a draft until you publish.`);
              } catch (err) {
                alert(err.message);
              }
            },
          },
          h('span', {}, e.title),
          h('small', {}, e.date),
        ),
      ),
    );
  showDialog(
    'Open an edition',
    h(
      'div',
      {},
      h(
        'p',
        {},
        'Start a new edition (it copies the news bar from the latest one), keep working on a published one, or open a file you downloaded.',
      ),
      index.length ? list : h('p', { class: 'ne-small' }, 'No published editions found.'),
    ),
    [
      draft && first
        ? h(
            'button',
            { type: 'button', class: 'ne-btn', onclick: () => (load(draft.ed), dialog.close()) },
            'Continue draft',
          )
        : null,
      h('button', { type: 'button', class: 'ne-btn', onclick: importFile }, 'Open file…'),
      h(
        'button',
        {
          type: 'button',
          class: 'ne-btn ne-btn--primary',
          onclick: async () => {
            if (
              !first &&
              !confirm(
                'Start a new edition? Your current draft is replaced (download it first if you want to keep it).',
              )
            )
              return;
            load(await newEdition());
            dialog.close();
            showTab('page');
          },
        },
        'New edition',
      ),
    ],
  );
}

async function importFile() {
  const f = await pickFile('application/json,.json');
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.pages)) throw new Error();
    if (!data.slug) data.slug = slugify(f.name.replace(/\.json$/, ''));
    load(data);
    dialog.close();
    status(`Opened ${f.name}.`);
  } catch {
    alert('That file isn’t a Villager News edition.');
  }
}

function problems() {
  const out = [];
  if (!ed.title) out.push('Give the edition a title (top bar).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ed.date || '')) out.push('Set a date on the Edition tab.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(ed.slug || '') || ['assets', 'editions', 'editor'].includes(ed.slug))
    out.push('Choose a link name on the Edition tab.');
  const full = [...thumbs.children]
    .map((li, i) => (li.classList.contains('is-over') ? i + 1 : 0))
    .filter(Boolean);
  if (full.length)
    out.push(
      `Page${full.length > 1 ? 's' : ''} ${full.join(', ')} ${full.length > 1 ? 'are' : 'is'} too full: text gets cut off.`,
    );
  return out;
}

function exportJSON() {
  const out = clean(ed);
  out.pages.forEach((p) => {
    if (p.layout === 'cover') delete p.blocks;
  });
  return JSON.stringify(out, null, 2) + '\n';
}

function download() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${ed.slug || 'edition'}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$('publish').addEventListener('click', () => {
  const issues = problems();
  const exists = index.some((e) => e.slug === ed.slug);
  const kb = Math.round(new Blob([exportJSON()]).size / 1024);
  showDialog(
    'Publish',
    h(
      'div',
      {},
      issues.length
        ? h(
            'div',
            { class: 'ne-warn', style: 'margin-bottom:16px' },
            h('p', { style: 'margin:0' }, 'Before you publish:'),
            h(
              'ul',
              { style: 'margin:4px 0 0' },
              issues.map((t) => h('li', {}, t)),
            ),
          )
        : null,
      h(
        'ol',
        {},
        h('li', {}, 'Download the edition: ', h('b', {}, `${ed.slug}.json`), ` (${kb} KB).`),
        h(
          'li',
          {},
          'Upload it to ',
          h(
            'a',
            {
              href: `https://github.com/${REPO}/upload/main/docs/news/editions`,
              target: '_blank',
              rel: 'noopener',
            },
            'docs/news/editions on GitHub',
          ),
          exists ? ' and replace the old file with the same name.' : '.',
          ' No access? Send the file to Mathijs.',
        ),
        h(
          'li',
          {},
          'About a minute later it is live at ',
          h('a', { href: `../${ed.slug}/`, target: '_blank', rel: 'noopener' }, `/news/${ed.slug}/`),
          ' and listed on the news page.',
        ),
      ),
      kb > 4000
        ? h(
            'p',
            { class: 'ne-small' },
            'This file is big because of its images. Smaller screenshots load faster.',
          )
        : null,
    ),
    [
      h(
        'button',
        {
          type: 'button',
          class: 'ne-btn',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(exportJSON());
              status('Copied the edition as text.');
            } catch {
              status('Copying didn’t work here; use Download.');
            }
          },
        },
        'Copy as text',
      ),
      h('button', { type: 'button', class: 'ne-btn ne-btn--primary', onclick: download }, 'Download'),
    ],
  );
});

$('open').addEventListener('click', () => openDialog(false));
$('play').addEventListener('click', () => {
  try {
    localStorage.setItem(LS + 'preview', JSON.stringify(ed));
  } catch {
    return status('Too big to preview here; download it and open it instead.');
  }
  window.open(`preview.html#slide-${cur + 1}`, 'vn-preview');
});
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);

addEventListener('keydown', (e) => {
  const typingInField = e.target.closest('input, textarea, select, [contenteditable]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typingInField) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typingInField) {
    e.preventDefault();
    redo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    $('publish').click();
  } else if (
    !typingInField &&
    !dialog.open &&
    (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp')
  ) {
    e.preventDefault();
    goTo(
      Math.max(
        0,
        Math.min(ed.pages.length - 1, cur + (e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : -1)),
      ),
    );
  } else if (e.key === 'Escape' && !menu.hidden) hideMenu();
});
addEventListener('beforeunload', () => {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(LS + 'draft', JSON.stringify({ ed, at: Date.now() }));
  } catch {
    /* nothing to do */
  }
});

function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(LS + 'draft') || 'null');
    return d && d.ed && Array.isArray(d.ed.pages) ? d : null;
  } catch {
    return null;
  }
}

// ---- Start ---------------------------------------------------------------------------------------

async function main() {
  await fontsReady();
  refit();
  index = await loadIndex(BASE).catch(() => []);
  const want = new URLSearchParams(location.search).get('e');
  const draft = readDraft();
  if (want && draft?.ed.slug === want) {
    load(draft.ed);
    status('Continuing your draft.');
  } else if (want) {
    try {
      load(await loadEdition(want, BASE));
      status('Changes stay a draft in this browser until you publish.');
    } catch {
      if (draft) load(draft.ed);
      else load(await newEdition());
      openDialog(true);
    }
  } else if (draft) {
    load(draft.ed);
    status('Continuing your draft.');
  } else {
    load(await newEdition());
    openDialog(true);
  }
}

main();
