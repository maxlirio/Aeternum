// What a climber's hand is actually on. The climber (player/climber.js) chooses holds from what a wall is made of; here a
// hold becomes a grip (player/grasp.js) on the real thing: a ledge is felt for in the meshes that are drawn there
// (render/probe.js findLedge: where its top really is, how far out its lip comes, how deep it is, what's behind it),
// a corner is the wall's own arris, a drainpipe is the pipe. Worked out once per hold and kept, in world space.
import { findLedge } from '../render/probe.js';

const cache = new Map();
// h: { p, n, kind, a, face: { key, t, w } }; side 'l'|'r'; toRender / fromRender map world ⇄ render space
export function gripOfHold(h, side, probe, toRender, fromRender) {
  const key = `${h.face.key}|${h.a}|${h.p[1].toFixed(2)}|${h.kind}|${side}`; let G = cache.get(key);
  if (!G) {
    const n = h.n, O = [n[0], 0, n[1]], t = h.face.t;
    if (h.kind === 'corner') { const atEnd = h.a > h.face.w / 2, s = atEnd ? 1 : -1, back = atEnd ? h.face.w - h.a : h.a; G = { kind: 'corner', E: [h.p[0] + t[0] * s * back, h.p[1], h.p[2] + t[1] * s * back], O, Y: [t[0] * s, 0, t[1] * s] }; }
    else if (h.kind === 'pipe') { const R = [n[1], 0, -n[0]], k = side === 'r' ? 1 : -1; G = { kind: 'pipe', E: h.p.slice(), O, Y: [R[0] * k, 0, R[2] * k], r: 0.048, C: [0, 0], standoff: 0.09 }; }
    else {
      const L = probe ? findLedge(probe, toRender(...h.p), n) : null;
      if (L) G = { kind: L.top ? 'top' : 'ledge', E: fromRender(...L.E), O, Y: [0, 1, 0], d: Math.min(L.d, 2), th: L.th, felt: true };
      else G = { kind: h.kind === 'top' ? 'top' : 'ledge', E: [h.p[0] + n[0] * 0.09, h.p[1], h.p[2] + n[1] * 0.09], O, Y: [0, 1, 0], d: 0.09, th: 0.1, felt: false };
    }
    if (cache.size > 400) cache.clear(); cache.set(key, G);
  }
  const E = toRender(...G.E); return { ...G, E };
}
