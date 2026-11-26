// Finding the way through a town's streets, for the war on foot (sim/infantry.js) and its armour (sim/armor.js). The battlefield is cut into
// squares (CELL m) in the line's own frame (a across the border, s along it); a square is shut where something's built on it (asked of
// the world once per square, as the search comes to it, and remembered). path() is the shortest way over open squares, pulled straight
// wherever the next corner can be seen from the last. Pure: knows only built(a, s, pad).
const CELL = 1.5;

export class TownNav {
  // built(a, s, pad) → is that inside something built; A, S: half extents across and along; pad: how far a body keeps off a wall
  constructor(built, A, S, pad = 0.5, cell = CELL) {
    this.built = built; this.cell = cell; this.pad = pad; this.A = A; this.S = S; this.na = Math.ceil(2 * A / cell); this.ns = Math.ceil(2 * S / cell);
    this.c = new Int8Array(this.na * this.ns);      // 0 not asked yet, 1 open, 2 shut
    this.g = new Float32Array(this.na * this.ns); this.from = new Int32Array(this.na * this.ns); this.mark = new Int32Array(this.na * this.ns); this.run = 0;
  }
  ia(a) { return Math.floor((a + this.A) / this.cell); } is(s) { return Math.floor((s + this.S) / this.cell); }
  ca(i) { return (i + 0.5) * this.cell - this.A; } cs(j) { return (j + 0.5) * this.cell - this.S; }
  open(i, j) { if (i < 0 || j < 0 || i >= this.na || j >= this.ns) return false; const k = j * this.na + i; let v = this.c[k]; if (!v) v = this.c[k] = this.built(this.ca(i), this.cs(j), this.pad) ? 2 : 1; return v === 1; }
  openAt(a, s) { return this.open(this.ia(a), this.is(s)); }
  forget() { this.c.fill(0); }
  // nothing built on the straight line between them
  clear(a0, s0, a1, s1) { const L = Math.hypot(a1 - a0, s1 - s0), n = Math.max(1, Math.ceil(L / (this.cell * 0.5))); for (let k = 0; k <= n; k++) { const f = k / n; if (!this.openAt(a0 + (a1 - a0) * f, s0 + (s1 - s0) * f)) return false; } return true; }
  // the open square nearest (a, s), within a few squares: → [i, j] or null
  nearOpen(a, s, reach = 6) { const i0 = this.ia(a), j0 = this.is(s); if (this.open(i0, j0)) return [i0, j0]; let best = null, bd = 1e9;
    for (let R = 1; R <= reach && !best; R++) for (let di = -R; di <= R; di++) for (let dj = -R; dj <= R; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== R || !this.open(i0 + di, j0 + dj)) continue; const d = Math.hypot(this.ca(i0 + di) - a, this.cs(j0 + dj) - s); if (d < bd) { bd = d; best = [i0 + di, j0 + dj]; } }
    return best; }
  // the way from (a0, s0) to (a1, s1): → [[a, s], …] corners to go by, ending at the goal (or as near it as there's open ground); null if there's none
  path(a0, s0, a1, s1, most = 9000) {
    const A = this.nearOpen(a0, s0), B = this.nearOpen(a1, s1, 10); if (!A || !B) return null;
    const na = this.na, start = A[1] * na + A[0], goal = B[1] * na + B[0]; if (start === goal) return [[a1, s1]];
    const run = ++this.run, g = this.g, from = this.from, mark = this.mark, heap = [], f = [];
    const push = (k, v) => { let i = heap.length; heap.push(k); f.push(v); while (i > 0) { const p = (i - 1) >> 1; if (f[p] <= v) break; heap[i] = heap[p]; f[i] = f[p]; i = p; } heap[i] = k; f[i] = v; };
    const pop = () => { const top = heap[0], k = heap.pop(), v = f.pop(), n = heap.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && f[c + 1] < f[c]) c++; if (f[c] >= v) break; heap[i] = heap[c]; f[i] = f[c]; i = c; } heap[i] = k; f[i] = v; } return top; };
    const h = k => { const di = Math.abs(k % na - B[0]), dj = Math.abs(Math.floor(k / na) - B[1]); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    g[start] = 0; from[start] = -1; mark[start] = run; push(start, h(start)); let n = 0, found = false;
    while (heap.length && n++ < most) { const k = pop(); if (k === goal) { found = true; break; } const i = k % na, j = Math.floor(k / na), gk = g[k];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { if (!di && !dj) continue; const i2 = i + di, j2 = j + dj; if (!this.open(i2, j2)) continue; if (di && dj && !(this.open(i + di, j) && this.open(i, j + dj))) continue;      // (no cutting a corner)
        const k2 = j2 * na + i2, g2 = gk + (di && dj ? 1.414 : 1); if (mark[k2] === run && g[k2] <= g2) continue; mark[k2] = run; g[k2] = g2; from[k2] = k; push(k2, g2 + h(k2)); } }
    if (!found) return null;
    const cells = []; for (let k = goal; k !== -1; k = from[k]) cells.push(k); cells.reverse();
    const P = cells.map(k => [this.ca(k % na), this.cs(Math.floor(k / na))]); P[0] = [a0, s0]; if (this.openAt(a1, s1)) P[P.length - 1] = [a1, s1];
    // pulled straight: from each corner kept, on to the furthest one still in plain sight
    const out = []; let i = 0; while (i < P.length - 1) { let j = P.length - 1; while (j > i + 1 && !this.clear(P[i][0], P[i][1], P[j][0], P[j][1])) j--; out.push(P[j]); i = j; }
    return out;
  }
}
