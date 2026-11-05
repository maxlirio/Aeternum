// Every headless browser the tools start goes through here: see tools/guard.sh for what stops it.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// won't start a browser on a machine that's already short, or beside another of this project's browsers
export function preflight() {
  const free = Number(execFileSync('sysctl', ['-n', 'kern.memorystatus_level'], { encoding: 'utf8' }));
  if (free < 35) { console.error(`machine at ${free}% free: not starting a browser`); process.exit(75); }
  let others = '';
  try { others = execFileSync('pgrep', ['-f', 'user-data-dir=.*orbis-(e2e|shots)-'], { encoding: 'utf8' }).trim(); } catch {}
  if (others) { console.error(`another test browser is running (${others.split('\n').join(' ')}): not starting a second`); process.exit(75); }
}

export function guardBrowser(chrome, profile, { maxSeconds = 1800, maxMB = Number(process.env.GUARD_MAX_MB) || 7000 } = {}) {
  mkdirSync('out', { recursive: true });
  spawn('/bin/sh', ['tools/guard.sh', String(process.pid), String(chrome.pid), profile, String(maxSeconds), String(maxMB)],
    { stdio: ['ignore', 'ignore', 'inherit'], detached: true }).unref();
}
