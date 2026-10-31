// Headless-Chrome screenshots of the real game, via the DevTools protocol.
//   node tools/shots.mjs [name...]   → out/shots/<name>.png
// Uses an isolated in-memory save (?store=mem) and a fixed seed so shots are repeatable.
// Kills only the Chrome it started (own --user-data-dir).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9333;
const SHOTS = {
  aerial: 'cam=aerial&hour=15', far: 'cam=far&hour=9', street: 'cam=street&hour=10', door: 'cam=door&hour=16',
  interior: 'cam=interior&hour=13', stairs: 'cam=stairs&hour=13', night: 'cam=aerial&hour=22', dusk: 'cam=street&hour=19',
  play: 'hour=11', people: 'cam=people&hour=17.3', work: 'cam=work&hour=11', patrol: 'cam=patrol&hour=10.3', sleep: 'cam=sleep&hour=2.5',
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
const seed = process.env.SEED || '00c0ffee00b0a7e5';
mkdirSync('out/shots', { recursive: true });
const profile = join(tmpdir(), 'orbis-shots-' + process.pid);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1600,900',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; chrome.stderr.on('data', d => { stderr += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let ver;
  for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(200); } }
  for (const name of want) {
    const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pending = new Map(); const logs = [];
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).slice(0, 400));
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) logs.push(msg.params.type + ' ' + msg.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
      if (msg.method === 'Network.loadingFailed') logs.push('NETFAIL ' + msg.params.errorText);
    };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    const url = `http://127.0.0.1:${PORT}/?store=mem&auto=new&seed=${seed}&${SHOTS[name]}`;
    const t0 = Date.now();
    await send('Page.navigate', { url });
    let ready = false;
    while (Date.now() - t0 < 120000) {
      const r = await send('Runtime.evaluate', { expression: 'document.title' });
      const title = r.result?.result?.value || '';
      if (title === 'READY') { ready = true; break; }
      if (title.startsWith('ERROR')) { logs.push(title); break; }
      await sleep(500);
    }
    await sleep(2500);
    const info = await send('Runtime.evaluate', { expression: 'JSON.stringify({ r: window.ORBIS?.renderer?.info?.render, ui: document.querySelector(".debug")?.textContent })' });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`out/shots/${name}.png`, Buffer.from(shot.result.data, 'base64'));
    console.log(`${name}: ${ready ? 'ok' : 'NOT READY'} ${((Date.now() - t0) / 1000).toFixed(1)}s ${info.result?.result?.value || ''}`);
    for (const l of logs.slice(0, 12)) console.log('   ', l);
    ws.close();
    await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`);
  }
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  if (process.env.DEBUG) console.log(stderr.slice(-2000));
}
