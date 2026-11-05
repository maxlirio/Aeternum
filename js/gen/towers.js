// Open steelwork you can climb: masts, pylons, headframes, watchtowers, lattice water towers. Each is a tapering
// four-legged frame, described here to match its model: the legs are holds all the way up and the rings between them are rails.
import { smallById } from './smallgen.js';

const FIXED = {
  radiomast: { h: 34, b: 0.9, t: 0.225, step: 2 },
  watchtower: { h: 10, b: 1.8, t: 0.45, step: 2, deck: { y: 10.2, half: 2.1 } },
  pylon: { h: 28, b: 3, t: 0.75, step: 2 },
  headframe: { h: 22, b: 4, t: 1, step: 2 },
  drillrig: { h: 14, b: 1.3, t: 0.325, step: 2 },
  // up on city roofs
  antenna: { h: 6, b: 0.12, t: 0.08, step: 1 }, aerial: { h: 4, b: 0.1, t: 0.07, step: 1 }, antennacluster: { h: 6, b: 0.45, t: 0.12, step: 1.2 }, watertower: { h: 5, b: 1.3, t: 1, step: 1.5 }, crane: { h: 28, b: 1, t: 1, step: 2 },
};
export function towerOf(planet, it) {
  const k = it.k.replace(/^fam_/, '').replace(/_\d+$/, '');
  if (FIXED[k]) return FIXED[k];
  if (k === 'sm_watertower' || k === 'sm_windpump' || k === 'sm_poweredge') {
    const D = smallById(planet, it.k); if (!D) return null;
    if (k === 'sm_watertower') { const L = D.r * 0.72; return { h: D.h, b: L, t: L * 0.7, step: D.h * 0.3 }; }
    if (D.shape !== 'lattice') return null;
    if (k === 'sm_poweredge') return { h: D.h, b: 0.16, t: 0.16, step: 0.7 };
    return { h: D.h, b: D.r ?? 1, t: (D.r ?? 1) * 0.3, step: 1.2 };
  }
  return null;
}
