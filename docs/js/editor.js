// The map editor: draw borders and shop outlines on the world map, name them, give them owners,
// colours, icons and products, then export borders.json and shops.json to put in docs/.
// Work in progress is also kept in this browser (localStorage) until it is exported.
import {
  createBaseMap,
  wireMapButtons,
  showWhenClose,
  worldToLatLng,
  latLngToWorld,
  DETAIL_ZOOM,
} from './map-core.js?v=741e673b';
import {
  el,
  byId,
  url,
  getJSON,
  colorDot,
  SEED,
  BORDER_COLORS,
  DEFAULT_BORDER_COLOR,
} from './ui.js?v=4d932c1e';
import {
  loadItems,
  shopIconEl,
  lineKind,
  ownersOf,
  parseItem,
  lineItemName,
} from './shops-core.js?v=541d6721';
import { mapSearch } from './map-search.js?v=d6d0b003';

const { map } = await createBaseMap(byId('map'));
wireMapButtons(map);

/* ---- Position readout --------------------------------------------------------------- */

const hoverEl = byId('mapinfo');

let hoverFrame = 0;
map.on('mousemove', (e) => {
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    const w = latLngToWorld(e.latlng);
    const x = Math.round(w.x);
    const z = Math.round(w.z);
    hoverEl.textContent = `X ${x}, Z ${z}`;
  });
});
map.on('mouseout', () => (hoverEl.textContent = ''));

/* ---- Shared helpers ---------------------------------------------------------------- */

const BORDER_KEY = `voxel-map-borders:${SEED}`;
const SHOP_KEY = `voxel-map-shops:${SEED}`;

const toLatLngs = (points) => points.map((p) => worldToLatLng(p.x, p.z));

/** The shipped file from docs/, or what this browser kept if that is missing or empty. */
async function loadSaved(file, storageKey) {
  const shipped = await getJSON(file, null);
  if (Array.isArray(shipped) && shipped.length) return shipped;
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    return [];
  }
}

function keepInBrowser(storageKey, data) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    // Storage can be full or blocked; the export still works.
  }
}

function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  el('a', { href, download: filename }).click();
  URL.revokeObjectURL(href);
}

/** A second click within 3 seconds confirms; the button turns red and says so while it waits. */
function confirmTwice(button, label, confirmLabel, onConfirm) {
  let timer = null;
  const arm = (on) => {
    button.classList.toggle('armed', on);
    button.dataset.tip = on ? confirmLabel : label;
    button.setAttribute('aria-label', on ? confirmLabel : label);
  };
  button.addEventListener('click', () => {
    if (!timer) {
      arm(true);
      timer = setTimeout(() => {
        timer = null;
        arm(false);
      }, 3000);
      return;
    }
    clearTimeout(timer);
    timer = null;
    arm(false);
    onConfirm();
  });
}

/* ---- Player roster (owner pickers) ---------------------------------------------------------- */

let rosterNames = [];
getJSON('data/players.json', []).then((list) => {
  rosterNames = list.map((p) => p.name);
  byId('rosterList').replaceChildren(...rosterNames.map((n) => el('option', { value: n })));
});
const matchPlayer = (typed) => rosterNames.find((n) => n.toLowerCase() === typed.trim().toLowerCase()) || '';

/**
 * Owners as removable chips, plus a text box that adds a player (picked from the roster, or typed: a new player
 * isn't in the roster until the next stats update). Returns {set(names), get()}; get() also takes what is typed.
 */
function ownerPicker(chipsEl, input) {
  let names = [];
  const render = () =>
    chipsEl.replaceChildren(
      ...names.map((name) =>
        el(
          'button',
          {
            type: 'button',
            class: 'owner-chip',
            title: 'Remove',
            onclick: () => {
              names = names.filter((n) => n !== name);
              render();
            },
          },
          `${name}  ×`,
        ),
      ),
    );
  const addTyped = () => {
    const name = matchPlayer(input.value) || input.value.trim();
    if (name && !names.includes(name)) {
      names.push(name);
      render();
    }
    input.value = '';
  };
  input.addEventListener('change', () => matchPlayer(input.value) && addTyped());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTyped();
  });
  return {
    set(list) {
      names = [...list];
      input.value = '';
      render();
    },
    get() {
      addTyped();
      return [...names];
    },
  };
}

/* ---- Drawing -------------------------------------------------------------------------------- */
// Every point snaps to a whole block, and every line runs straight horizontally or vertically:
// each new point keeps the previous point's x or z, whichever the mouse is further from.
// Finishing closes the shape with one more corner if needed, so the closing line is straight too.

const drawBorderBtn = byId('drawToggle');
const drawShopBtn = byId('shopToggle');
const finishBtn = byId('drawFinish');
const undoBtn = byId('drawUndo');

let drawMode = false;
let drawKind = 'border'; // what the shape being drawn becomes: 'border' or 'shop'
let draftPoints = []; // snapped world points of the shape in progress
let draftLayers = []; // its line and corner dots
let previewLine = null; // dashed line from the last corner to where the next would land

const snap = (w) => ({ x: Math.round(w.x), z: Math.round(w.z) });
const samePoint = (a, b) => a && b && a.x === b.x && a.z === b.z;

/** From `last`, go horizontally or vertically, whichever way the mouse went further. */
function straighten(p, last) {
  if (!last) return p;
  return Math.abs(p.x - last.x) >= Math.abs(p.z - last.z) ? { x: p.x, z: last.z } : { x: last.x, z: p.z };
}

/** Closes the shape with straight lines only, and drops corners that sit on a straight run. */
function closeStraight(points) {
  const pts = [...points];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.x !== last.x && first.z !== last.z) pts.push({ x: first.x, z: last.z });
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if ((a.x === b.x && b.x === c.x) || (a.z === b.z && b.z === c.z)) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

function clearPreview() {
  if (previewLine) map.removeLayer(previewLine);
  previewLine = null;
}

function renderDraft() {
  draftLayers.forEach((layer) => map.removeLayer(layer));
  const latlngs = toLatLngs(draftPoints);
  draftLayers = latlngs.map((ll) =>
    L.circleMarker(ll, { radius: 5, weight: 2, className: 'draft-dot', interactive: false }).addTo(map),
  );
  if (latlngs.length >= 2) {
    draftLayers.push(
      L.polyline(latlngs, { weight: 3, className: 'draft-line', interactive: false }).addTo(map),
    );
  }
  clearPreview();
  finishBtn.disabled = draftPoints.length < 3;
  undoBtn.disabled = draftPoints.length === 0;
}

function showPreview(latlng) {
  clearPreview();
  if (!drawMode || !draftPoints.length) return;
  const last = draftPoints[draftPoints.length - 1];
  const next = straighten(snap(latLngToWorld(latlng)), last);
  previewLine = L.polyline(toLatLngs([last, next]), {
    weight: 3,
    className: 'draft-line draft-line--preview',
    interactive: false,
  }).addTo(map);
}

function finishDraft() {
  if (draftPoints.length >= 3) {
    const points = closeStraight(draftPoints);
    if (drawKind === 'shop') {
      const xs = points.map((p) => p.x);
      const zs = points.map((p) => p.z);
      const shop = addShop({
        x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
        z: Math.round((Math.min(...zs) + Math.max(...zs)) / 2),
        points,
        added: new Date().toISOString(),
      });
      saveShops();
      openShopEditor(shop);
    } else {
      const border = addBorder({
        points,
        label: `Border ${borders.length + 1}`,
        color: BORDER_COLORS[borders.length % BORDER_COLORS.length],
      });
      saveBorders();
      openBorderEditor(border);
    }
  }
  draftPoints = [];
  renderDraft();
}

function setDrawMode(on, kind = 'border') {
  if (on && drawMode && kind !== drawKind) finishDraft(); // switching tools keeps what was drawn
  drawMode = on;
  if (on) drawKind = kind;
  const drawingBorder = on && drawKind === 'border';
  const drawingShop = on && drawKind === 'shop';
  drawBorderBtn.classList.toggle('active', drawingBorder);
  drawBorderBtn.setAttribute('aria-pressed', String(drawingBorder));
  drawBorderBtn.dataset.tip = drawingBorder ? 'Drawing border, click to stop' : 'Draw border';
  drawShopBtn.classList.toggle('active', drawingShop);
  drawShopBtn.setAttribute('aria-pressed', String(drawingShop));
  drawShopBtn.dataset.tip = drawingShop ? 'Drawing shop, click to stop' : 'Draw shop outline';
  map.getContainer().classList.toggle('drawing-mode', on);
  if (on) {
    map.doubleClickZoom.disable();
  } else {
    map.doubleClickZoom.enable();
    finishDraft();
  }
}

map.on('mousemove', (e) => showPreview(e.latlng));
map.on('mouseout', clearPreview);
map.on('click', (e) => {
  if (!drawMode) return;
  const last = draftPoints[draftPoints.length - 1];
  const p = straighten(snap(latLngToWorld(e.latlng)), last);
  // Clicking back on the first corner closes the shape.
  if (draftPoints.length >= 3) {
    const here = map.latLngToContainerPoint(worldToLatLng(p.x, p.z));
    const start = map.latLngToContainerPoint(worldToLatLng(draftPoints[0].x, draftPoints[0].z));
    if (here.distanceTo(start) < 12) return finishDraft();
  }
  if (samePoint(p, last)) return;
  draftPoints.push(p);
  renderDraft();
});
map.on('dblclick', (e) => {
  if (!drawMode) return;
  L.DomEvent.stop(e);
  draftPoints.pop(); // the second click of the double-click added a corner too many
  finishDraft();
});
document.addEventListener('keydown', (e) => {
  if (!drawMode) return;
  if (e.key === 'Escape') {
    draftPoints = [];
    renderDraft();
  } else if (e.key === 'Enter') {
    finishDraft();
  }
});

drawBorderBtn.addEventListener('click', () => setDrawMode(!(drawMode && drawKind === 'border'), 'border'));
drawShopBtn.addEventListener('click', () => setDrawMode(!(drawMode && drawKind === 'shop'), 'shop'));
finishBtn.addEventListener('click', finishDraft);
undoBtn.addEventListener('click', () => {
  draftPoints.pop();
  renderDraft();
});

/* ---- Borders -------------------------------------------------------------------------------- */

let borders = []; // {points, label, color, hideLabel, owners, layer, tooltip}

const serializeBorder = (b) => ({
  points: b.points,
  label: b.label,
  color: b.color,
  hideLabel: b.hideLabel,
  ...(b.owners.length ? { owners: b.owners } : {}),
});
const saveBorders = () => keepInBrowser(BORDER_KEY, borders.map(serializeBorder));

/** The border's name in the middle of its area (getCenter is the area-weighted centre). */
function updateBorderLabel(border) {
  if (border.tooltip) map.removeLayer(border.tooltip);
  border.tooltip = null;
  if (!border.label || border.hideLabel) return;
  border.tooltip = L.tooltip({
    permanent: true,
    direction: 'center',
    className: 'border-label',
    interactive: true,
  })
    .setLatLng(border.layer.getCenter())
    .setContent(el('span', {}, border.label))
    .addTo(map);
  border.tooltip.on('click', () => openBorderEditor(border));
}

function addBorder({ points, label = '', color = DEFAULT_BORDER_COLOR, hideLabel = false, owners = [] }) {
  // Outline only, like the public map: a fill would hide the builds underneath.
  const layer = L.polygon(toLatLngs(points), {
    color,
    weight: 3,
    fill: false,
    className: 'border-line',
  }).addTo(map);
  const border = { points, label, color, hideLabel: !!hideLabel, owners: [...owners], layer, tooltip: null };
  layer.on('click', (e) => {
    if (drawMode) return;
    L.DomEvent.stopPropagation(e);
    openBorderEditor(border);
  });
  updateBorderLabel(border);
  borders.push(border);
  return border;
}

function removeBorder(border) {
  map.removeLayer(border.layer);
  if (border.tooltip) map.removeLayer(border.tooltip);
  borders = borders.filter((b) => b !== border);
}

function clearAllBorders() {
  draftPoints = [];
  renderDraft();
  [...borders].forEach(removeBorder);
  saveBorders();
  closeBorderEditor();
}

/* ---- Border panel ---- */

const borderPanel = byId('borderEditor');
const borderLabelInput = byId('borderLabelInput');
const borderShowLabelInput = byId('borderShowLabelInput');
const borderOwners = ownerPicker(byId('ownerChips'), byId('ownerInput'));
const swatches = byId('colorSwatches');
const borderSaveBtn = byId('borderSave');

let editingBorder = null;
let editingColor = null;

function renderSwatches() {
  swatches.replaceChildren(
    ...BORDER_COLORS.map((color) =>
      el(
        'button',
        {
          type: 'button',
          class: 'swatch-btn',
          'aria-label': `Colour ${color}`,
          'aria-pressed': String(color === editingColor),
          onclick: () => {
            editingColor = color;
            renderSwatches();
          },
        },
        colorDot(color),
      ),
    ),
  );
}

function openBorderEditor(border) {
  closeShopEditor();
  editingBorder = border;
  editingColor = border.color;
  borderOwners.set(border.owners);
  borderLabelInput.value = border.label;
  borderShowLabelInput.checked = !border.hideLabel;
  renderSwatches();
  borderPanel.classList.add('open');
  borderLabelInput.focus();
  borderLabelInput.select();
}

function closeBorderEditor() {
  editingBorder = null;
  borderPanel.classList.remove('open');
}

borderSaveBtn.addEventListener('click', () => {
  if (!editingBorder) return;
  Object.assign(editingBorder, {
    label: borderLabelInput.value.trim(),
    hideLabel: !borderShowLabelInput.checked,
    owners: borderOwners.get(),
    color: editingColor,
  });
  editingBorder.layer.setStyle({ color: editingColor });
  updateBorderLabel(editingBorder);
  saveBorders();
  closeBorderEditor();
});
byId('borderDelete').addEventListener('click', () => {
  if (!editingBorder) return;
  removeBorder(editingBorder);
  saveBorders();
  closeBorderEditor();
});
byId('borderCancel').addEventListener('click', closeBorderEditor);
borderLabelInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') borderSaveBtn.click();
  else if (e.key === 'Escape') closeBorderEditor();
});

/* ---- Shops ---------------------------------------------------------------------------------- */
// A shop is an outline over its building (drawn with the same tool as borders), so the build stays
// visible. Older shops that are only a point keep a marker icon until they are redrawn.

let shops = []; // {x, z, points, label, owners, added, spoiler, icon, products, marker, shape}

const outlineClass = (spoiler) => `shop-outline border-line${spoiler ? ' shop-outline--spoiler' : ''}`;
const pointIcon = L.icon({
  iconUrl: url('assets/shop-icon.png?v=00997138'),
  className: 'shop-marker-icon',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});

const serializeShop = (s) => ({
  x: s.x,
  z: s.z,
  label: s.label,
  ...(s.points ? { points: s.points } : {}),
  ...(s.spoiler ? { spoiler: true } : {}),
  ...(s.owners.length ? { owners: s.owners } : {}),
  ...(s.added ? { added: s.added } : {}),
  ...(s.icon ? { icon: s.icon } : {}),
  ...(s.products.length ? { products: s.products } : {}),
});
const saveShops = () => keepInBrowser(SHOP_KEY, shops.map(serializeShop));

function addShop(data) {
  const points = data.points && data.points.length >= 3 ? data.points : null;
  const shop = {
    x: data.x,
    z: data.z,
    points,
    label: data.label || '',
    owners: ownersOf(data), // Minecraft names; older files have a single `owner`
    added: data.added || '', // when it was placed; drives "new shop" news on the homepage
    spoiler: !!data.spoiler && !!points,
    icon: data.icon || '',
    products: Array.isArray(data.products) ? data.products : [],
  };
  const onClick = (e) => {
    if (drawMode) return;
    L.DomEvent.stopPropagation(e);
    openShopEditor(shop);
  };
  if (points) {
    const latlngs = toLatLngs(points);
    const casing = L.polygon(latlngs, { fill: false, interactive: false, className: 'shop-casing' });
    shop.shape = L.polygon(latlngs, { fill: true, className: outlineClass(shop.spoiler) }).on(
      'click',
      onClick,
    );
    shop.marker = L.layerGroup([casing, shop.shape]);
  } else {
    shop.marker = L.marker(worldToLatLng(shop.x, shop.z), { icon: pointIcon }).on('click', onClick);
  }
  shops.push(shop);
  syncShops();
  return shop;
}

function removeShop(shop) {
  map.removeLayer(shop.marker);
  shops = shops.filter((s) => s !== shop);
  saveShops();
}

const syncShops = showWhenClose(map, () => shops.map((s) => s.marker));

/* ---- Shop panel ---- */

const shopPanel = byId('shopEditor');
const shopLabelInput = byId('shopLabelInput');
const shopOwners = ownerPicker(byId('shopOwnerChips'), byId('shopOwnerInput'));
const shopSpoilerInput = byId('shopSpoilerInput');
const shopSaveBtn = byId('shopSave');
const shopCancelBtn = byId('shopCancel');
const productsEl = byId('shopProducts');

let editingShop = null;

// Icon: a 16x16 PNG, kept in shops.json as a data: URL so the export stays one file.
// A bigger square image that is a whole multiple of 16 (32, 48, 64...) is scaled down pixel for pixel.
const iconInput = byId('shopIconInput');
const iconPreview = byId('shopIconPreview');
const iconHint = byId('shopIconHint');
const iconDrop = byId('shopIconDrop');
const ICON_HINT = iconHint.textContent;
let editingIcon = '';

function showIcon(hint = ICON_HINT, isError = false) {
  iconPreview.hidden = !editingIcon;
  byId('shopIconEmpty').hidden = !!editingIcon;
  byId('shopIconRemove').hidden = !editingIcon;
  if (editingIcon) iconPreview.src = editingIcon;
  iconHint.textContent = hint;
  iconHint.classList.toggle('hint--error', isError);
}

function readIcon(file) {
  if (!file) return;
  const img = new Image();
  const src = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(src);
    const size = img.naturalWidth;
    if (size !== img.naturalHeight || size % 16) {
      return showIcon(
        `That image is ${size}×${img.naturalHeight}. Use 16×16 (or 32×32, 64×64 and so on).`,
        true,
      );
    }
    const canvas = el('canvas', { width: 16, height: 16 });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, 16, 16);
    editingIcon = canvas.toDataURL('image/png');
    showIcon(size === 16 ? ICON_HINT : `Scaled down from ${size}×${size}, pixel for pixel.`);
  };
  img.onerror = () => {
    URL.revokeObjectURL(src);
    showIcon("That file couldn't be read as an image.", true);
  };
  img.src = src;
}

byId('shopIconPick').addEventListener('click', () => iconInput.click());
iconInput.addEventListener('change', () => {
  readIcon(iconInput.files[0]);
  iconInput.value = '';
});
byId('shopIconRemove').addEventListener('click', () => {
  editingIcon = '';
  showIcon();
});
iconDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  iconDrop.classList.add('over');
});
iconDrop.addEventListener('dragleave', () => iconDrop.classList.remove('over'));
iconDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  iconDrop.classList.remove('over');
  readIcon(e.dataTransfer.files[0]);
});

// Each line is a Minecraft item (docs/data/items.json), an enchanted book ("Mending", "Efficiency V"), another
// product that isn't an item (a Happy Ghast), or a service (Delivery). A shop can mix them; what it is
// (Shop, Service or both) follows from its lines.
let itemDb = null;
const itemByName = (text) => itemDb && itemDb.byName.get(text.trim().toLowerCase());
/** What a line's name box holds: an item or a book ({item, enchant?, level?}), or null. */
const lineItem = (text) => parseItem(itemDb, text);
const nameOf = (id) =>
  itemDb && itemDb.byId.get(id) ? itemDb.byId.get(id).name : (id || '').replaceAll('_', ' ');

loadItems().then((db) => {
  const typed = editingShop ? readProducts() : null; // the panel was opened before the list arrived
  itemDb = db;
  if (!db) return;
  byId('itemList').replaceChildren(...db.items.map((it) => el('option', { value: it.name })));
  byId('lineItemList').replaceChildren(
    ...db.items.map((it) => el('option', { value: it.name })),
    ...db.enchants.map((e) =>
      el('option', { value: lineItemName(db, { item: 'enchanted_book', enchant: e.id }) }),
    ),
  );
  if (typed) renderProducts(typed);
});

const LINE_KINDS = { item: 'Item', other: 'Other', service: 'Service' };
const PLACEHOLDER = {
  item: 'Item, like Oak Log',
  other: 'Name, like Happy Ghast',
  service: 'Service, like Delivery',
};

/** A typed name that isn't a Minecraft item (or, in a line's name box, an enchanted book). */
const isUnknown = (input) =>
  !!input.value.trim() &&
  !!itemDb &&
  !(input.dataset.books ? lineItem(input.value) : itemByName(input.value));
const checkItem = (input) => input.classList.toggle('efield--bad', isUnknown(input));

/** The inputs of a product line of this kind, empty. */
function lineFields(kind) {
  const field = (cls, attrs) =>
    el('input', {
      class: `efield efield--sm ${cls}`,
      autocomplete: 'off',
      ...attrs,
      onkeydown: (e) => e.stopPropagation(),
    });
  const fields = {
    name: field('pline__item', {
      type: 'text',
      placeholder: PLACEHOLDER[kind],
      'aria-label': LINE_KINDS[kind],
      maxlength: 60,
      ...(kind === 'item' ? { list: 'lineItemList', 'data-books': 'yes' } : {}),
    }),
    // Lines with the same group and price show as one row on the Shops page ("32× Logs · 10 kinds").
    group: field('pline__group', {
      type: 'text',
      placeholder: 'Group, like Logs (optional)',
      'aria-label': 'Group',
      maxlength: 30,
    }),
    amount: field('pline__n', {
      type: 'number',
      min: 1,
      max: 9999,
      placeholder: '1',
      'aria-label': 'How many',
    }),
    price: field('pline__n', {
      type: 'number',
      min: 0,
      max: 9999,
      placeholder: '?',
      'aria-label': 'Price',
      title: '0 means free',
    }),
    currency: field('pline__cur', {
      type: 'text',
      list: 'itemList',
      placeholder: 'Diamond',
      'aria-label': 'Paid in',
    }),
  };
  return fields;
}

/** Fills a line's inputs from a product (and checks the item names). */
function fillLine(fields, p, kind) {
  fields.name.value = p.service || (p.item ? lineItemName(itemDb, p) : p.name || '');
  // Before the item list loads the name can't be read back, so keep what the line was.
  if (p.item) fields.name.dataset.was = JSON.stringify({ item: p.item, enchant: p.enchant, level: p.level });
  fields.group.value = p.group || '';
  fields.amount.value = p.amount || '';
  fields.price.value = p.free ? 0 : p.price || '';
  fields.currency.value = p.priceItem && p.priceItem !== 'diamond' ? nameOf(p.priceItem) : '';
  for (const input of kind === 'item' ? [fields.name, fields.currency] : [fields.currency]) {
    input.addEventListener('input', () => checkItem(input));
    checkItem(input);
  }
}

/** One product line in a shop's editor: its kind, name, group, amount and price, and a remove button. */
function productRow(p, kind = lineKind(p)) {
  const fields = lineFields(kind);
  fillLine(fields, p, kind);

  const line = el('li', { class: `pline pline--${kind}` });
  line.fields = fields;
  line.kind = kind;
  // Switching the kind keeps what was typed: an item name becomes the text of a product or service, and back.
  const kindSelect = el(
    'select',
    {
      class: 'efield efield--sm pline__kind',
      'aria-label': 'Kind',
      onchange: () =>
        line.replaceWith(productRow(asKind(readLine(line, true) || {}, kindSelect.value), kindSelect.value)),
    },
    Object.entries(LINE_KINDS).map(([value, label]) =>
      el('option', { value, selected: value === kind }, label),
    ),
  );
  const remove = el(
    'button',
    {
      type: 'button',
      class: 'pline__x',
      'aria-label': 'Remove',
      title: 'Remove',
      onclick: () => line.remove(),
    },
    '×',
  );
  line.append(
    el('div', { class: 'pline__head' }, kindSelect, fields.name),
    fields.group,
    el(
      'div',
      { class: 'pline__row' },
      fields.amount,
      el('span', { class: 'pline__for' }, 'for'),
      fields.price,
      fields.currency,
      remove,
    ),
  );
  return line;
}

/** A line as another kind, keeping its name, amount, price and group. */
function asKind(p, kind) {
  const text = p.service || p.name || (p.item ? lineItemName(itemDb, p) : '');
  const { service, name, item, enchant, level, ...rest } = p; // eslint-disable-line no-unused-vars
  if (kind === 'service') return { ...rest, service: text };
  if (kind === 'other') return { ...rest, name: text };
  const found = text && lineItem(text);
  return { ...rest, ...(found || { name: text }) }; // an unknown name stays typed, flagged red
}

/**
 * One line as an object, or null when it is empty. A typed item that isn't a Minecraft item is left out,
 * unless keep is set (when switching kinds, so the text isn't lost).
 */
function readLine(line, keep = false) {
  const f = line.fields;
  const text = f.name.value.trim();
  const n = parseInt(f.price.value, 10);
  const paidIn = f.currency.value.trim() ? itemByName(f.currency.value) : null;
  const out = {};
  if (n > 0) Object.assign(out, { price: n, priceItem: paidIn ? paidIn.id : 'diamond' });
  else if (n === 0) out.free = true; // a price of 0 means free
  if (f.group.value.trim()) out.group = f.group.value.trim();
  const amount = Math.max(1, parseInt(f.amount.value, 10) || 1);

  if (line.kind === 'service') return text ? { service: text, ...out } : null;
  if (line.kind === 'other') return text ? { name: text, amount, ...out } : null;
  const found = itemDb ? lineItem(text) : f.name.dataset.was && JSON.parse(f.name.dataset.was);
  if (found) return { ...found, amount, ...out };
  return keep && text ? { name: text, amount, ...out } : null;
}

const renderProducts = (list) => productsEl.replaceChildren(...list.map((p) => productRow(p)));
const readProducts = () => [...productsEl.children].map((line) => readLine(line)).filter(Boolean);

byId('shopAddProduct').addEventListener('click', () => {
  const line = productRow({}, 'item');
  productsEl.append(line);
  line.fields.name.focus();
});

function openShopEditor(shop) {
  closeBorderEditor();
  editingShop = shop;
  editingIcon = shop.icon;
  shopLabelInput.value = shop.label;
  shopOwners.set(shop.owners);
  shopSpoilerInput.checked = shop.spoiler;
  byId('shopSpoilerRow').hidden = !shop.points; // only outlines can be filled
  showIcon();
  renderProducts(shop.products);
  shopPanel.classList.add('open');
  shopLabelInput.focus();
  shopLabelInput.select();
}

function closeShopEditor() {
  editingShop = null;
  shopPanel.classList.remove('open');
}

shopSaveBtn.addEventListener('click', () => {
  if (!editingShop) return;
  // An item that isn't a Minecraft item would be dropped on save, so point at it instead.
  const bad = [...productsEl.querySelectorAll('input[list]')].find(isUnknown);
  if (bad) {
    bad.classList.add('efield--bad');
    bad.focus();
    bad.select();
    return;
  }
  Object.assign(editingShop, {
    label: shopLabelInput.value.trim(),
    owners: shopOwners.get(),
    spoiler: !!editingShop.points && shopSpoilerInput.checked,
    icon: editingIcon,
    products: readProducts(),
  });
  if (editingShop.shape) {
    // Set it on the options too, so it is right if the layer is added to the map again later.
    editingShop.shape.options.className = outlineClass(editingShop.spoiler);
    editingShop.shape.getElement()?.classList.toggle('shop-outline--spoiler', editingShop.spoiler);
  }
  saveShops();
  closeShopEditor();
});
byId('shopDelete').addEventListener('click', () => {
  if (!editingShop) return;
  removeShop(editingShop);
  closeShopEditor();
});
shopCancelBtn.addEventListener('click', () => {
  // A shop that was just drawn and never named is not left behind when the panel is dismissed.
  if (editingShop && !editingShop.label) removeShop(editingShop);
  closeShopEditor();
});
shopLabelInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') shopSaveBtn.click();
  else if (e.key === 'Escape') shopCancelBtn.click();
});

/* ---- Toolbar ---------------------------------------------------------------------------------- */

confirmTwice(byId('drawClear'), 'Clear all borders', 'Click again to clear all borders', clearAllBorders);
byId('drawExport').addEventListener('click', () => download('borders.json', borders.map(serializeBorder)));
byId('shopExport').addEventListener('click', () => download('shops.json', shops.map(serializeShop)));

const helpBtn = byId('helpToggle');
const helpPanel = byId('drawHint');
helpBtn.addEventListener('click', () => {
  helpPanel.hidden = !helpPanel.hidden;
  helpBtn.setAttribute('aria-expanded', String(!helpPanel.hidden));
  helpBtn.classList.toggle('active', !helpPanel.hidden);
});

/* ---- Search: borders and shops by name --------------------------------------------------------- */

mapSearch({
  search: (q) =>
    [
      ...borders.filter((b) => b.label.toLowerCase().includes(q)).map((b) => ({ type: 'border', ref: b })),
      ...shops.filter((s) => s.label.toLowerCase().includes(q)).map((s) => ({ type: 'shop', ref: s })),
    ].slice(0, 8),
  row: (r) =>
    r.type === 'border'
      ? [colorDot(r.ref.color), r.ref.label, 'Border']
      : [shopIconEl(r.ref), r.ref.label, 'Shop'],
  choose: (r) => {
    if (r.type === 'border') {
      map.fitBounds(r.ref.layer.getBounds(), { maxZoom: DETAIL_ZOOM, padding: [60, 60] });
    } else {
      map.setView(worldToLatLng(r.ref.x, r.ref.z), DETAIL_ZOOM);
      openShopEditor(r.ref);
    }
  },
});

/* ---- Load ---------------------------------------------------------------------------------- */

for (const b of await loadSaved('borders.json', BORDER_KEY))
  addBorder({ ...b, color: b.color || DEFAULT_BORDER_COLOR });
for (const s of await loadSaved('shops.json', SHOP_KEY)) addShop(s);
