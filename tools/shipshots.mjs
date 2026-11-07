// A partial model file, one picture per model, four sides each: node tools/shipshots.mjs <glb> <kind[:paint]> ... → out/booth/<kind>.jpg
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [glb, ...kinds] = process.argv.slice(2), PORT = 8517, CDP = 9343, profile = join(tmpdir(), 'orbis-booth-' + process.pid);
preflight(); mkdirSync('out/booth', { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1600,1000', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
guardBrowser(chrome, profile, { maxSeconds: 240 });
const stop = () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
for (const sig of ['SIGALRM', 'SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(124); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${CDP}/json/version`); break; } catch { await sleep(200); } }
  const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json(), ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errs = []; ws.onmessage = m => { const x = JSON.parse(m.data); if (x.id) pend.get(x.id)?.(x); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description || x.params.exceptionDetails.text); if (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error') errs.push(x.params.args.map(a => a.value || a.description).join(' ').slice(0, 400)); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  for (const k of kinds) { const [kind, paint = 1] = k.split(':'); await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/shipbooth.html?glb=${encodeURIComponent('../' + glb)}&props=../out/partial-props.glb&v=${kind}&paint=${paint}&zoom=${process.env.ZOOM || 1}` });
    let ti = ''; for (let i = 0; i < 60 && ti !== 'READY'; i++) { await sleep(500); ti = (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.result?.value; if (errs.length) break; }
    if (ti !== 'READY') console.log((await send('Runtime.evaluate', { expression: `JSON.stringify(performance.getEntriesByType('resource').map(r => [r.name.split('/').pop().slice(0, 40), Math.round(r.responseEnd)]).slice(-12))`, returnByValue: true })).result.result?.value); const a = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 }); writeFileSync(`out/booth/${kind}${process.env.ZOOM ? '-z' : ''}.jpg`, Buffer.from(a.result.data, 'base64')); console.log(kind, ti, errs.splice(0).join(' | ').slice(0, 400)); }
  ws.close();
} finally { stop(); }
process.exit(0);
