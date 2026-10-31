// Integer hashing. Every deterministic value in the universe descends from these.
// Pure 32-bit integer maths (Math.imul, shifts) so results are bit-identical in
// every JS engine — no floats, no Math.sin.

export function mix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Fold a list of 32-bit ints into one hash, starting from a 32-bit seed.
export function hashInts(seed, ints) {
  let h = mix32((seed >>> 0) ^ 0x9e3779b9);
  for (let i = 0; i < ints.length; i++) {
    h = mix32(h ^ mix32((ints[i] | 0) + Math.imul(i + 1, 0x632be5ab)));
  }
  return h;
}

export function hashStr(seed, s) {
  let h = mix32((seed >>> 0) ^ 0x2545f491);
  for (let i = 0; i < s.length; i++) h = mix32(h ^ Math.imul(s.charCodeAt(i) + 1, 0x01000193));
  return mix32(h ^ s.length);
}

// A Seed is a pair of independent 32-bit lanes (64 bits of identity). Children are
// derived by hashing the parent with a kind tag and integer coordinates.
export function makeSeed(hi, lo) { return [hi >>> 0, lo >>> 0]; }

export function seedFromString(s) { return makeSeed(hashStr(0x51ed270b, s), hashStr(0x7f4a7c15, s)); }

export function derive(seed, kind, ints = []) {
  const k = hashStr(0, kind);
  const hi = hashInts(seed[0] ^ k, ints);
  const lo = hashInts(mix32(seed[1] + k), [...ints, seed[0]]);
  return [hi, lo];
}

export function seedHex(seed) {
  return seed[0].toString(16).padStart(8, '0') + seed[1].toString(16).padStart(8, '0');
}
export function seedFromHex(hex) {
  return makeSeed(parseInt(hex.slice(0, 8), 16), parseInt(hex.slice(8, 16), 16));
}

// Stateless value in [0,1) for (seed, ints) — for per-cell decisions without a PRNG.
export function hash01(seed, ints) { return hashInts(seed[0] ^ seed[1], ints) / 4294967296; }
