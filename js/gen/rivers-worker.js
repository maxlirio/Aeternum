// A background thread that works out rivers and the roads between towns for land you haven't reached yet (see world/riverfeed.js).
import { Address } from '../core/address.js';
import { makePlanet } from './planet.js';
import { cellRivers } from './rivers.js';
import { linksAround } from './network.js';

let planet = null;
self.onmessage = ({ data: { universe, address, ri, rj, roads } }) => {
  planet ??= makePlanet(universe, Address.parse(address));
  if (roads) self.postMessage({ roads: true, ri, rj, list: linksAround(planet, ri, rj) });
  else self.postMessage({ ri, rj, list: cellRivers(planet, ri, rj) });
};
