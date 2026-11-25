// The height of the land, remembered. Asking the world how high the ground is costs a great deal (its shape, the rivers, roads and craters round it),
// and a battle asks thousands of times a frame, mostly about the same few hundred metres. This keeps the real heights on a lattice (`cell` metres),
// worked out as they're first wanted, and answers between them; drop(x, z, r) forgets what a shell has just changed.
export function heightCache(fn, cell = 0.5, maxTiles = 900) {
  const tiles = new Map(), N = 32, S = N + 1;
  const tileOf = (tx, tz) => { const key = (tx + 524288) * 1048576 + (tz + 524288); let T = tiles.get(key);
    if (!T) { if (tiles.size >= maxTiles) tiles.delete(tiles.keys().next().value); T = new Float32Array(S * S).fill(NaN); tiles.set(key, T); } return T; };
  const at = (ix, iz) => { const tx = Math.floor(ix / N), tz = Math.floor(iz / N), T = tileOf(tx, tz), k = (iz - tz * N) * S + (ix - tx * N); let h = T[k]; if (h !== h) h = T[k] = fn(ix * cell, iz * cell); return h; };
  const get = (x, z) => { const gx = x / cell, gz = z / cell, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const a = at(ix, iz), b = at(ix + 1, iz), c = at(ix, iz + 1), d = at(ix + 1, iz + 1); return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz; };
  get.drop = (x, z, r) => { const w = N * cell; for (let tx = Math.floor((x - r) / w) - 1; tx <= Math.floor((x + r) / w); tx++) for (let tz = Math.floor((z - r) / w) - 1; tz <= Math.floor((z + r) / w); tz++) tiles.delete((tx + 524288) * 1048576 + (tz + 524288)); };
  get.clear = () => tiles.clear();
  return get;
}
