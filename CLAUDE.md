# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Vault of Cringe is a Destiny 2 parody raid in three.js. There is no build step, no package.json and no assets: models, textures, sounds, music and voice are all generated in code. three.js (0.170.0) and PeerJS load from jsDelivr through the import map in `index.html`. It's deployed by pushing `main` to GitHub Pages (https://nateo91.github.io/vault-of-cringe/), and players load it straight from there.

## Running and testing

```
python serve.py 8642
```

The `.claude/launch.json` config `vault-of-cringe` runs the same server for the preview pane. `serve.py` sends `Cache-Control: no-store`, so a reload always picks up edited files. ES modules don't load over `file://`.

There are no unit tests or linter. Testing means driving the game in the browser with `?debug` (`http://localhost:8642/?debug`), which imports `src/debug.js` and turns off pause-on-unfocus:

- `startAt(i)` launches encounter `i` (0 Approach, 1 Normie Gate, 2 Emergency Meeting, 3 Vine Boom Chamber, 4 This Is Fine, 5 Skibidi; 98 Backrooms, 99 Firing Range) with god mode on.
- `drive(seconds, fn)` steps the simulation at 60 fps synchronously, calls `fn(t)` every frame, and returns an array of error stacks. Check the return value: errors inside the loop are caught there, not thrown.
- `autoShoot()`, `aimAt(e)`, `nearest()`, `skipCine()`, `G.encounter.complete()`.
- Two-tab co-op: `coopHost()` returns a code, `coopJoin(code)` in the other tab, `coopLaunch(i)` on the host, `godOn()` on both. `pump()` keeps a background tab simulating and collects errors into `window.errs`.
- `window.simulate(sec)` exists in non-debug builds too.

Before pushing changes to enemies or encounters, smoke-test the whole raid, not just the screen you changed: every encounter, plus each boss's real kill path (lower its hp and `takeDamage`) through to the victory screen. The project skill `raid-smoke-test` (`.claude/skills/`) has the script.

## Release rule

Bump `BUILD` in `src/version.js` (`YYYY.MM.DD.N`) in every push that changes the game. Running games poll that file and tell players to reload when it changes, and co-op warns when host and client builds differ. A local PreToolUse hook blocks `git push` when game files changed without a bump.

## Architecture

- **`src/game.js`** holds the shared mutable state `G` (scene, player, enemies, encounter, state machine `menu | loading | playing | wipe | victory`, settings, net) and small helpers. Everything imports from it, and cross-module callbacks are hung on `G` (`G.onEncounterComplete`, `G.onLoot`) to avoid import cycles.
- **`src/main.js`** owns the raid flow and the loop. `step(dt)` updates the player, enemies, combat, the encounter and co-op. `loadEncounter(i)` tears down the old arena (`resetAll`), builds the new one behind the loading screen, then calls `warmShaders`.
- **Encounters** (`src/encounters/*.js`) extend `Encounter` in `base.js`. `build()` creates static geometry on every machine, `start()` / `update()` run only on the host (the simulation), `clientStart()` replaces `start()` on clients, and `localUpdate()` runs on every machine for mechanics that only affect your own guardian. One-off visuals that all players should see go through `this.ev(name, data)`, which calls `ev_<name>` locally and mirrors it to clients. A boss fight ends with `win()` and then `complete()`. The order lives in `ENCOUNTERS` in `main.js`; the Firing Range (99) and Backrooms (98) are outside it.
- **Enemies** (`src/enemies.js`, plus encounter-specific ones in each encounter file) extend `Enemy`. `rank` is `minor | major | boss`. Every type has to be registered with `registerNetType` so clients can build a proxy for it. **Subclasses must not reuse base-class field names** (`beam`, `aimBeam`, `bar`, `rig`, `model`, `shieldMesh`...): `dissolveOut()` and `cleanupMesh()` call `this.beam.dispose()` and similar. A Moai statue's `this.beam` once crashed the live game on Big Chungus's death.
- **Co-op** (`src/net.js`) is host-authoritative over WebRTC/PeerJS. The host simulates and sends 20 Hz snapshots. Clients render proxies, own their own guardian, and send hits to the host (`takeDamage` on a client becomes `clientHit`). Use `share(ev)` / `shareable()` for effects the host should mirror, `local(fn)` for effects only you should see, and `hurtPlayer()` to damage any guardian. `G.nextNid` keeps network ids in step: `build()` runs from id 1 on every machine, runtime spawns get host ids from 1000.
- **Rendering** (`src/render.js`): post-processing and a separate viewmodel layer. `Material.prototype.dispose` is a deliberate no-op so compiled shader programs are never released; disposing a material used to force a recompile and a hitch mid-fight. Materials shared across many meshes are flagged `userData.shared` so cleanup skips them. The light count is part of every lit shader, whatever a light's intensity, so lights must not appear, vanish or be hidden mid-encounter. Effects borrow from the fixed pool in `fx.js` (`flashLight`, `carryLight`), and dying enemies leave their lights behind, switched off (`parkLights` in `enemies.js`). `src/warmup.js` compiles everything behind the loading screen. It reveals every hidden object (`revealAll` in `render.js`, which also turns on depth of field), builds one of each generic enemy (`TYPES`) plus the encounter's `warmActors()`, rehearses the death dissolve on all of them, and renders a few real frames. When you add something that first appears mid-fight, build it up front (hidden) or return a copy from that encounter's `warmActors()`. A co-op client only gets the boss from the host after loading, so bosses go there too. The `raid-smoke-test` skill reports any shader compiled during play, and why; the raid is at 0.
- Everything that persists lives in `localStorage` under `voc-*` keys (settings, inventory, triumphs, leaderboard, lore, secrets).

The README's "Code map" section has a per-file list, and its "The raid" section describes every encounter's mechanics.

## Audience

The game is played mostly as a 4-player co-op fireteam, all on keyboard and mouse. Test gameplay changes in co-op (host and client), and balance mechanics and health for four players.
