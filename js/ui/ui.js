// DOM overlays: title, loading, HUD, prompts, toasts, pause menu, leave dialog,
// "while you were away" report. Plain DOM, no framework.
import { ACTIVITIES } from '../sim/processes/character.js';
import { formatDuration, formatHour, solarHour, dayNumber } from '../sim/clock.js';
import { address } from '../gen/settlement.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this.root = $('#ui');
    this.hud = el('div', 'hud hidden'); this.root.append(this.hud);
    this.hud.innerHTML = `<div class="where"><div class="place"></div><div class="sub"></div></div>
      <div class="clock"><div class="time"></div><div class="sub"></div></div>
      <div class="stats"><div class="who"></div>
        <div class="bar"><span>Fatigue</span><i><b class="fatigue"></b></i></div>
        <div class="bar"><span>Fitness</span><i><b class="fitness"></b></i></div></div>
      <div class="debug hidden"></div>`;
    this.prompt = el('div', 'prompt hidden'); this.root.append(this.prompt);
    this.toasts = el('div', 'toasts'); this.root.append(this.toasts);
    this.hint = el('div', 'hint hidden', 'Click to look around · WASD move · Shift run · Space jump · E use · hold F force · C you · Esc menu'); this.root.append(this.hint);
  }
  panel(html, cls = '') {
    this.closePanel();
    const p = el('div', 'panel ' + cls, `<div class="card">${html}</div>`);
    this.root.append(p); this.current = p; return p;
  }
  closePanel() { this.current?.remove(); this.current = null; }

  title({ hasSave, summary }) {
    return new Promise(res => {
      const p = this.panel(`<h1>ORBIS</h1><p class="lede">A persistent universe. You are one person living in it.</p>
        ${hasSave ? `<p class="save">${summary}</p><button data-a="continue" class="primary">Continue</button>` : ''}
        <button data-a="new" class="${hasSave ? '' : 'primary'}">${hasSave ? 'Start over — new universe' : 'Begin a life'}</button>
        <button data-a="restore">Restore from backup…</button>
        <p class="fine">Prototype · milestone 1 · everything you see is generated from a seed; only your changes are saved.</p>`, 'title');
      p.addEventListener('click', e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'new' && hasSave && !confirm('Erase this universe and everything that happened in it?')) return;
        res(a);
      });
    });
  }
  loading(text, frac) {
    if (!this.current?.classList.contains('loading')) this.panel(`<p class="ltext"></p><div class="progress"><b></b></div>`, 'loading');
    $('.ltext', this.current).textContent = text;
    $('.progress b', this.current).style.width = Math.round(frac * 100) + '%';
  }
  showHud(on) { this.hud.classList.toggle('hidden', !on); this.hint.classList.toggle('hidden', !on); }

  updateHud(g) {
    const { planet, s, player, t, located } = g;
    const h = solarHour(planet, t);
    $('.place', this.hud).textContent = located ? (located.b ? labelFor(located) : s.name) : s.name;
    $('.where .sub', this.hud).textContent = located?.b ? `${s.name} · ${planet.name}` : `${planet.name}`;
    $('.time', this.hud).textContent = formatHour(h);
    $('.clock .sub', this.hud).textContent = `Day ${dayNumber(planet, t)} · ${(planet.dayLength / 3600).toFixed(1)} h day`;
    $('.who', this.hud).textContent = `${player.name}, ${player.age}`;
    $('.fatigue', this.hud).style.width = Math.round(player.fatigue * 100) + '%';
    $('.fitness', this.hud).style.width = Math.round(player.fitness * 100) + '%';
  }
  debug(text) { const d = $('.debug', this.hud); d.textContent = text; }
  toggleDebug() { $('.debug', this.hud).classList.toggle('hidden'); }

  showPrompt(html) { if (!html) { this.prompt.classList.add('hidden'); return; } this.prompt.innerHTML = html; this.prompt.classList.remove('hidden'); }
  toast(html, kind = '', ms = 4500) {
    const t = el('div', 'toast ' + kind, html); this.toasts.append(t);
    setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 600);
  }

  menu() {
    return new Promise(res => {
      const p = this.panel(`<h2>Paused</h2><p class="fine">Time does not stop — the universe keeps going.</p>
        <button data-a="resume" class="primary">Resume</button>
        <button data-a="leave">Leave the game…</button>
        <button data-a="backup">Download backup</button>
        <button data-a="restore">Restore from backup…</button>
        <button data-a="log">World log</button>`, 'menu');
      p.addEventListener('click', e => { const a = e.target.dataset.a; if (a) res(a); });
    });
  }
  leave(player) {
    return new Promise(res => {
      const opts = Object.entries(ACTIVITIES).map(([k, a]) => `<button data-a="${k}"><b>${a.label}</b><small>${a.desc}</small></button>`).join('');
      const p = this.panel(`<h2>While you are away…</h2><p class="fine">What does ${esc(player.name)} do until you return?</p>
        <div class="acts">${opts}</div><button data-a="cancel" class="ghost">Cancel</button>`, 'leave');
      p.addEventListener('click', e => { const a = e.target.closest('button')?.dataset.a; if (a) res(a); });
    });
  }
  left(player, activity) {
    const p = this.panel(`<h2>${esc(player.name)} — ${esc(ACTIVITIES[activity].label.toLowerCase())}</h2>
      <p>Saved. You can close this tab; time keeps passing at its usual pace.</p>
      <button data-a="return" class="primary">Return now</button>`, 'left');
    p.addEventListener('click', e => { if (e.target.dataset.a === 'return') location.reload(); });
  }
  away(r, planet) {
    return new Promise(res => {
      const pct = v => Math.round(v * 100) + '%';
      const evs = r.events.map(e => `<li>${describeEvent(e, planet)}</li>`).join('') || '<li class="none">Nothing you know of changed in town.</li>';
      const p = this.panel(`<h2>While you were away</h2>
        <p class="lede">${formatDuration(r.elapsed)} passed${r.activity && r.activity !== 'idle' ? ` · ${esc(ACTIVITIES[r.activity]?.label || r.activity)}` : ''}.</p>
        ${r.notes.map(n => `<p>${esc(n)}</p>`).join('')}
        <p>Fatigue ${pct(r.body.fatigue[0])} → ${pct(r.body.fatigue[1])} · Fitness ${pct(r.body.fitness[0])} → ${pct(r.body.fitness[1])}</p>
        <h3>In town</h3><ul class="events">${evs}</ul>
        <button data-a="ok" class="primary">Carry on</button>`, 'away');
      p.addEventListener('click', e => { if (e.target.dataset.a === 'ok') { this.closePanel(); res(); } });
    });
  }
  log(events, planet) {
    return new Promise(res => {
      const rows = events.slice(-60).reverse().map(e => `<li>${describeEvent(e, planet)}</li>`).join('') || '<li class="none">Nothing recorded yet.</li>';
      const p = this.panel(`<h2>World log</h2><p class="fine">Things that happened and were recorded. Newest first.</p><ul class="events">${rows}</ul><button data-a="ok" class="primary">Back</button>`, 'log');
      p.addEventListener('click', e => { if (e.target.dataset.a === 'ok') res(); });
    });
  }
}

UI.prototype.character = function (player, pop, planet, s) {
  return new Promise(res => {
    const person = id => pop.byId.get(id);
    const line = p => `<li><b>${esc(p.name)}</b>, ${p.age} — ${esc(occupationOf(pop, p))}<br><small>lives at ${esc(homeLabel(pop, p.home))}</small></li>`;
    const parents = player.family.parents.map(person), sibs = player.family.siblings.map(person);
    const unit = pop.unitByKey.get(player.homeUnit);
    const p = this.panel(`<h2>${esc(player.name)}</h2>
      <p class="lede">${player.age} years old · born in ${esc(s.name)}, ${esc(planet.name)}</p>
      <p>Lives ${player.withParents ? 'with family' : 'alone'} at ${esc(homeLabel(pop, player.homeUnit))}${unit ? '' : ''}.</p>
      <p>Occupation: <b>none</b> — looking for work. <small>(Jobs and careers are not simulated for you yet.)</small></p>
      <h3>Parents</h3><ul class="events">${parents.map(line).join('') || '<li class="none">Not living in town.</li>'}</ul>
      ${sibs.length ? `<h3>Siblings</h3><ul class="events">${sibs.map(line).join('')}</ul>` : ''}
      <p class="fine">Fatigue ${Math.round(player.fatigue * 100)}% · Fitness ${Math.round(player.fitness * 100)}%</p>
      <button data-a="ok" class="primary">Back</button>`, 'char');
    p.addEventListener('click', e => { if (e.target.dataset.a === 'ok') res(); });
  });
};
function occupationOf(pop, p) {
  if (p.job) { const j = pop.jobById.get(p.job); return `${j.title}, ${j.employer}`; }
  return p.age < 18 ? (p.age < 6 ? 'child' : 'student') : p.age >= 67 ? 'retired' : 'unemployed';
}
function homeLabel(pop, unitKey) {
  const u = pop.unitByKey.get(unitKey); if (!u) return 'unknown';
  return u.b.type === 'house' ? address(pop.s, u.b) : `Apt ${u.id}, ${address(pop.s, u.b)}`;
}

const TYPE_LABEL = { office: 'Administration', hab: 'Habitation block', store: 'Store', house: 'Dwelling', workshop: 'Workshop', hangar: 'Hangar' };
function labelFor(loc) {
  const b = loc.b;
  if (loc.roof) return `Roof — ${TYPE_LABEL[b.type]}`;
  const room = loc.room?.purpose ? ` · ${loc.room.purpose.replace('shopfloor-workshop', 'workshop floor').replace('shopfloor', 'shop floor')}` : '';
  return `${TYPE_LABEL[b.type]} — ${b.owner}${loc.plan?.F > 1 ? ` · floor ${loc.k + 1}` : ''}${room}`;
}

export function describeEvent(e, planet) {
  const when = `<span class="when">day ${dayNumber(planet, e.t)} ${formatHour(solarHour(planet, e.t))}</span>`;
  switch (e.type) {
    case 'forced_entry': return `${when} Forced entry at a ${esc(TYPE_LABEL[e.buildingType] || 'building')} owned by ${esc(e.owner)}, ${esc(e.settlementName)} — by ${esc(e.byName)}. ${e.witnesses?.length ? `Witnessed by ${e.witnesses.length}.` : 'No witnesses.'} <em>Unresolved.</em>`;
    case 'door_repaired': return `${when} ${esc(e.owner)} had a forced door repaired.`;
    case 'life_began': return `${when} The life of ${esc(e.name)} in ${esc(e.place)} begins.`;
    default: return `${when} ${esc(e.type)}`;
  }
}
