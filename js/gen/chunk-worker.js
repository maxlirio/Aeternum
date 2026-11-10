// A background thread that builds the ground's tiles (gen/chunk.js) so the frame doesn't wait on them (see render/terrain.js). The planet is
// made here from the same seed and address as on the main thread, so the ground is the same ground; the one thing the save changes, the
// craters, comes with the asking.
import { Address } from '../core/address.js';
import { makePlanet } from './planet.js';
import { chunkData } from './chunk.js';

let planet = null;
self.onmessage = ({ data: { universe, address, craters, l, i, j } }) => {
  planet ??= makePlanet(universe, Address.parse(address));
  if (craters) planet.craters = craters;
  const d = chunkData(planet, l, i, j);
  self.postMessage(d, [d.pos.buffer, d.nrm.buffer, d.col.buffer, d.rock.buffer, d.uv.buffer, d.idx.buffer, d.ground.buffer]);
};
