// Hierarchical universe addresses. Every generated thing has one, and its seed is
// derived from the universe seed by walking the address — so the same address in the
// same universe always regenerates the same content, and nothing needs to be stored
// except the changes made to it (see world/deltas.js).
//
//   galaxy / sector(x,y,z) / system(n) / body(n) / surface(face,i,j,lod) /
//   settlement(cx,cz) / building(n) / room(floor,n) / door(n) ...
//
// Milestone 1 implements body→surface→settlement→building→room/door; the upper levels
// exist so the key format never has to change when space is added.
import { derive } from './hash.js';

export class Address {
  constructor(parts = []) { this.parts = parts; } // [[kind, ...ints], ...]
  child(kind, ...ints) { return new Address([...this.parts, [kind, ...ints]]); }
  parent() { return new Address(this.parts.slice(0, -1)); }
  last() { return this.parts[this.parts.length - 1]; }
  get key() { return this.parts.map(p => p.length > 1 ? `${p[0]}:${p.slice(1).join(',')}` : p[0]).join('/'); }
  toString() { return this.key; }
  seed(universeSeed) {
    let s = universeSeed;
    for (const p of this.parts) s = derive(s, p[0], p.slice(1));
    return s;
  }
  static parse(key) {
    return new Address(key.split('/').map(seg => {
      const [kind, nums] = seg.split(':');
      return nums === undefined ? [kind] : [kind, ...nums.split(',').map(Number)];
    }));
  }
}

// The one planet milestone 1 lives on.
export const HOMEWORLD = new Address([['galaxy', 0], ['sector', 0, 0, 0], ['system', 0], ['body', 3]]);
