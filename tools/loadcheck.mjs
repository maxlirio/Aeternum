// Loads the game in fresh browsers until one stalls, then says what it was waiting for.
//   node tools/loadcheck.mjs [tries]
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms)), CDP = 9335, PORT = 8517, tries = +process.argv[2] || 6;
for (let n = 0; n < tries; n++) {
  preflight();
  const profile = join(tmpdir(), 'orbis-shots-lc' + process.pid + n);
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1280,800', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
  guardBrowser(chrome, profile, { maxSeconds: 200 });
  const killMe = () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} };
  let targets = null; for (let i = 0; i < 40 && !targets; i++) { await sleep(250); targets = await fetch(`http://127.0.0.1:${CDP}/json/list`).then(r => r.json()).catch(() => null); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), reqs = new Map(), logs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent') reqs.set(m.params.requestId, { url: m.params.request.url.replace(/^.*?:8517\//, ''), t: Date.now() });
    if (m.method === 'Network.loadingFinished') reqs.delete(m.params.requestId);
    if (m.method === 'Network.loadingFailed') { const q = reqs.get(m.params.requestId); logs.push('failed ' + q?.url + ' ' + m.params.errorText); reqs.delete(m.params.requestId); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200)); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Network.enable', { maxTotalBufferSize: 0, maxResourceBufferSize: 0 }); await send('Runtime.enable'); await send('Page.enable');
  const t0 = Date.now(); await send('Page.navigate', { url: process.env.URLTO || `http://127.0.0.1:${PORT}/?store=mem&seed=00c0ffee00b0a7e5&auto=new` });
  let ok = false, title = '';
  if (process.env.CLICK) for (let k = 0; k < 40; k++) { await sleep(500); const r = await send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('button,a')].find(x => x.textContent.includes(${JSON.stringify(process.env.CLICK)})); if (b) { b.click(); return true; } return false; })()` }); if (r?.result?.value) { console.log('  clicked', process.env.CLICK); break; } }
  while (Date.now() - t0 < 60000) { await sleep(500); const r = await Promise.race([send('Runtime.evaluate', { expression: 'document.title' }), sleep(5000).then(() => null)]); title = r?.result?.value ?? 'BLOCKED'; if (title === 'READY' || title.startsWith('ERROR')) { ok = title === 'READY'; break; } }
  console.log(`load ${n}: ${ok ? 'ok' : 'STALLED'} ${((Date.now() - t0) / 1000).toFixed(1)}s title=${title}`);
  if (!ok) { console.log('  pending:', [...reqs.values()].map(q => `${q.url} (${((Date.now() - q.t) / 1000) | 0}s)`).slice(0, 25).join(', ') || 'none'); console.log('  logs:', logs.slice(-14).join('\n        '));
    const st = await Promise.race([send('Runtime.evaluate', { expression: `JSON.stringify({ state: document.readyState, res: performance.getEntriesByType('resource').length, body: document.body?.innerText?.slice(0, 200), last: performance.getEntriesByType('resource').slice(-5).map(e => e.name.split('/').pop()) })` }), sleep(4000).then(() => null)]); console.log('  page:', st?.result?.value); }
  ws.close(); killMe(); await sleep(400); try { rmSync(profile, { recursive: true, force: true }); } catch {} await sleep(3600);
  if (!ok) break;
}
process.exit(0);
