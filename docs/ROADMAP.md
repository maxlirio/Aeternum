# Roadmap

Each step builds on the milestone 1 contracts: addresses, deltas, events, tiers, and
the rule that results must not depend on how time is sliced.

1. ~~Character origin~~ and ~~residents~~ are done (milestone 2). Still to add here:
   nationality from a polity, starting money, death and the next life.
2. **Local avoidance.** Residents step around the player and each other, then rejoin
   their route. This is purely a view-side offset, so the schedules stay closed-form.
3. **Law and authority.** Each settlement gets a polity with laws. `forced_entry` and
   trespass events are resolved by witnesses (resident schedules) and patrols. Results:
   fines, a record, reputation.
4. **Work and careers.** Job listings come from workplaces. Applications are judged on
   qualifications, then hiring, shifts and promotions. Offline "continue assignment"
   becomes a real activity.
5. **More towns built in 3D, and streaming.** Settlement meshes stream like terrain.
   The delta store is sharded by region.
6. **Planet as a sphere.** Cube-sphere terrain on the existing `surface:face,i,j,lod`
   keys, an atmosphere shell, and orbital view.
7. **Your ship.** One owned ship that can be walked through, takeoff and landing on the
   pads every town already has, atmospheric flight, then orbit.
8. **Star system, then FTL** across `sector/system` addresses.
9. **Workers.** Move `gen/chunk.js` and settlement generation into Web Workers (they
   are already pure).
