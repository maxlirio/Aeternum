// IndexedDB backend. One database per save slot; object stores mirror WorldStore.
const STORES = ['kv', 'deltas', 'events'];

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export class IDBBackend {
  constructor(slot = 'main') { this.name = 'orbis-' + slot; this.db = null; }
  async openDb() {
    if (this.db) return this.db;
    const r = indexedDB.open(this.name, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('kv'); db.createObjectStore('deltas'); db.createObjectStore('events', { keyPath: 'id' });
    };
    this.db = await req(r);
    // Ask the browser not to evict this origin's data under storage pressure.
    try { await navigator.storage?.persist?.(); } catch {}
    return this.db;
  }
  async load() {
    const db = await this.openDb();
    const tx = db.transaction(STORES, 'readonly');
    const meta = await req(tx.objectStore('kv').get('meta'));
    if (!meta) return null;
    const player = await req(tx.objectStore('kv').get('player'));
    const jobs = (await req(tx.objectStore('kv').get('jobs'))) || [];
    const keys = await req(tx.objectStore('deltas').getAllKeys());
    const vals = await req(tx.objectStore('deltas').getAll());
    const events = await req(tx.objectStore('events').getAll());
    return { meta, player, jobs, deltas: keys.map((k, i) => [k, vals[i]]), events };
  }
  async save(b) {
    const db = await this.openDb();
    const tx = db.transaction(STORES, 'readwrite');
    const kv = tx.objectStore('kv'), ds = tx.objectStore('deltas'), es = tx.objectStore('events');
    if (b.wipe) { kv.clear(); ds.clear(); es.clear(); }
    kv.put(b.meta, 'meta');
    if (b.player !== undefined) kv.put(b.player, 'player');
    if (b.jobs !== undefined) kv.put(b.jobs, 'jobs');
    for (const [k, v] of b.deltas) v === undefined ? ds.delete(k) : ds.put(v, k);
    for (const e of b.events) es.put(e);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }
  async destroy() { this.db?.close(); this.db = null; await req(indexedDB.deleteDatabase(this.name)); }
}
