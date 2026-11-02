# Status — milestone 6 (residents whose lives move on, character origin, law and arrest, work)

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
| **Law process**: witnesses report with some probability after a delay; people who know you (family 100%, neighbours 80%, strangers 35%) identify you; an officer who sees it cites you within minutes; unwitnessed break-ins are discovered by the next resident or worker to arrive; investigations solve the case or close it cold; fines go on your record and are owed, payable within 3 days | `test.mjs law` (also one 8-day jump equals half-hour steps), `e2e` (two days away: case reported/discovered, record matches fines) |
| **Warrants and arrest**: an unpaid fine past its due date, or being seen breaking in by an officer, issues a warrant. In game, the nearest on-duty officer walks to you along the room/door and street graphs (they carry keys); officers on patrol who see a wanted person within 20 m act on it too. Stand still and you go quietly; run and it becomes a chase (4.9 m/s, so a fit runner can get away; out of sight 45 m for 15 s and you've lost them, and the warrant stands). While you're away, the warrant is simply served wherever you are | `test.mjs pursuit` (still → arrested quietly; 3.6 m/s → caught, counts as evading; 6.2 m/s → lost; officer never faster than a run), `test.mjs law`, `e2e` (warrant → officer comes → arrested) |
| **Custody**: arrest takes all owed fines from your credits (into debt if need be), adds *Evading arrest* to the record if you ran, and holds you in the security office's holding cell for 1–8 planet-hours. The cell is a ground-floor room picked from the plan; its doors lock (no key or force opens them) until a scheduled release. Time in custody doesn't count as work | `test.mjs law` (released after each sentence, cell unlocked), `test.mjs careers` (a shift in custody is missed), `e2e` (held in the cell, can't walk out, released on time); screenshot `arrest`/`cell` |
| **Paying fines**: J inside the security office shows what you owe; paying in full clears the fines and withdraws any warrant they caused | `test.mjs law`, `e2e` |
| **Credits**: starting savings; shown in the HUD; can go negative (debt) | `e2e` |
| **Openings**: each workplace posts 0–2 of its unfilled positions a week (the same ones for anyone who asks that week), plus its head if it has none. The town job board in the civic office lists all of them; inside any workplace J lists that workplace's own | `test.mjs careers` (30 towns × 4 weeks: openings every week, about 22 per town, none already held) |
| **Applying and hiring**: requirements are skill levels (administration, trade, technical), fitness, and for security a clean record. The application is read when the workplace head is next actually at work (their schedule says when) and decided by a hash of you and the job. Turn-downs state their reason. Knowing the head (family, neighbours) helps | `test.mjs careers` (unqualified: refused with the requirement; qualified: hired), `e2e` (job board, apply, hired) |
| **Shifts and pay**: a held job is a chain of shift jobs. Each is settled at its end from the time you were really inside the workplace (online), or its overlap with an absence spent on *Keep your routine* (offline). Pay is wage × hours present. Two days off a week; staff key to the workplace while employed. Skill grows with hours worked; promotion to senior and lead after enough good shifts and skill; three missed shifts in a row and you're let go; convictions for robbing your employer (or any, in security) also cost you the job | `test.mjs careers` (a week of routine: every shift worked and paid; one jump = 2-hour slices; half a shift present = half pay; missing shifts → dismissed, key returned, position reopened), `e2e` (attendance counts in the building, 3 days away: away report sums the shifts, credits rise) |
| **Workforce**: security force sized to the town (about 7% of working adults; spare posts are openings), workplace heads are 30 or older and hired first, ordinary jobs are filled one desk per workplace at a time | `test.mjs careers` (under 2% of workplaces unstaffed, all in towns with too few adults) |
| **Lives move on**: once a planet day, at midnight, every resident and household rolls against yearly rates: deaths by age (Gompertz: 0.2%/yr at 30, 2.4% at 60, 14% at 80), births to couples aged 20–44 with a spare bed, retirement at 67, quitting (~10%/yr), grown children leaving home (into an empty home, or out of town), households moving within town or leaving it, newcomers moving into empty homes. Ages count up from birthdays spread through the planet year. Everything is a delta over the generated town (`life/<town>`, `job/<id>`); the town at the epoch is never rewritten | `test.mjs life` (10 years: population stays 70–135% of the start, every event kind happens, one household per home, nobody in two households or two jobs, no job holder who has left, workers 18–66, everyone still has a place in the day; 4 years in yearly jumps == 61 uneven slices; a reloaded save gives the same people, homes and jobs) |
| **Residents compete for jobs**: unemployed adults (88% of them are looking) take openings from the same weekly postings you see. A post you applied for can be filled before your application is read ("the position was filled"). A week's board is fixed at its start: a post taken mid-week is struck off and nothing new appears until the next week | `test.mjs life`; `test.mjs careers` |
| **Town register and news**: the civic office (J) lists the latest births, deaths, moves and hires. Changes touching people you know (family, people you live with, coworkers, neighbours) get a toast and are listed in the away report; the rest are counted ("2 deaths · 1 birth · 39 people found work…"). Your family in C shows who has died or moved away | `e2e` (120 days: the town changes, only people still in town are drawn, register shown, reload gives the same homes); screenshots `register`, `family`, `kin` |
| **Roads out of town** are routed by a least-cost search that avoids steep ground and water (switchbacks up hillsides), with a vertical profile clamped to 9% and smoothed crests; the ground is cut and filled to it | `test.mjs roads` (24 towns: steepest graded road 9.0%, every road stays in its region); screenshots `road`, `road1` |
| **Climbing**: steep terrain (over 48°) can be scrambled up slowly unless you're exhausted; Space while walking into something 0.55–2.2 m high (furniture, crates, terrain steps, low roofs) pulls you up onto it; furniture tops can be stood on; every non-house building has a fire ladder on its back wall (E to climb, W/S, Space to let go) that steps you over the parapet onto the roof. Climbing tires you (and trains fitness). All of it reads collision data, never meshes | `test.mjs climb` (12 ladders up to the roof and back down, 10 furniture climbs, scramble up a 52°+ slope, exhausted can't); screenshots `ladder`, `roof` |
| **Using things**: almost every piece of furniture does something (E when facing it): beds (lie down, sleep 1 h / 4 h / until morning — time passes and everything carries on), sofas, chairs, benches and tables (sit; sitting rests you slowly), fridges, cupboards, wardrobes, lockers, cabinets, desks, racks and crates (look inside: take and put items), kitchen counters (cook), workshop fabricators and workbenches (make parts, tools, a survey drone), washing machines, planters (water), terminals on desks and counters (your account, messages, town news), shop shelves (buy while open) and tills (sell at half value). L switches the room light. 47 item types, a carry limit by fitness, hunger that food lowers. Contents are generated per (building, prop, week) and only touched boxes are stored; shops and other people's kitchens restock weekly. Cooking and fabricating are timed jobs, so they finish while you're away. Taking from someone else's home or business is theft: a `theft` incident that runs through the same witness/report/investigation/fine process as a break-in (officer witness → warrant at once) | `test.mjs items` (4241 usable props; every verb exists; deterministic contents; home vs neighbour theft; carry limit; officer-witnessed theft → warrant; unseen theft discovered and reported; buy open/closed; weekly restock; sell; stew cooked offline == stepped; tools gate recipes; hunger jump == steps; lights; reload); `e2e` (fridge, inventory, bed, shop, light); screenshots `fridge`, `prompt`, `inbed`, `onsofa`, `cook` |
| **Speeder bikes**: about a third of households keep one outside their building (backed in, nose to the street); every hangar is a dealer with three for sale (1800 cr). E on yours to ride: W/S throttle and brake/reverse, A/D steer, Shift boost (~110 km/h, 150 boosted); it hovers over ground, floors and water, slows on climbs, can't climb past ~37°, is stopped by walls (and you feel a crash). E to get off when slow; it stays parked where you left it. Someone else's: hold F 3 s to hotwire — a `theft` incident like any other (witnesses, report, fine, warrant). Bikes are logical records (owner, spot, heading, colour; `veh/<id>` when changed); the model is fitted to SPEEDER's box | `test.mjs vehicles` (deterministic, none parked in a wall, 1.15 km of road ridden at up to 31 m/s staying on the ground line, stopped outside a wall, hovers on water, can't climb a cliff, buy/can't afford/steal/park, reload); `e2e` (buy, 81 km/h in 3 s, can't get off at speed, park, hotwire = theft, reload); screenshots `parked`, `speeder` |
| **Ships**: a shuttle stands on every landing pad — a firm's (ramp down 06:00–18:00 while its crew works, raised and locked otherwise; hold F 4 s to force it, a break-in) or, on the first pad, one for sale (9500 cr). Walk up the ramp into the cargo hold, cabin (bunk, galley, locker) and cockpit; it's a structure in the collision world like a building, so furniture, containers and theft work aboard. At the helm: buy it, or override the lockout (stealing a ship: a 6000 cr-class offence). Fly: Space climb, Q descend, W/S thrust, A/D turn, Shift boost (~580 km/h, ~1150 boosted); it holds altitude, is stopped by walls and the ground (fly into a hillside and you crash), and lands only when it is down, slow and on level ground (E). It stays where you land it; quit mid-flight and you're still at the helm when you return. Ship layout is one data file (`assets/ships/shuttle.json`) read by both the game and the model builder | `test.mjs ships` (walk the ramp to the cockpit, ramp up keeps you out, verbs aboard, lift off, 580 km/h cruise >2 km out, land on level ground and walk down the ramp there, refuse a hillside, buy/locked/force/steal, reload); `e2e` (walk in, buy at the helm, climb, can't land in the air, land, reload); screenshots `ship`, `shipside`, `cockpit`, `hold`, `flying` |
| **Looks (photoreal pass)**: every surface is a baked PBR set (tools/assets/build.py): concrete facade panels, corrugated steel, render, floor tiles, asphalt, pavers; terrain gets grass/dry-ground detail over the planet's own palette and triplanar rock on slopes; street lights, dressed windows (blinds, curtains, rooms), downpipes, balconies, AC units, vents, roof housings, solar panels. Ships: panelled hull plating with seams, rivets and wear, heat-shield bellies, greebles, vents, RCS blocks, engine bells, nav lights, hazard markings, windscreens you can see out of (V: cockpit view) | screenshots `street`, `dusk`, `night`, `aerial`, `shipside`, `pilotview`; the gallery artifact |
| **Vegetation**: conifers, broadleaf trees, shrubs and boulders on open ground from moisture, slope, height and treeline (off towns, roads and cargo fields); card-built models with baked leaf and needle atlases, crossed-card stand-ins out to ~1.1 km; trunks and boulders are solid. Dense swaying grass clumps around you on green ground | `test.mjs flora` (deterministic, none in town/road/sea, trunks block); screenshots `forest`, `road` |
| **Freighter**: a second ship class (16 × 34 m: tall cargo hold behind a 3.9 m ramp, crew deck with two bunks and a galley, two-seat flight deck) on a cargo field outside each town; ships' ramps always reach the ground under their foot | `test.mjs ships` (ramp → hold → crew deck → flight deck, verbs aboard, lifts off); screenshots `freighter`, `freighter2` |
| **Weather**: cloud cover, rain and wind are a pure function of planet and time (wetter planets cloudier); a drifting sunlit cloud deck at ~1.7 km you can fly through and above, overcast dims the sun and greys the fog, rain streaks around you; the HUD names it | screenshots `clouds`, `overcast`, `abovecloud` |
| **Talking to people**: E on the person in front of you (the nearest of person, door or furniture wins). Strangers are strangers until you introduce yourself; then they'll tell you their job and shift, where they live, who they live with (all from the simulation), make small talk about the weather and recent town news, and give directions (a waypoint beam you can see over the rooftops, distance on the HUD). Meeting someone is a delta (`know/<id>`) — and a witness who knows you is more likely to recognise you | `test.mjs talk`; `e2e` (introduce, ask, waypoint); screenshot `talk` |
| **Alive around you**: firms' ships fly a daily cargo run off their pads; speeders with riders run the roads; the shore has wet sand and foam; water ripples and reflects | `test.mjs ships` (runs), `test.mjs traffic`; `e2e` (a ship lifts off) |
| **Avoidance**: walkers sidestep or briefly wait for you and each other, never stepping into walls, then catch up with their schedule | `e2e` (a walker keeps at least 0.6 m from you and gets around) |

## Placeholders and limits (honest list)
- **Using things / vehicles / ships (new)**: nobody but you uses the bikes or flies the ships yet (they stay parked; residents don't notice a missing bike except through the theft process). The cockpit has no forward window — flight is third person. Ships are atmospheric only: no orbit, no other towns to fly to yet. Dropped items on the floor aren't a thing yet (put them in a container). The ship model and the bike are first passes; the gallery artifact tracks them.

- **The player body is a primitive placeholder** with a procedural walk. ADVENTURER
  models will replace it behind `avatar.js`.
- **Residents' door-to-door paths can clip furniture.** Avoidance only affects walkers;
  standing or seated people never move aside.
- **Residents can't be talked to.** Looking at someone shows their name, age, job,
  current activity and whether they're family.
- **Life changes happen at midnight.** A household that moves vanishes from its old beds
  and appears in the new ones overnight; there's no removal van, funeral or walk across
  town. Asking where someone was at a past time uses who they are now.
- **Rates are realistic, so change is slow**: a town of ~350 sees a few deaths, births and
  moves and a dozen job changes in a month of real time.
- **You don't age**, and your parents and siblings aren't the only people you know;
  friendships and reputation aren't tracked.
- **Residents have no skills**, so anyone can take any opening they're old enough for;
  only you are judged on requirements.
- **Photoreal art has only begun**: furniture and fixtures (33 variants) are built assets
  with PBR surfaces. Buildings, streets, terrain, lamps and people are still the earlier
  code-drawn look. Furniture is only drawn within 26 m (interiors further off look empty
  through windows).
- **Window lights** still follow occupancy-by-hour rules rather than who is actually
  home.
- **Arrest is a walk-up, not a struggle.** There is no restraint, cuffs, escort or
  animation: within reach, you're simply in the cell. Officers don't call for backup,
  block exits or search buildings; one officer comes, and they give up after 5 minutes.
- **No courts, bail, appeals or bounties.** Sentences are short holds, not prison.
- **Debt has no effect.** Only forced entry is a crime; trespassing in staff rooms you
  walked into, theft, and assault aren't.
- **The holding cell is an ordinary office room** with its furniture; nobody is given a
  desk there.
- **Work has no tasks.** Being on shift means being inside the building; there is no
  activity at the desk or bench, and your performance is only attendance.
- **Postings are still a weekly sample** (0–2 per workplace), not a labour market with
  wages that respond to supply. The town has more posts than adults, so openings never
  dry up (about 20–27 a week after 8 simulated years).
- **No self-employment, contracts, or starting your own business.** Wages don't vary
  between employers.
- **No school building type**, so children spend weekdays at home.
- **Training only raises a fitness number**, which has a small effect on move speed.
- **One settlement is built in 3D.** Other regions generate their towns (and grade the
  terrain for them), but only the spawn town gets meshes and colliders.
- **Planet surface is flat**, with no curvature or orbit. Addresses are ready for a
  cube-sphere.
- **Deep cuts in mountain towns.** Where no gentle route exists, a road is cut or filled
  up to ~100 m deep (no tunnels or bridges yet), and roads end about 1–3 km out.
- **Climbing has no free wall climbing** (sheer building walls need the ladder) and no
  falls or injuries; the placeholder body has a simple reaching pose.
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
