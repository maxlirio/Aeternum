// A background thread that works out rivers for land you haven't reached yet (see world/riverfeed.js).
import { Address } from '../core/address.js';
import { makePlanet } from './planet.js';
import { cellRivers } from './rivers.js';

let planet = null;
self.onmessage = ({ data: { universe, address, ri, rj } }) => {
  planet ??= makePlanet(universe, Address.parse(address));
  self.postMessage({ ri, rj, list: cellRivers(planet, ri, rj) });
};
