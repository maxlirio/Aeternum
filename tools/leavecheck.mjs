// A real life, left and come back to: real browser storage, the same browser profile. Says what the screen shows and any errors.
//   URLTO=<url> node tools/leavecheck.mjs
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms)), CDP = 9336, URLTO = process.env.URLTO || 'http://127.0.0.1:8517/';
preflight();
const profile = join(tmpdir(), 'orbis-shots-lv' + process.pid);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1400,850', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore', detached: true });
guardBrowser(chrome, profile, { maxSeconds: 280 });
const finish = c => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(c); };
let targets = null; for (let i = 0; i < 40 && !targets; i++) { await sleep(250); targets = await fetch(`http://127.0.0.1:${CDP}/json/list`).then(r => r.json()).catch(() => null); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), logs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 500)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 500)); if (m.method === 'Network.loadingFailed' && !m.params.canceled) logs.push('NET ' + m.params.errorText); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
const click = t => ev(`(() => { const b = [...document.querySelectorAll('button,a,[role=button],li')].find(x => x.textContent.includes(${JSON.stringify(t)})); if (b) { b.click(); return true; } return false; })()`);
const until = async (f, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(f).catch(() => false)) return true; await sleep(400); } return false; };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.data) writeFileSync(`out/shots/${n}.png`, Buffer.from(r.data, 'base64')); };
const state = () => ev(`JSON.stringify({ title: document.title, ready: !!window.ORBIS?.ready, canvas: !!document.querySelector('canvas'), text: document.body.innerText.slice(0, 220) })`);
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Page.navigate', { url: URLTO }); await sleep(2000);
await until(`[...document.querySelectorAll('button,a')].some(x => x.textContent.includes('Begin a life'))`); await click('Begin a life');
console.log('started', await until('window.ORBIS?.ready'), await state());
await sleep(3000);
const how = process.env.SCENE || ''; if (how) { console.log('scene', await ev(`(async () => { ${how} })()`)); await sleep(1500); }
// the menu
await ev(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); 1`); await sleep(700);
console.log('menu', await state());
const left = await click(process.env.LEAVE || 'Leave'); console.log('clicked leave', left); await sleep(1500);
for (let k = 0; k < 4; k++) { const st = await state(); console.log('after leave', k, st); const o = await ev(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t).slice(0, 8).join(' | ')`); console.log(' buttons', o); if (!o) break; const pick = [process.env.WHICH || 'Rest', 'Stay'].find(w => o.includes(w)); if (!pick) break; await click(pick); await sleep(1500); }
await shot('leave_after'); console.log('url now', await ev('location.href'));
if (process.env.RETURN) { console.log('return', await click('Return now')); await sleep(5000); console.log('returned', await state()); } else { await send('Page.navigate', { url: URLTO }); await sleep(6000); }
console.log('reopened', await state()); await shot('leave_reopen');
const cont = await ev(`[...document.querySelectorAll('button,a')].map(b => b.textContent.trim()).join(' | ')`); console.log(' options', cont);
if (await click('Continue')) { console.log('clicked continue'); console.log('ready again', await until('window.ORBIS?.ready', 70000), await state()); await sleep(3000); await shot('leave_back'); }
console.log('LOGS', JSON.stringify(logs, null, 0).slice(0, 3000));
finish(0);
