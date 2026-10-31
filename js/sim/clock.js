// Game time runs at real-world speed: game seconds advance one per real second.
// gameTime is "seconds since the universe's epoch"; planets map it to local solar
// time with their own day length.

export class GameClock {
  constructor(gameTime, realTimeMs) { this.base = gameTime; this.real0 = realTimeMs; this.skip = 0; }
  now(realMs = Date.now()) { return this.base + (realMs - this.real0) / 1000 + this.skip; }
  // Developer time-skip (T key). Recorded through the same path as offline time.
  advance(seconds) { this.skip += seconds; }
}

// Local solar hour [0, 24) on the M1 surface patch (planet "hours" are dayLength/24).
export function solarHour(planet, t) {
  const f = t / planet.dayLength + 0.3;         // epoch starts mid-morning
  return (f - Math.floor(f)) * 24;
}
export const EPOCH = 3.2e9;                     // universe clock when the first life begins
// Day count since the universe's epoch (day 1 = the first day).
export const dayNumber = (planet, t) => Math.floor(t / planet.dayLength + 0.3) - Math.floor(EPOCH / planet.dayLength + 0.3) + 1;
export const planetHours = (planet, seconds) => seconds / planet.dayLength * 24;

export function isNight(planet, t) { const h = solarHour(planet, t); return h < 6 || h >= 19.5; }

export function within(hours, h) { return hours[0] <= hours[1] ? h >= hours[0] && h < hours[1] : h >= hours[0] || h < hours[1]; }

export function formatHour(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }

export function formatDuration(sec) {
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86400).toFixed(1)} days`;
}
