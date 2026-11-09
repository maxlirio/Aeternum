// The spin rings' layouts, for the model builder (tools/assets/ring_kit.py): node tools/gen-rings.mjs → assets/ships/rings.json
import { writeFileSync } from 'node:fs';
import { RINGS, ringLayout } from '../js/gen/rings.js';
const out = RINGS.map(g => ringLayout(g));
writeFileSync(new URL('../assets/ships/rings.json', import.meta.url), JSON.stringify(out));
console.log(out.map(L => `${L.key}: ${Math.round(L.C)} m round, ${L.items.length} things`).join('\n'));
