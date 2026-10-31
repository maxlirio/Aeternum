# Status — milestone 4 (residents, character origin, law, work)

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
| **Daily lives**: closed-form schedules: sleep, breakfast, commute, work, errands at stores during opening hours, strolls, dinner, bed. Where anyone is at any moment is `whereAt(person, t)`, so distant people, offline time and witnesses all use the same function with no stored state | `test.mjs people` (2 days at 7 s steps: nobody exceeds walking speed, at least 85% of workers due on shift at 12:30 are at work, everyone asleep at 02:30) |
| **Routes**: through rooms and doors, up and down the stair flights, and along the right-hand sidewalk of the street graph | `test.mjs people` (no unroutable trips) |
| **Crowd rendering**: up to 96 nearby people drawn with instancing (one draw call per body part). Doors slide open for residents walking through | screenshots `people`, `work`, `sleep` |
| **Witnesses**: forcing a lock records everyone awake within sight (same floor of the same building, or outdoors nearby) in the incident | `e2e` |
| **Character origin**: you are the adult child of a real resident household (same surname). You live with your parents or alone in a vacant unit, with keys to both homes. Press C for your background (parents' and siblings' jobs and addresses) | `e2e` (parents exist and sleep in their own home at 02:30; your key opens your apartment, a stranger's doesn't) |
| Street names and house numbers | in-game |
| **Local authority**: every town has a polity (name, strictness, fine table, report and evidence rates) and a security office in the administration building nearest the centre, staffed on two shifts. Officers alternate desk time with patrol stops | `test.mjs people` (at least 2 security staff), `test.mjs law`; screenshot `patrol` |
| **Law process**: witnesses report with some probability after a delay; people who know you (family 100%, neighbours 80%, strangers 35%) identify you; an officer who sees it cites you within minutes; unwitnessed break-ins are discovered by the next resident or worker to arrive; investigations solve the case or close it cold; fines come out of your credits and go on your record | `test.mjs law` (also one 4-day jump equals half-hour steps), `e2e` (two days away: case reported/discovered, record matches fines) |
| **Credits**: starting savings; shown in the HUD; can go negative (debt) | `e2e` |
| **Openings**: each workplace posts 0–2 of its unfilled positions a week (the same ones for anyone who asks that week), plus its head if it has none. The town job board in the civic office lists all of them; inside any workplace J lists that workplace's own | `test.mjs careers` (30 towns × 4 weeks: openings every week, about 22 per town, none already held) |
| **Applying and hiring**: requirements are skill levels (administration, trade, technical), fitness, and for security a clean record. The application is read when the workplace head is next actually at work (their schedule says when) and decided by a hash of you and the job. Turn-downs state their reason. Knowing the head (family, neighbours) helps | `test.mjs careers` (unqualified: refused with the requirement; qualified: hired), `e2e` (job board, apply, hired) |
| **Shifts and pay**: a held job is a chain of shift jobs. Each is settled at its end from the time you were really inside the workplace (online), or its overlap with an absence spent on *Keep your routine* (offline). Pay is wage × hours present. Two days off a week; staff key to the workplace while employed. Skill grows with hours worked; promotion to senior and lead after enough good shifts and skill; three missed shifts in a row and you're let go; convictions for robbing your employer (or any, in security) also cost you the job | `test.mjs careers` (a week of routine: every shift worked and paid; one jump = 2-hour slices; half a shift present = half pay; missing shifts → dismissed, key returned, position reopened), `e2e` (attendance counts in the building, 3 days away: away report sums the shifts, credits rise) |
| **Workforce**: security force sized to the town (about 7% of working adults; spare posts are openings), workplace heads are 30 or older and hired first, ordinary jobs are filled one desk per workplace at a time | `test.mjs careers` (under 2% of workplaces unstaffed, all in towns with too few adults) |
| **Avoidance**: walkers sidestep or briefly wait for you and each other, never stepping into walls, then catch up with their schedule | `e2e` (a walker keeps at least 0.6 m from you and gets around) |

## Placeholders and limits (honest list)

- **The player body is a primitive placeholder** with a procedural walk. ADVENTURER
  models will replace it behind `avatar.js`.
- **Residents' door-to-door paths can clip furniture.** Avoidance only affects walkers;
  standing or seated people never move aside.
- **Residents can't be talked to.** Looking at someone shows their name, age, job,
  current activity and whether they're family.
- **Residents never change.** Nobody is born, dies, moves house or changes job yet. Such
  changes will be deltas over the generated population.
- **Window lights** still follow occupancy-by-hour rules rather than who is actually
  home.
- **Law has no physical response yet.** Officers don't come to find you, there is no
  arrest, jail, court or bounty, and fines can't be paid off or disputed. Debt has no
  effect. Only forced entry is a crime so far; trespassing in staff rooms you walked
  into, or theft, aren't.
- **Work has no tasks.** Being on shift means being inside the building; there is no
  activity at the desk or bench, and your performance is only attendance.
- **Nobody competes with you for openings**, and residents never change jobs. The
  weekly postings are a deterministic sample, not a labour market.
- **No self-employment, contracts, or starting your own business.** Wages don't vary
  between employers.
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
