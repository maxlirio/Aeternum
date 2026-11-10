// What's been generated, kept between visits: the rivers of the country you've been through, the roads between its towns.
// It's all a pure function of the seed (it would come out the same anyway), so this is only to make coming back instant and to let
// the world forget what's far away without paying to work it out again. Its own database, apart from the save (world/store-idb.js):
// clearing it loses nothing but time. Keys carry the planet and the generator's version, so a new generator never reads old data.
import { GEN_VERSION } from './store.js';

const DB = 'orbis-gen', STORE = 'cells';
export class GenCache {
  constructor(planet) { this.prefix = `${planet.address.key}|${planet.seed.join(':')}|v${GEN_VERSION}|`; this.mem = new Map(); this.db = null; this.ready = this.open(); this.hits = 0; this.puts = 0; }
  async open() {
    if (typeof indexedDB === 'undefined') return null;
    try {
      this.db = await new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    } catch (e) { console.warn('generated-data cache unavailable', e); this.db = null; }
    return this.db;
  }
  key(kind, k) { return this.prefix + kind + '|' + k; }
  async get(kind, k) {
    const K = this.key(kind, k); if (this.mem.has(K)) { this.hits++; return this.mem.get(K); }
    await this.ready; if (!this.db) return undefined;
    const v = await new Promise(ok => { try { const r = this.db.transaction(STORE).objectStore(STORE).get(K); r.onsuccess = () => ok(r.result); r.onerror = () => ok(undefined); } catch { ok(undefined); } });
    if (v !== undefined) { this.hits++; this.mem.set(K, v); if (this.mem.size > 400) this.mem.delete(this.mem.keys().next().value); }
    return v;
  }
  async put(kind, k, v) {
    const K = this.key(kind, k); this.mem.set(K, v); if (this.mem.size > 400) this.mem.delete(this.mem.keys().next().value); this.puts++;
    await this.ready; if (!this.db) return;
    try { this.db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, K); } catch (e) { /* (full or blocked: it's only a cache) */ }
  }
}

// Where you've been: the 12 km cells you've passed through, kept in the save. It's what the map will draw, and what's worth warming from the cache when you start.
export function noteExplored(player, ci, cj) {
  const k = ci + ',' + cj, E = player.explored || (player.explored = []);
  if (E.includes(k)) return false; E.push(k); return true;
}
