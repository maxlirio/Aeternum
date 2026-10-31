# Status — milestone 1

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
| Character: random name, age, home and key in the spawn town | in-game |

## Placeholders and limits (honest list)

- **The player body is a primitive placeholder** with a procedural walk. ADVENTURER
  models will replace it behind `avatar.js`.
- **No NPCs yet.** The scheduler tiers exist and are used by real processes, but nobody
  lives in the town. Window lights show occupancy *rules*, not simulated people.
- **Incidents have no consequences yet.** They are recorded as unresolved, with no
  witnesses, police or law. The in-game message says so.
- **Character origin is minimal:** name, age, home and key. There is no family,
  nationality, career or skills beyond fitness/fatigue. `occupation` is always `null`.
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
