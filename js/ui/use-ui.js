// Panels for using things: a choice of actions, a container or shop beside your
// inventory, your inventory on its own, a terminal. Each returns a Promise of what the
// player chose; main.js applies it and re-opens the panel, like the work panel.
import { UI } from './ui.js';
import { ITEMS, CAT_LABEL, massOf } from '../gen/items.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kg = m => m < 1 ? `${Math.round(m * 1000)} g` : `${m.toFixed(1)} kg`;

// Resolve on a click of [data-a] or a key; Esc always means 'close'.
function wire(ui, p, res, keys = {}) {
  const done = v => { removeEventListener('keydown', onKey, true); res(v); };
  const onKey = e => {
    if (e.code === 'Escape' || e.code === 'Tab' || keys[e.code] === 'close') { e.preventDefault(); e.stopPropagation(); return done({ a: 'close' }); }
    const k = keys[e.code]; if (k) { e.preventDefault(); e.stopPropagation(); done(k); }
  };
  addEventListener('keydown', onKey, true);
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    done({ a: b.dataset.a, idx: b.dataset.idx !== undefined ? +b.dataset.idx : undefined, n: b.dataset.n !== undefined ? +b.dataset.n : 1, v: b.dataset.v });
  });
}

// options: [{ a, label, note?, disabled? }] → keys 1..9
UI.prototype.choose = function ({ title, sub = '', options }) {
  return new Promise(res => {
    const p = this.panel(`<h2>${esc(title)}</h2>${sub ? `<p class="fine">${sub}</p>` : ''}
      ${options.map((o, i) => `<button data-a="${o.a}" data-v="${esc(o.v ?? '')}" ${o.disabled ? 'disabled' : ''}><kbd>${i + 1}</kbd> ${esc(o.label)}${o.note ? `<small>${o.note}</small>` : ''}</button>`).join('')}
      <button data-a="close" class="ghost">Cancel <small>Esc</small></button>`, 'use');
    const keys = {}; options.forEach((o, i) => { if (!o.disabled) keys['Digit' + (i + 1)] = { a: o.a, v: o.v }; });
    wire(this, p, res, keys);
  });
};

const row = (it, i, act, label, extra = '') => {
  const I = ITEMS[it.id];
  return `<li><span class="nm">${esc(I.name)}${it.n > 1 ? ` <b>×${it.n}</b>` : ''}${it.own ? ' <i class="tag">yours</i>' : ''}</span>
    <small>${CAT_LABEL[I.cat]} · ${kg(I.kg)}${extra}</small>
    <span class="acts">${act ? `<button data-a="${act}" data-idx="${i}" data-n="1">${label}</button>${it.n > 1 && act !== 'eat' ? `<button data-a="${act}" data-idx="${i}" data-n="${it.n}">all</button>` : ''}` : ''}</span></li>`;
};

// A container (or a shop shelf, or the till) beside what you carry.
//   box: { title, note, items, act, label, price?(id) }   you: { items, act, label, price?(id), limit }
UI.prototype.stash = function ({ title, note = '', box, you, warn = '' }) {
  return new Promise(res => {
    const left = box ? `<div class="col"><h3>${esc(box.title)}</h3><ul class="items">${box.items.map((it, i) => row(it, i, box.act, box.label, box.price ? ` · <b>${box.price(it.id)} cr</b>` : '')).join('') || '<li class="none">Empty.</li>'}</ul>
      ${box.act === 'take' && box.items.length ? '<button data-a="takeall" class="ghost">Take everything</button>' : ''}</div>` : '';
    const m = massOf(you.items);
    const right = `<div class="col"><h3>You carry <small>${kg(m)} of ${kg(you.limit)}</small></h3><ul class="items">${you.items.map((it, i) => row(it, i, you.act, you.label, you.price ? ` · <b>${you.price(it.id)} cr</b>` : '')).join('') || '<li class="none">Nothing.</li>'}</ul></div>`;
    const p = this.panel(`<h2>${esc(title)}</h2>${note ? `<p class="fine">${note}</p>` : ''}${warn ? `<p class="late">${warn}</p>` : ''}
      <div class="cols">${left}${right}</div><button data-a="close" class="primary">Done <small>Esc</small></button>`, 'use wide');
    wire(this, p, res);
  });
};

UI.prototype.inventory = function ({ player, limit }) {
  return new Promise(res => {
    const items = player.inventory || [], m = massOf(items);
    const p = this.panel(`<h2>Inventory</h2><p class="fine">${kg(m)} of ${kg(limit)} you can carry · ${player.credits ?? 0} cr · hunger ${Math.round((player.hunger ?? 0) * 100)}% · fatigue ${Math.round(player.fatigue * 100)}%</p>
      <ul class="items">${items.map((it, i) => row(it, i, ITEMS[it.id].eat ? 'eat' : null, ['drink'].includes(ITEMS[it.id].cat) ? 'Drink' : ITEMS[it.id].cat === 'medicine' ? 'Take' : 'Eat')).join('') || '<li class="none">You aren\'t carrying anything. Open cupboards, fridges and lockers with E; shops sell what you need.</li>'}</ul>
      <button data-a="close" class="primary">Close <small>I / Esc</small></button>`, 'use');
    wire(this, p, res, { KeyI: 'close' });
  });
};

// A screen: news, your messages, your account.
UI.prototype.terminal = function ({ title, sections }) {
  return new Promise(res => {
    const p = this.panel(`<h2>${esc(title)}</h2>${sections.map(s => `<h3>${esc(s.h)}</h3>${s.html}`).join('')}<button data-a="close" class="primary">Log off <small>Esc</small></button>`, 'use term');
    wire(this, p, res);
  });
};
