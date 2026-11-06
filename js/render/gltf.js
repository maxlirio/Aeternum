// Loading the game's models. They're stored compressed (tools/pack-assets.sh): a third of the download, and small integers in place of floats until they arrive.
import { BufferAttribute } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
export const gltfLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// A copy of a part's geometry in plain floats, placed by its node's matrix. (Compressed numbers can't hold a transformed position: they only span -1 to 1.)
export function bakedPart(o) {
  const g = o.geometry.clone();
  for (const k of Object.keys(g.attributes)) { const a = g.attributes[k]; if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute && !a.normalized) continue; const n = a.itemSize, out = new Float32Array(a.count * n), get = ['getX', 'getY', 'getZ', 'getW']; for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) out[i * n + j] = a[get[j]](i); g.setAttribute(k, new BufferAttribute(out, n)); }
  g.applyMatrix4(o.matrixWorld); return g;
}
