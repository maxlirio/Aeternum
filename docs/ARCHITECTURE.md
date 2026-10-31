# Architecture

## Principles

1. **Generated content is a pure function of (universe seed, address).** Nothing
   generated is ever saved. It is regenerated on demand and is bit-identical every time.
2. **Only changes are saved.** These are *deltas* keyed by address, an append-only
   *event log*, and a queue of *timed jobs*.
3. **Simulation is tiered by relevance.** Only things near the player tick. Everything
   else is either a closed-form function of time or a job that runs when due. That makes
   offline time and distant places the same problem.
4. **Layers depend downward only.**

```
core/    hash, PRNG, noise, addresses, units          (no three.js, no DOM)
  ↓
gen/     planet, terrain, settlement, building plans,  (pure; runs in Node and the browser)
         surface grading, chunk data, characters
  ↓
world/   WorldStore (deltas, events, jobs), backends,  (no three.js)
         door state = generated rule + delta
  ↓
sim/     clock, scheduler (tiers), processes, offline catch-up
  ↓
render/  three.js views of gen data: terrain streamer, sky, town meshes, door leaves
player/  controller, camera, collision (on gen data, not meshes), avatar adapter
ui/      DOM overlays
main.js  wiring only
```

`gen/`, `world/` and `sim/` never import three.js. That is why `tools/test.mjs` can run
them in Node, and why they can later move into Web Workers or a server without changes.

## Addresses and seeds

`core/address.js` defines this hierarchy:

```
galaxy:0 / sector:x,y,z / system:n / body:n / surface:face,i,j,lod
                                            / settlement:rx,rz / building:n / door:n
```

A node's seed comes from hashing its parent's seed with `(kind, ints)` (`core/hash.js`,
which uses two 32-bit lanes and only integer math). The key format already covers
sectors, systems and bodies. Milestone 1 instantiates one body (`HOMEWORLD`) and treats
its surface as a plane. Terrain tiles are keyed so a cube-sphere planet can reuse them.

`tools/golden.json` pins generator output. If a change alters what a seed generates,
the determinism suite fails. When that is intended, bump `GEN_VERSION` in
`world/store.js`; saves made under another version get a warning on load.

## Generation pipeline (planet surface)

| Module | Input → output |
|---|---|
| `gen/planet.js` | body seed → climate palette, day/year length, tilt, latitude, atmosphere, noise fields |
| `gen/terrain.js` | `rawHeight(x,z)`: warped continents, ridged ranges, hills, terraces |
| `gen/settlement.js` | region cell (3 km) → maybe a town: flattest dry site, rotated street grid (thinned but always connected), roads out of town, lots along frontage, typology by distance from centre |
| `gen/surface.js` | `surfaceAt(x,z)`: raw terrain graded by the town plateau and the out-of-town road profiles. **The single ground truth** for meshes, collision and building pads |
| `gen/building.js` | building record → floor plan: exterior walls, stair core (switch-back flights, slab holes), BSP rooms, door spanning tree plus loops, entrance on the road side, restricted rooms, windows, furniture |
| `gen/chunk.js` | quadtree tile (lod,i,j) → heights, normals, ground colour, skirts |

Caches (`settlement.js`, `building.js`) are keyed by universe seed and address. They are
pure memoisation.

## People (`gen/population.js`, `gen/schedule.js`, `gen/paths.js`)

People are generated, not stored.

- **Plans → anchors.** Every furniture *record* publishes logical anchors: sleep (bed,
  2 slots if double), sit (sofa, chairs, tables), work (desk chair, counter, bench,
  machine), browse (shelf, rack), plus free standing spots per room. Anchors come from
  furniture records (kind, footprint, facing), never from meshes. **Rule: gameplay never
  depends on the shape of a model**, so every visual can be replaced (for example with
  photoreal art) without touching logic.
- **Population.** Dwelling units come from plans. Households of 1–6 fit the unit's bed
  slots, with a shared surname. Jobs are one per work anchor in a workplace (some with
  two shifts). Employment is assigned by a shuffled match.
- **Schedules.** `dayPlan(person, day)` is a list of AT segments (at an anchor) and MOVE
  segments (along a route), seeded by (person, day). Each day starts and ends asleep in
  bed, so consecutive days join seamlessly. `whereAt(person, t)` is a binary search plus
  interpolation along a polyline.
- **Routes.** BFS over the room/door graph, `coreClimb` through the switch-back stair
  flights, and Dijkstra over the street graph keeping to the right-hand sidewalk. Route
  points carry `door` refs so views can open doors for people passing through.
- **Tiers** (`sim/residents.js`):
  - DORMANT: nobody is evaluated.
  - NEAR (1 Hz): everyone is evaluated to pick the drawn set (up to 96 within 110 m;
    people indoors only within 45 m unless in the player's building), and tomorrow's plans
    are prepared during the last hours of the day.
  - ACTIVE (per frame): the drawn set is evaluated.
- **The character** is added by the save (`player.family` references generated people),
  not by altering generation.

## Persistence (`world/`)

`WorldStore` keeps a working copy in memory. A backend persists the dirty records:

- `deltas`: `addressKey → object`. Example: `…/building:12/door:3 → { broken: true, brokenAt, open }`.
  Readers always compute *generated rule ⊕ delta* (see `world/doors.js`).
- `events`: append-only history (`life_began`, `forced_entry`, `door_repaired`, …).
  Later systems (law, news, reputation) will consume these.
- `jobs`: timed work for the dormant tier, ordered by `(at, id)`.
- `meta`, `player`.

Backends: `store-idb.js` (browser; calls `navigator.storage.persist()`) and `store-mem.js`
(tests and screenshots; round-trips through JSON). **Backup/Restore** exports and imports
the whole save as JSON. Browser storage can be wiped, so keep a backup.

The delta set holds only things that were touched, so it is loaded whole for now. When
the universe grows it should be sharded by region; see ROADMAP.

## Time and simulation (`sim/`)

- **Clock:** game seconds advance 1:1 with real seconds. Planets map that to local solar
  time using their own day length (19–31 h).
- **Scheduler tiers:**
  - ACTIVE runs every frame: door leaves, the player.
  - NEAR runs at 1 Hz: door state refresh, window occupancy, street lamps, the body.
  - FAR runs once per minute of game time and has nothing assigned yet.
  - DORMANT is never ticked. It consists of jobs in the store plus closed-form functions
    of time (sun position, opening hours).
- **Rule:** a process must give the same result however an interval is sliced. The
  `offline` suite checks that one 3-day jump equals 72 hourly steps, for both jobs and
  the body model.
- **Offline catch-up** (`sim/offline.js`): on return, the game takes the elapsed real
  time, advances the character in closed form for the activity they chose on leaving
  (rest, train, walk home, or stay), runs every due job in order, and shows a report.
  The report lists only events those jobs actually logged.

## Rendering (`render/`)

- **Terrain:** a quadtree streams 64 m to 8 km tiles out to 16 km under a frame budget.
  A stale tile is removed only after its replacements exist, so the ground never has
  holes. Skirts hide cracks between levels of detail. The material uses vertex colours
  plus a two-scale procedural detail texture.
- **Town:** every building is generated in full, including interiors and furniture, and
  merged per material into 128 m cells. That keeps draw calls in the tens and
  frustum-culls by cell. Door leaves are one `InstancedMesh`; lamps and their light
  pools are instanced too. Night window lights come from a per-window threshold
  compared against an hourly occupancy uniform per building type.
- **Sky:** Preetham scattering with the sun position from planet time, PMREM image-based
  lighting regenerated as the sun moves, a shadow camera that follows the player, fog,
  and stars.
- **Materials:** generated tileable textures (concrete, facade panels, corrugated metal,
  asphalt, pavers, tiles, plaster, metal, fabric, wood, ground) with UVs in metres.
- **Floating origin:** world content sits under one root group that is re-centred
  every 3 km.

## Player (`player/`)

Collision runs on the same plan data the renderer draws, not on meshes. Buildings are
axis-aligned in their own frame, so every test is circle-versus-box. The controller
handles step-up, stair ramps, slab ceilings and a slope limit on raw terrain. The
camera boom shortens against the same collision world. `avatar.js` is the integration
point for ADVENTURER: anything returning `{ object, update(dt, speed, grounded), setOpacity }`
works. The crowd (`render/crowd.js`) poses one template rig per person and copies part
transforms into instanced meshes. Replacing the body art means replacing `buildRig` /
`applyPose`, or swapping the crowd view for skinned meshes with LOD.
