// Each kind of place is furnished as what it is. Kit models on the floor of its main room, solid.
// [kit name, width, depth, height, where: 'back' wall, 'side' wall, 'mid'dle, 'front', count]
const INTERIOR = {
  cantina: { clear: true, set: [['bar_shelf', 3.4, 0.3, 2.4, 'back'], ['bar_counter', 4.2, 0.7, 1.15, 'bar'], ['booth', 1.6, 2.2, 1.2, 'side', 2], ['pooltable', 2.5, 1.4, 0.9, 'mid'], ['jukebox', 0.9, 0.55, 1.5, 'side'], ['arcade', 0.75, 0.7, 1.8, 'side']], stools: true },
  'noodle bar': { clear: true, set: [['bar_counter', 4.2, 0.7, 1.15, 'bar'], ['bar_shelf', 3.4, 0.3, 2.4, 'back'], ['booth', 1.6, 2.2, 1.2, 'side', 3], ['waterdispenser', 0.32, 0.32, 1.4, 'side']], stools: true, kits: 'common' },
  den: { clear: true, set: [['booth', 1.6, 2.2, 1.2, 'side', 3], ['pooltable', 2.5, 1.4, 0.9, 'mid'], ['arcade', 0.75, 0.7, 1.8, 'back', 2], ['jukebox', 0.9, 0.55, 1.5, 'back']] },
  pawnshop: { set: [['displaycase', 1.6, 0.6, 1.4, 'mid', 2], ['guitar', 0.4, 0.8, 0.2, 'side'], ['suitcase', 0.46, 0.3, 0.9, 'side'], ['mannequin', 0.4, 0.4, 1.7, 'side']] },
  workshop: { set: [['workbench', 2.2, 0.8, 1.05, 'back'], ['pegboard', 1.6, 0.05, 1.9, 'side'], ['toolbox', 0.42, 0.2, 0.3, 'side'], ['tyre', 0.72, 0.72, 0.18, 'side'], ['gascan', 0.3, 0.16, 0.45, 'side']] },
  'chop shop': { set: [['workbench', 2.2, 0.8, 1.05, 'back'], ['jackstand', 0.25, 0.25, 0.5, 'mid', 2], ['tyre', 0.72, 0.72, 0.18, 'side', 2], ['pallettruck', 0.7, 1.4, 1.2, 'side'], ['gascan', 0.3, 0.16, 0.45, 'side']] },
  shophouse: { set: [['displaycase', 1.6, 0.6, 1.4, 'mid'], ['clothesrack', 1.7, 0.5, 1.5, 'side'], ['freezer', 2.0, 0.85, 0.9, 'side'], ['mannequin', 0.4, 0.4, 1.7, 'side']] },
  flophouse: { set: [['bedframe', 2.0, 1.4, 0.75, 'side', 2], ['wastebin', 0.27, 0.27, 0.33, 'side'], ['backpack', 0.34, 0.25, 0.55, 'side']] },
  // the country's places, fitted out the same way
  inn: { clear: true, set: [['bar_shelf', 3.4, 0.3, 2.4, 'back'], ['bar_counter', 4.2, 0.7, 1.15, 'bar'], ['booth', 1.6, 2.2, 1.2, 'side', 2], ['jukebox', 0.9, 0.55, 1.5, 'side']], stools: true },
  shop: { set: [['displaycase', 1.6, 0.6, 1.4, 'mid'], ['clothesrack', 1.7, 0.5, 1.5, 'side'], ['freezer', 2.0, 0.85, 0.9, 'side'], ['suitcase', 0.46, 0.3, 0.9, 'side']] },
  smithy: { set: [['workbench', 2.2, 0.8, 1.05, 'back'], ['pegboard', 1.6, 0.05, 1.9, 'side'], ['toolbox', 0.42, 0.2, 0.3, 'side'], ['gascan', 0.3, 0.16, 0.45, 'side']] },
  garage: { set: [['workbench', 2.2, 0.8, 1.05, 'back'], ['jackstand', 0.25, 0.25, 0.5, 'mid', 2], ['tyre', 0.72, 0.72, 0.18, 'side', 3], ['pallettruck', 0.7, 1.4, 1.2, 'side'], ['pegboard', 1.6, 0.05, 1.9, 'side'], ['gascan', 0.3, 0.16, 0.45, 'side', 2]] },
  sawmill: { set: [['workbench', 2.2, 0.8, 1.05, 'back'], ['pallettruck', 0.7, 1.4, 1.2, 'side'], ['toolbox', 0.42, 0.2, 0.3, 'side']] },
  warehouse: { set: [['pallettruck', 0.7, 1.4, 1.2, 'side', 2]] },
  markethall: { set: [['displaycase', 1.6, 0.6, 1.4, 'mid', 3], ['freezer', 2.0, 0.85, 0.9, 'side', 2], ['clothesrack', 1.7, 0.5, 1.5, 'side', 2]] },
  cottage: { set: [['wastebin', 0.27, 0.27, 0.33, 'side'], ['suitcase', 0.46, 0.3, 0.9, 'side']] },
  hut: { set: [['wastebin', 0.27, 0.27, 0.33, 'side'], ['backpack', 0.34, 0.25, 0.55, 'side']] },
  shelterhut: { set: [['bedframe', 2.0, 1.4, 0.75, 'side', 2], ['backpack', 0.34, 0.25, 0.55, 'side']] },
  stable: { set: [['tyre', 0.72, 0.72, 0.18, 'side']] },
};
export function fitOut(rec, label, rng) {
  const spec = INTERIOR[label]; if (!spec) return;
  const plan = rec.plan, area = r => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]), rooms = plan.rooms.filter(r => r.k === 0).sort((a, b) => (/shopfloor|living/.test(b.purpose) ? 1000 : 0) + area(b) - (/shopfloor|living/.test(a.purpose) ? 1000 : 0) - area(a)), R = rooms[0]; if (!R) return;
  const [x0, z0, x1, z1] = R.rect, m = 0.12;
  // a bar has no shop shelving in it (each prop keeps its index: the plan's anchors point at them)
  const props = spec.clear ? plan.props.map(p => p.k === 0 && p.room === R.i && /shelf|rack|counter|crate|cabinet/.test(p.kind) ? { ...p, x1: p.x0, z1: p.z0, h: 0, kind: 'cleared', soft: true } : p) : plan.props;
  const taken = props.filter(p => p.k === 0 && !p.soft && p.h > 0).map(p => [p.x0, p.z0, p.x1, p.z1]), doors = plan.doors.filter(d => d.k === 0).map(d => [d.x, d.z]);
  const free = (a0, b0, a1, b1) => a0 >= x0 + m && b0 >= z0 + m && a1 <= x1 - m && b1 <= z1 - m && !taken.some(t => t[0] < a1 && t[2] > a0 && t[1] < b1 && t[3] > b0) && !doors.some(([dx, dz]) => dx > a0 - 1.0 && dx < a1 + 1.0 && dz > b0 - 1.0 && dz < b1 + 1.0);
  const decor = [], solids = [];
  const put = (k, w, d, h, cx, cz, rot) => { const sw = Math.abs(Math.sin(rot)) > 0.5 ? d : w, sd = Math.abs(Math.sin(rot)) > 0.5 ? w : d, a0 = cx - sw / 2, b0 = cz - sd / 2, a1 = cx + sw / 2, b1 = cz + sd / 2; if (!free(a0, b0, a1, b1)) return false; taken.push([a0, b0, a1, b1]); decor.push({ k, x: cx, z: cz, rot }); if (h > 0.3) solids.push([a0, b0, a1, b1, 0, h]); return true; };
  // front of a building is z = 0, so the back of the room is z1
  for (const [k, w, d, h, where, count = 1] of spec.set) for (let n = 0; n < count; n++) {
    const tries = where === 'back' ? [[(x0 + x1) / 2, z1 - d / 2 - m, 0]] : where === 'bar' ? [[(x0 + x1) / 2, z1 - 1.5, 0]] : where === 'mid' ? [[(x0 + x1) / 2 + rng.range(-0.8, 0.8), (z0 + z1) / 2 + rng.range(-0.5, 0.5), 0]] : [];
    if (where === 'side' || where === 'back') for (let q = 0; q < 8; q++) { const f = (q + rng.next()) / 8; tries.push([x0 + d / 2 + m, z0 + 1 + f * (z1 - z0 - 2), Math.PI / 2], [x1 - d / 2 - m, z0 + 1 + f * (z1 - z0 - 2), -Math.PI / 2]); }
    for (const [cx, cz, rot] of tries) if (put(k, w, d, h, cx, cz, rot)) break;
  }
  if (spec.stools && decor.some(q => q.k === 'bar_counter')) { const b = decor.find(q => q.k === 'bar_counter'); for (let i = 0; i < 5; i++) put('barstool', 0.4, 0.4, 0, b.x - 1.6 + i * 0.8, b.z - 0.7, 0); }
  rec.plan = { ...plan, props, solids }; rec.decor = decor;
}
