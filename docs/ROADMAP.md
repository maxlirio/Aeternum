# Roadmap

Each step builds on the milestone 1 contracts: addresses, deltas, events, tiers, and
the rule that results must not depend on how time is sliced.

1. ~~Character origin~~ and ~~residents~~ are done (milestone 2). Still to add here:
   nationality from a polity, starting money, death and the next life.
2. ~~Local avoidance~~ and ~~law (reports, investigation, fines, record)~~ are done
   (milestone 3); ~~officers responding in person, arrest, custody, paying fines~~
   (milestone 5). Next for law: trespass and theft as offences, backup and searching,
   courts and longer sentences, debt collection.
3. **Law and authority** (original plan, for reference): Each settlement gets a polity with laws. `forced_entry` and
   trespass events are resolved by witnesses (resident schedules) and patrols. Results:
   fines, a record, reputation.
4. ~~**Work and careers**~~ is done (milestone 4): openings, applications judged on
   skills, hiring, shifts paid by attendance, promotion, dismissal, and offline "keep
   your routine". Next for work: tasks at the workstation, residents competing for and
   changing jobs, a labour market with wages that vary, contracts and self-employment.
5. **More towns built in 3D, and streaming.** Settlement meshes stream like terrain.
   The delta store is sharded by region.
6. **Planet as a sphere.** Cube-sphere terrain on the existing `surface:face,i,j,lod`
   keys, an atmosphere shell, and orbital view.
7. **Your ship.** One owned ship that can be walked through, takeoff and landing on the
   pads every town already has, atmospheric flight, then orbit.
8. **Star system, then FTL** across `sector/system` addresses.
9. **Workers.** Move `gen/chunk.js` and settlement generation into Web Workers (they
   are already pure).
