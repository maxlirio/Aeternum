// Photographs the climber as a strip of frames (tools/climblab.html): front-quarter and side views.
//   node tools/climbstrip.mjs <name> "rig=real&scene=up"  → out/lab/<name>.png
// Its own headless Chrome (own profile), closed afterwards. Needs the server on 8517.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const [name = 'strip', qs = ''] = process.argv.slice(2), CDP = 9477, profile = join(tmpdir(), 'orbis-lab-' + process.pid);
mkdirSync('out/lab', { recursive: true });
if (qs.includes('rig=real') && !existsSync('out/lab/adventurer_body.glb')) copyFileSync(process.env.HOME + '/Developer/ADVENTURER/web/assets/adventurer_body.glb', 'out/lab/adventurer_body.glb');
const im = readFileSync('index.html', 'utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
writeFileSync('out/lab/lab.html', readFileSync('tools/climblab.html', 'utf8').replace('IMPORTMAP', im).replaceAll("'../js/", "'../../js/").replaceAll("'../out/lab/", "'./"));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1700,700', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${CDP}/json/version`); break; } catch { await sleep(200); } }
  const tg = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json(), ws = new WebSocket(tg.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), logs = []; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') logs.push(JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 500)); if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push(d.params.entry.text.slice(0, 200) + ' ' + (d.params.entry.url || '')); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Page.navigate', { url: `http://127.0.0.1:8517/out/lab/lab.html?${qs}` });
  let lab = null; for (let i = 0; i < 300 && !lab; i++) { await sleep(300); const r = await send('Runtime.evaluate', { expression: 'window.LAB ? JSON.stringify(window.LAB) : ""', returnByValue: true }); if (r.result?.result?.value) lab = JSON.parse(r.result.result.value); if (logs.length && i > 20) break; }
  const dims = await send('Runtime.evaluate', { expression: 'JSON.stringify([innerWidth, document.querySelector("canvas")?.width||0, document.querySelector("canvas")?.height||0])', returnByValue: true }), [, W, H] = JSON.parse(dims.result.result.value);
  await send('Emulation.setDeviceMetricsOverride', { width: W || 1600, height: H || 600, deviceScaleFactor: 1, mobile: false }); await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png' }); if (shot.result?.data) writeFileSync(`out/lab/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(name, lab ? `worst miss ${lab.worst.toFixed(3)} m, y ${lab.y.toFixed(1)}, ${lab.report.map(r => r.moving).join(' ')} ${lab.climberDone || ''}` : 'NOT DONE', logs.slice(0, 4).join(' | '));
} finally { try { process.kill(-chrome.pid); } catch {} await sleep(300); rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
