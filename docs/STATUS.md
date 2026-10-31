# Status — milestone 2 (residents + character origin)

Each line says what is actually implemented and how it was checked.

## Works

| System | Verified by |
|---|---|
| Deterministic generation: same seed and address give an identical planet, town and floor plans; seeds differ across universes | `test.mjs determinism` (golden values) |
| Terrain: continents, ranges, hills, strata; 64 m–8 km quadtree streaming to 16 km; no seams at a level of detail | `test.mjs seams`; screenshots |
| Settlement: site selection, graded plateau, connected street grid, roads out of town, about 200 lots that never overlap roads or each other, every entrance on its road, flat ground under every lot | `test.mjs settlements` (200 seeds, 40,647 buildings) |
| Buildings: 6 typologies; 1–5 floors; stair cores; every room reachable from outside; windows; furniture | `test.mjs settlements` (graph reachability); `e2e` (walks up a flight to floor 2); screenshots |
| Third-person movement: walk, run, jump, stairs, walls, closed doors block, furniture collides | `e2e` |
| Doors: open/close (E), auto-close after 90 s, locked by rule (residents / staff / opening hours), your home key, leaving from inside is always allowed | `e2e`, `test.mjs persistence` |
| Forcing locks (hold F): the door stays broken, a `forced_entry` incident is logged, and the owner repairs it after 4–30 planet-hours | `e2e`, `test.mjs offline` |
| Persistence: IndexedDB; only deltas, events, jobs, meta and player are stored; exploring adds nothing to the save | `test.mjs persistence`, `e2e` (reload) |
| Backup/Restore JSON (lossless round trip) | `test.mjs persistence` |
| Time: 1:1 with real time, planet day length, sun, night, lit windows, street lamps | screenshots |
| Leaving: choose rest / train / walk home / stay; on return a report of what happened (elapsed time, body change, town events) | `e2e` (2 days away gives the repair in the report and a rested character); `test.mjs offline` |
| **Residents**: about 320 people per town in households (singles, couples, families, single parents, elders) living in real dwelling units: houses, or one apartment per upper floor of a habitation block behind its own locked door | `test.mjs people` (6 seeds: one bed slot per person, jobs consistent) |
| **Jobs**: one per work anchor (desk, counter, bench, machine) in offices, stores, workshops and hangars, with shifts; about 53% of residents employed (children, retirees and unemployed adults are not) | `test.mjs people` |
| **Daily lives**: closed-form schedules: sleep, breakfast, commute, work, errands at stores during opening hours, strolls, dinner, bed. Where anyone is at any moment is `whereAt(person, t)`, so distant people, offline time and witnesses all use the same function with no stored state | `test.mjs people` (2 days at 7 s steps: nobody exceeds walking speed, at least 50% of workers at work at noon, everyone asleep at 02:30) |
| **Routes**: through rooms and doors, up and down the stair flights, and along the right-hand sidewalk of the street graph | `test.mjs people` (no unroutable trips) |
| **Crowd rendering**: up to 96 nearby people drawn with instancing (one draw call per body part). Doors slide open for residents walking through | screenshots `people`, `work`, `sleep` |
| **Witnesses**: forcing a lock records everyone awake within sight (same floor of the same building, or outdoors nearby) in the incident | `e2e` |
| **Character origin**: you are the adult child of a real resident household (same surname). You live with your parents or alone in a vacant unit, with keys to both homes. Press C for your background (parents' and siblings' jobs and addresses) | `e2e` (parents exist and sleep in their own home at 02:30; your key opens your apartment, a stranger's doesn't) |
| Street names and house numbers | in-game |

## Placeholders and limits (honest list)

- **The player body is a primitive placeholder** with a procedural walk. ADVENTURER
  models will replace it behind `avatar.js`.
- **Residents follow their routes exactly.** They don't avoid the player or each other,
  and their door-to-door paths can clip furniture. The player is pushed out of them; they
  are not pushed by the player.
- **Residents can't be talked to.** Looking at someone shows their name, age, job,
  current activity and whether they're family.
- **Residents never change.** Nobody is born, dies, moves house or changes job yet. Such
  changes will be deltas over the generated population.
- **Window lights** still follow occupancy-by-hour rules rather than who is actually
  home.
- **Incidents have no consequences yet.** Witnesses are recorded, but there are no police
  or law to act on them. The in-game message says so.
- **You have no job, money or skills** beyond fitness/fatigue. `occupation` is always
  `null`.
- **No school building type**, so children spend weekdays at home.
- **Training only raises a fitness number**, which has a small effect on move speed.
- **One settlement is built in 3D.** Other regions generate their towns (and grade the
  terrain for them), but only the spawn town gets meshes and colliders.
- **Planet surface is flat**, with no curvature or orbit. Addresses are ready for a
  cube-sphere.
- **Town grading is a flat plateau** with a 185 m falloff. It looks terraformed on hilly
  sites.
- **Terrain detail texture stretches on steep slopes** because it is not triplanar yet.
- **No trees, rocks, vehicles, signage or audio.**
- **Load time:** about 5–10 s (textures and the whole town are generated on the main
  thread).
- **Developer time-skip** (Shift+T) is the only way to fast-forward while playing.

## Performance (M4 Mac, headless Chrome, 1600×900)

Street level: about 250 draw calls, about 840k triangles. Aerial view of the whole town:
about 410 calls, 1.25M triangles. On-screen interactive frame rate on real hardware has
not been measured beyond headless runs (40–120 fps headless).
