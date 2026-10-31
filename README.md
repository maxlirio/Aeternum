# ORBIS

A persistent, procedurally generated science-fiction universe, played in third person.
You are one ordinary person living in it.

**Milestone 1** (this build): one planet surface, one generated settlement, enterable
buildings, persistent changes, and time that keeps passing while you're away.

## Run it

```sh
python3 tools/serve.py 8517        # then open http://127.0.0.1:8517
```

The app is buildless: plain ES modules plus three.js r165 from a CDN. No install step.

**Controls:** click to capture the mouse · WASD move · Shift run · Space jump · E open/close ·
hold F to force a lock · Esc menu (leave, backup, restore, world log) · F3 stats ·
Shift+T skip one hour (developer).

## Tests

```sh
node tools/test.mjs      # determinism, settlement + floor-plan invariants (200 seeds), seams, persistence, offline
node tools/e2e.mjs       # real browser + real IndexedDB: force a door, climb stairs, reload, 2 days away
node tools/shots.mjs     # headless screenshots → out/shots/*.png (aerial, street, door, interior, stairs, night…)
```

`e2e.mjs` and `shots.mjs` need the dev server on 8517 and Google Chrome.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): modules, address scheme, delta model, simulation tiers
- [docs/STATUS.md](docs/STATUS.md): what works, what's a placeholder, known issues
- [docs/ROADMAP.md](docs/ROADMAP.md): next steps

Every model in the game is generated in code; there are no art assets. Humanoid models
will come from the ADVENTURER project and plug in behind `js/player/avatar.js`.
