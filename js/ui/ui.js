// DOM overlays: title, loading, HUD, prompts, toasts, pause menu, leave dialog,
// "while you were away" report. Plain DOM, no framework.
import { ACTIVITIES } from '../sim/processes/character.js';
import { formatDuration, formatHour, solarHour, dayNumber } from '../sim/clock.js';
import { address } from '../gen/settlement.js';
import { SKILLS, titleOf, roleFor, wageOf, assess } from '../gen/careers.js';

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
        <div class="bar"><span>Fitness</span><i><b class="fitness"></b></i></div>
        <div class="credits"></div><div class="job"></div><div class="law"></div></div>
      <div class="debug hidden"></div>`;
    this.prompt = el('div', 'prompt hidden'); this.root.append(this.prompt);
    this.toasts = el('div', 'toasts'); this.root.append(this.toasts);
    this.hint = el('div', 'hint hidden', 'Click to look around · WASD move · Shift run · Space jump · E use · hold F force · J work · C you · Esc menu'); this.root.append(this.hint);
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
    $('.place', this.hud).textContent = located ? (located.b ? labelFor(located, g.cell) : s.name) : s.name;
    $('.where .sub', this.hud).textContent = located?.b ? `${s.name} · ${planet.name}` : `${planet.name}`;
    $('.time', this.hud).textContent = formatHour(h);
    $('.clock .sub', this.hud).textContent = `Day ${dayNumber(planet, t)} · ${(planet.dayLength / 3600).toFixed(1)} h day`;
    $('.who', this.hud).textContent = `${player.name}, ${player.age}`;
    $('.fatigue', this.hud).style.width = Math.round(player.fatigue * 100) + '%';
    $('.fitness', this.hud).style.width = Math.round(player.fitness * 100) + '%';
    const cr = $('.credits', this.hud); cr.textContent = `${player.credits ?? 0} cr`; cr.classList.toggle('debt', (player.credits ?? 0) < 0);
    const lw = $('.law', this.hud), owed = (player.fines || []).reduce((n, f) => n + f.amount, 0);
    lw.innerHTML = player.custody ? `<b class="late">In custody</b> until ${formatHour(solarHour(planet, player.custody.until))}`
      : player.warrant ? `<b class="late">Wanted</b> — ${esc(player.warrant.reason)}` : owed ? `Owes ${owed} cr in fines` : '';
    const jb = $('.job', this.hud), pj = player.job, sh = player.shift;
    if (!pj) jb.textContent = 'Unemployed';
    else if (sh && t >= sh.t0 && t < sh.t1) jb.innerHTML = `${esc(titleOf(pj))} · <b class="${g.atWork ? 'on' : 'late'}">${g.atWork ? 'on shift' : 'shift started — not at work'}</b> until ${formatHour(solarHour(planet, sh.t1))}`;
    else if (sh) jb.textContent = `${titleOf(pj)} · next shift ${sh.t0 - t < planet.dayLength ? formatHour(solarHour(planet, sh.t0)) : 'day ' + dayNumber(planet, sh.t0) + ' ' + formatHour(solarHour(planet, sh.t0))}`;
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
      const opts = Object.entries(ACTIVITIES).filter(([, a]) => !a.needsJob || player.job).map(([k, a]) => `<button data-a="${k}"><b>${a.label}</b><small>${a.desc}</small></button>`).join('');
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
      const evs = r.events.filter(e => e.type !== 'shift_worked').map(e => `<li>${describeEvent(e, planet)}</li>`).join('') || '<li class="none">Nothing you know of changed in town.</li>';
      const p = this.panel(`<h2>While you were away</h2>
        <p class="lede">${formatDuration(r.elapsed)} passed${r.activity && r.activity !== 'idle' ? ` · ${esc(ACTIVITIES[r.activity]?.label || r.activity)}` : ''}.</p>
        ${r.notes.map(n => `<p>${esc(n)}</p>`).join('')}
        ${shiftSummary(r.events)}
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

UI.prototype.character = function (player, pop, planet, s, polity) {
  return new Promise(res => {
    const person = id => pop.byId.get(id);
    const line = p => `<li><b>${esc(p.name)}</b>, ${p.age} — ${esc(occupationOf(pop, p))}<br><small>lives at ${esc(homeLabel(pop, p.home))}</small></li>`;
    const parents = player.family.parents.map(person), sibs = player.family.siblings.map(person);
    const unit = pop.unitByKey.get(player.homeUnit);
    const p = this.panel(`<h2>${esc(player.name)}</h2>
      <p class="lede">${player.age} years old · born in ${esc(s.name)}, ${esc(planet.name)}</p>
      <p>Lives ${player.withParents ? 'with family' : 'alone'} at ${esc(homeLabel(pop, player.homeUnit))}${unit ? '' : ''}.</p>
      <p>Occupation: ${player.job ? `<b>${esc(titleOf(player.job))}</b>, ${esc(player.job.employer)} — ${player.job.wage} cr/h, ${player.job.shifts} shifts worked` : '<b>none</b> — looking for work <small>(J)</small>'}</p>
      <h3>Skills</h3>${Object.entries(SKILLS).map(([k, n]) => `<div class="bar"><span>${n}</span><i><b style="width:${Math.round((player.skills?.[k] || 0) * 100)}%"></b></i></div>`).join('')}
      ${player.career?.length ? `<h3>Work history</h3><ul class="events">${player.career.map(c => `<li><span class="when">day ${dayNumber(planet, c.from)}–${dayNumber(planet, c.to)}</span> ${esc(c.title)}, ${esc(c.employer)} — ${c.shifts} shifts, ${c.why}</li>`).join('')}</ul>` : ''}
      <h3>Parents</h3><ul class="events">${parents.map(line).join('') || '<li class="none">Not living in town.</li>'}</ul>
      ${sibs.length ? `<h3>Siblings</h3><ul class="events">${sibs.map(line).join('')}</ul>` : ''}
      <p>Credits: <b>${player.credits ?? 0} cr</b>${(player.credits ?? 0) < 0 ? ' <small>(in debt)</small>' : ''}</p>
      ${(player.fines || []).length ? `<p>Fines owed: <b>${player.fines.reduce((n, f) => n + f.amount, 0)} cr</b> — pay at the ${esc(polity.securityName)} office (J there).</p>` : ''}
      ${player.warrant ? `<p class="late">Wanted: ${esc(player.warrant.reason)}.</p>` : ''}
      <h3>Record — ${esc(polity?.name || '')}</h3><ul class="events">${(player.record || []).map(r => `<li><span class="when">day ${dayNumber(planet, r.t)}</span> ${esc(r.offence)} — fined ${r.fine} cr</li>`).join('') || '<li class="none">Clean.</li>'}</ul>
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
function labelFor(loc, cell) {
  const b = loc.b;
  if (cell && b.key === cell.b.key && loc.k === 0 && loc.room?.i === cell.room.i) return `${b.owner} · holding cell`;
  if (loc.roof) return `Roof — ${TYPE_LABEL[b.type]}`;
  const room = loc.room?.purpose ? ` · ${loc.room.purpose.replace('shopfloor-workshop', 'workshop floor').replace('shopfloor', 'shop floor')}` : '';
  return `${TYPE_LABEL[b.type]} — ${b.owner}${loc.plan?.F > 1 ? ` · floor ${loc.k + 1}` : ''}${room}`;
}

export function describeEvent(e, planet) {
  const when = `<span class="when">day ${dayNumber(planet, e.t)} ${formatHour(solarHour(planet, e.t))}</span>`;
  switch (e.type) {
    case 'forced_entry': return `${when} Forced entry at a ${esc(TYPE_LABEL[e.buildingType] || 'building')} owned by ${esc(e.owner)}, ${esc(e.settlementName)} — by ${esc(e.byName)}. ${e.witnesses?.length ? `Witnessed by ${e.witnesses.length}.` : 'No witnesses.'} <em>Unresolved.</em>`;
    case 'door_repaired': return `${when} ${esc(e.owner)} had a forced door repaired.`;
    case 'case_opened': return `${when} ${esc(e.reporter)} reported a break-in at ${esc(e.owner)}'s to ${esc(e.authority)}.`;
    case 'break_in_discovered': return `${when} ${esc(e.by)} found the door at ${esc(e.owner)}'s forced.`;
    case 'case_cold': return `${when} ${esc(e.authority)} closed the ${esc(e.owner)} break-in case unsolved.`;
    case 'fined': return `${when} ${esc(e.authority)} fined ${esc(e.whoName)} ${e.amount} ${esc(e.currency)} — ${esc(e.offence.toLowerCase())}.`;
    case 'hired': return `${when} ${esc(e.employer)} hired ${esc(e.whoName)} as ${esc(e.title.toLowerCase())}.`;
    case 'application_rejected': return `${when} ${esc(e.employer)} turned down ${esc(e.whoName)}'s application (${esc(e.title.toLowerCase())}) — ${esc(e.why)}.`;
    case 'shift_worked': return `${when} Worked a shift at ${esc(e.employer)} — paid ${e.pay} cr.`;
    case 'shift_missed': return `${when} Missed a shift at ${esc(e.employer)}${e.pay ? ` (paid ${e.pay} cr for the time you were there)` : ''}.`;
    case 'promoted': return `${when} Promoted to ${esc(e.title.toLowerCase())} at ${esc(e.employer)} — now ${e.wage} cr/h.`;
    case 'dismissed': return `${when} ${esc(e.employer)} let ${esc(e.whoName)} go — ${esc(e.why)}.`;
    case 'resigned': return `${when} ${esc(e.whoName)} left the job at ${esc(e.employer)}.`;
    case 'warrant': return `${when} ${esc(e.authority)} issued a warrant for ${esc(e.whoName)} — ${esc(e.reason)}.`;
    case 'arrested': return `${when} ${e.by ? esc(e.by) + ' of ' : ''}${esc(e.authority)} arrested ${esc(e.whoName)}${e.resisted ? ' after a chase' : ''}. ${e.paid ? `${e.paid} cr in fines taken; ` : ''}held ${e.hours} h.`;
    case 'released': return `${when} ${esc(e.whoName)} was released from the ${esc(e.authority)} cell.`;
    case 'fines_paid': return `${when} ${esc(e.whoName)} paid ${e.amount} cr in fines${e.cleared ? '; the warrant was withdrawn' : ''}.`;
    case 'life_began': return `${when} The life of ${esc(e.name)} in ${esc(e.place)} begins.`;
    default: return `${when} ${esc(e.type)}`;
  }
}

function shiftSummary(events) {
  const w = events.filter(e => e.type === 'shift_worked');
  if (!w.length) return '';
  return `<p>Worked <b>${w.length} shift${w.length > 1 ? 's' : ''}</b> at ${esc(w[0].employer)} — earned <b>${w.reduce((n, e) => n + e.pay, 0)} cr</b>.</p>`;
}

// The work panel: your job, your applications, and whatever openings are posted here.
//   listing: { title, note, jobs } or null when there's no board where you stand
UI.prototype.work = function ({ player, pop, planet, s, polity, t, listing, boardAt, civic }) {
  return new Promise(res => {
    const pj = player.job, sh = player.shift;
    const hours = h => `${formatHour(h[0])}–${formatHour(h[1])}`;
    const DAYS = d => d.map(x => 'day ' + (x + 1)).join(' & ');
    const mine = pj ? `<h3>Your job</h3><p><b>${esc(titleOf(pj))}</b> at ${esc(pj.employer)}, ${esc(address(s, pop.buildingByKey.get(pj.b)))}<br>
        <small>${hours(pj.hours)} · off ${DAYS(pj.offDays)} of each week · ${pj.wage} cr/h · ${pj.shifts} shifts, ${pj.earned} cr earned${pj.missed ? ` · <b class="late">${pj.missed} missed in a row</b>` : ''}</small><br>
        <small>${sh ? (t >= sh.t0 ? 'On shift now, until ' + formatHour(solarHour(planet, sh.t1)) : `Next shift day ${dayNumber(planet, sh.t0)} ${formatHour(solarHour(planet, sh.t0))}`) : ''}</small></p>
        <button data-a="resign" class="ghost">Resign</button>` : '<p>You have no job.</p>';
    const apps = player.applications.filter(a => a.status === 'pending');
    const pend = apps.length ? `<h3>Applications</h3><ul class="events">${apps.map(a => `<li>${esc(a.title)}, ${esc(a.employer)} — waiting for ${esc(a.reviewer)} to read it</li>`).join('')}</ul>` : '';
    let board = '';
    if (listing) {
      const seen = new Map();   // the same role at the same place and hours is one line ("2 openings")
      for (const j of listing.jobs) { const k = j.b + '|' + j.title + '|' + j.hours; seen.set(k, [...(seen.get(k) || []), j]); }
      const rows = [...seen.values()].map(([j, ...more]) => {
        const R = roleFor(j), a = assess(pop, polity, player, j), b = pop.buildingByKey.get(j.b);
        const verdict = a.chance === 0 ? `<span class="late">${esc(a.why)}</span>` : a.chance > 0.6 ? 'You are a strong candidate' : a.chance > 0.3 ? 'You qualify' : 'You only just qualify';
        return `<li><b>${esc(j.title)}</b> — ${esc(j.employer)}, ${esc(address(s, b))}<br><small>${more.length ? `${more.length + 1} openings · ` : ''}${hours(j.hours)} · ${wageOf(j)} cr/h · ${SKILLS[R.skill]} ${Math.round(R.min * 100)}%${R.fitness ? `, fitness ${Math.round(R.fitness * 100)}%` : ''} · ${verdict}</small>
          <button data-a="apply" data-job="${j.id}" ${pj?.id === j.id ? 'disabled' : ''}>Apply</button></li>`;
      }).join('') || '<li class="none">Nothing posted this week.</li>';
      board = `<h3>${esc(listing.title)}</h3><p class="fine">${esc(listing.note)}</p><ul class="events jobs">${rows}</ul>`;
    } else board = `<p class="fine">Openings are posted on the job board at ${esc(boardAt)}; each workplace also lists its own — ask inside one.</p>`;
    const owed = (player.fines || []).reduce((n, f) => n + f.amount, 0);
    const fines = civic && (owed || player.warrant) ? `<h3>Fines — ${esc(polity.securityName)}</h3><ul class="events">${(player.fines || []).map(f => `<li>${esc(f.offence)} — ${f.amount} cr <small>due day ${dayNumber(planet, f.due)}</small></li>`).join('')}</ul>
      ${player.warrant ? `<p class="late">There is a warrant for you (${esc(player.warrant.reason)}). Paying in full here withdraws it.</p>` : ''}
      <button data-a="pay" ${owed && (player.credits ?? 0) >= owed ? '' : 'disabled'}>Pay ${owed} cr${(player.credits ?? 0) < owed ? ` — you have ${player.credits} cr` : ''}</button>` : '';
    const p = this.panel(`<h2>${civic ? 'Civic office' : 'Work'}</h2>${fines}${mine}${pend}${board}<button data-a="ok" class="primary">Back</button>`, 'work');
    p.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'resign' && !confirm('Resign from ' + pj.employer + '?')) return;
      res({ a, job: btn.dataset.job });
    });
  });
};
