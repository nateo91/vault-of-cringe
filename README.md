# VAULT OF CRINGE

A Destiny 2 parody raid where every enemy is a meme and the memes get more cursed the deeper you go. three.js, no build step, no assets: every model, texture, sound effect and song is generated in code, and the Ghost talks through your browser's text-to-speech.

## Run it

Double-click `start.bat`. It needs Python, and it opens http://localhost:8642. You can also run any static server from this folder:

```
python serve.py 8642
```

`serve.py` is a tiny static server that disables browser caching, so everyone always gets the latest files after an update. Opening `index.html` directly won't work, because browsers block ES modules on `file://`. You also need internet access the first time, since three.js and the fonts load from a CDN.

## Online co-op

1. One person clicks **HOST** in the main menu, which gives them a 5-letter raid code.
2. Everyone else types the code and clicks **JOIN**. Up to 6 guardians per fireteam.
3. The host clicks **LAUNCH**. Friends can also join in the middle of a raid.

How it works:

- Players connect peer-to-peer over WebRTC. The free PeerJS cloud server only does the initial handshake.
- **Everyone needs to load the game from a URL.** Your friends can't reach your `localhost`, so host the folder somewhere (GitHub Pages, itch.io as HTML5, Netlify drop). It's all static files. Or have each friend run their own copy with `start.bat`; the version just has to match.
- The host's computer runs the raid. **Hosts: keep the game tab focused.** Browsers freeze background tabs, and that freezes the raid for everyone.
- Co-op uses Destiny raid rules. There are no self-revives. When you go down, a teammate holds **E** on your Ghost to bring you back. If everyone is down, the squad wipes.
- Mechanics are judged per player:
  - everyone has their own brainrot
  - the "look away" and "don't move" vibe checks judge each player's own screen
  - you dodge enemy projectiles on your own screen, so lag doesn't eat your jumps
- Some networks (strict corporate/university NATs) block peer-to-peer connections. That would need a TURN server, which this doesn't set up.


## Controls

| | |
|---|---|
| WASD / Shift | move / sprint |
| Shift + C (or Ctrl) | slide |
| Space | jump, then again in the air (Hunter: triple jump, Titan: double, Warlock: hold to glide) |
| Mouse L / R | shoot / aim down sights |
| R, 1 2 3, wheel | reload, swap weapons |
| T | inspect your weapon (admire the potato) |
| Tab / I | Armory: browse loot and equip weapons |
| B / N / J / K | Emotes: dance / sit / dab / take the L (third-person; move or shoot to stop) |
| Q / V / F | grenade / melee / super |
| Esc | pause |

## The raid

0. **The Approach** (raid entry, no wipes). Your jumpship drops you at a landing pad above a misty chasm.
   - Fight past doge patrols on the causeway.
   - Platform-jump across the chasm. Some platforms bob and slide, and they carry you.
   - Clear the guards in the plaza so the Vault's gate opens.
   - Miss a jump in the chasm and your Ghost catches you, putting you back on the last platform you stood on.
   - Falling anywhere else sends you back to the last checkpoint.
   - A waypoint marker shows the way, and three hidden lore Ghosts are worth finding.

1. **The Normie Gate** (cursed 1/5). Capture the 👍 LIKE, ▶ SUBSCRIBE and 🔔 BELL plates and hold all three at once. Stonks Acolytes walk onto your plates to un-capture them. A wizard comes from the moon.
2. **Emergency Meeting** (cursed 2/5). Crewmates wander around doing tasks, and one of them is the impostor. Crewmates don't use vents. Shoot the wrong one and you get "bruh" plus a penalty. Every 30s the impostor kills someone, which calls a meeting and shuffles everyone. Three rounds. A vent that was just used flips open and keeps smoking for a few seconds, so you can catch an impostor even if you missed the moment.
3. **The Vine Boom Chamber** (cursed 3/5). Moai Says: the four statues vine-boom in a sequence, and you shoot them back in the same order to drop Big Chungus's "simply too big" shield. Jump his stomp shockwaves and outrun his eye laser. If you take too long, Cheems bonks the whole raid.
4. **This Is Fine** (cursed 4/5). The room is on fire and the Dog, Who Is Fine, is sipping coffee at his table:
   - The floor is a grid of tiles, and the fire spreads tile by tile. Standing on a burning tile burns you (hop on the furniture).
   - The dog is in denial (immune) until **50%** of the floor is burning. Then it stops being fine, he panics, and you can damage him. Under 35% he goes back into denial.
   - If **90%** of the floor burns for 4 seconds, everyone dies.
   - 🧯 Fire extinguishers light up on the side walls. Walk into one to pick it up, then walk through the fire to put it out. Your hands are full, so you can't shoot while carrying it.
   - Hot Takes walk around setting the floor on fire, and they explode into more fire when they die, so shoot them from a distance. The dog lobs flaming coffee that lights up wherever it lands, and once he panics he flails out shockwaves you have to jump.
5. **Skibidi of a Thousand Toilets** (cursed 5/5, deep fried). You're in Ohio:
   - Brainrot stacks up over time and kills you at 10. Standing on 🌱 grass cleanses it.
   - Kill Sigmas and collect their +1000 AURA to break the Rizz Shield.
   - Vibe checks: don't move, look away, or jump.
   - At 50% health the toilets multiply. At 15% the floor is lava.

Big Chungus, the Dog and Skibidi get cinematic boss intros on your first attempt, and each impostor gets a reveal cutscene (full the first time, a quick cut after that). Press Space, Enter or click to skip.

You get 3 revives per encounter. Run out and the squad wipes, which restarts the encounter. You can start from any encounter in the main menu to practice.

## Firing Range

Pick **🎯 Firing Range** from "Start at encounter" to practise: dummies that never die (one per shield element, a strafing one, two at 50 m) with a live DPS meter. Press **G** to send a practice wave of real enemies (Doge pack, Stonks in cover, a Moai escort, Wizard + Sigmas, everything) and race your clear time. No loot drops here.

## Elements and shields

Every gun has an element: 🔥 Solar, ⚡ Arc or 🟣 Void. The icon shows next to its name on the HUD and in the Armory.

Major enemies carry an elemental shield that soaks damage before their health:
- ⚡ Arc: Moai Knights
- 🟣 Void: Wizards and Toilet Disciples
- 🔥 Solar: Sigmas

A matching element does **triple** damage to the shield, and its damage numbers glow. Breaking a shield sets off a blast that hurts nearby enemies (harder if you used the right element) and staggers the major for a moment.

## Loot and perks

Loot is personal and saved in your browser, so it carries over between sessions.

- Every encounter clear drops a weapon for each player. The final boss drops two.
- Majors sometimes drop **engrams** (spinning purple octahedrons), and some minors do too.
- Exotics have a growing chance to drop the deeper you go.

Open the **Armory** (Tab mid-raid, or from the main menu) to swap guns. A turntable shows the gun you're hovering (drag to spin it), and a row of **shaders** recolours all your guns: Gold Digger, Welcome to Ohio, Simply Too Purple, Sigma Grindset, Such Shiba, Touch Grass. Legendaries roll one perk from each of two columns. Exotics have fixed signature perks.

| Slot | Weapons |
|---|---|
| Kinetic | Ace of Spuds (exotic hand cannon), Grindset (auto), Stonks Pulse (3-burst pulse), The Sus-pect (scout) |
| Energy | The Chaperwoof (shotgun), Big Brain (sniper), No Scope 360 (exotic sniper), Bruh Fusion (fusion) |
| Power | Gjallarhorn't (exotic rocket), Vine Boom Deluxe (machine gun), Bonk Launcher (grenade launcher) |

The perk pool has D2 classics and meme perks:

- **Classics:** Outlaw, Rampage, Kill Clip, Firefly, Subsistence, Feeding Frenzy, Triple Tap, Vorpal, Demolitionist, Auto-Loading Holster, Overflow, Snapshot, Opening Shot, Tracking Module, Cluster Bombs, Spike Grenades.
- **Memes:** Stonks, Ratio, Vine Boom, Touch Grass, Rizz.
- **Exotic signature perks:** Wolfpack Rounds, Memento Potato, 360 No Scope.

## Leaderboard

Every run has a clock in the objective panel (it doesn't count while the game is paused). A clear counts for the **🏆 Leaderboard** on the main menu if you:
- start from **The Approach**, and
- never turn on god mode or debug mode.

Runs that start at a later encounter, or that use cheats, show up as **PRACTICE**.

- The board stores your top 25 clears, with splits for each encounter, a "best segments" column and a sum-of-best time.
- Adding This Is Fine made the raid longer, so the board started fresh when it was added.
- In co-op, the host's clock is the official time, and the clear is saved for everyone in the fireteam.
- Boards are saved in each player's own browser. Hit **📋 COPY RESULT** on the victory screen and paste it in the group chat to settle disputes.

## Sound

World sounds are 3D (headphones recommended):
- Enemy fire, explosions, boss attacks and your teammates' guns come from where they actually happen, including behind you.
- They get quieter, duller and echoier with distance.
- In the Moai Says encounter, each statue booms from its own pillar, so you can play it by ear.

Your own gun stays centered.

## Settings

Both the main menu and the pause menu have:

- **Graphics:** High (bloom, anti-aliasing, soft shadows), Medium (no anti-aliasing, lower resolution), or Low (no post-processing, for potato laptops).
  On your first run the game watches your frame rate and steps down a preset if it can't hold ~45 fps (it tells you in the killfeed). Picking a preset yourself turns that off.
- **Aim assist:** bullet magnetism plus slight aim slowdown over enemies. It's on by default. Purists can turn it off.

## Cheats / debug

- Open the console during a run and type `G.godMode = true`. That run won't count for the leaderboard.
- `?debug` in the URL skips pause-on-unfocus and adds console helpers (`startAt(n)`, `drive(seconds, fn)`, `autoShoot`).

## Code map

- `src/main.js`: raid flow, menus, co-op lobby, revives, game loop
- `src/net.js`: co-op networking (host snapshots, client hits, event mirroring)
- `src/avatars.js`: your teammates' guardians
- `src/player.js`: movement, firing, abilities, supers, viewmodel animation
- `src/arsenal.js`: weapon definitions, perks + perk engine, loot rolls, saved inventory, new gun models
- `src/inventory.js`: the Armory screen
- `src/leaderboard.js`: clear times, splits, and the leaderboard screen
- `src/enemies.js`: enemy base class + roster (Doge, Stonks, Nyan, Sus Sniper, Moai Knight, Wizard, Sigma)
- `src/encounters/*.js`: one file per encounter, including its boss and mechanics (`approach.js` is the walk-in)
- `src/rigs.js`: jointed, animated enemy models (rig system, walk cycles, attack poses, rim lighting)
- `src/dressing.js`: set dressing (dust, fog, light shafts, lamps, braziers, banners, consoles)
- `src/models.js`, `src/textures.js`: bosses and other procedural models, textures, normal maps
- `src/audio.js`: synthesized SFX (yes, including the vine boom), 3D positional audio (HRTF panning, distance falloff, air absorption), procedural music, TTS
- `src/cinematic.js`: boss intro system (letterbox, camera paths, title cards; the choreography lives in each encounter)
- `src/render.js`: post-processing, sky domes, the separate viewmodel layer, quality settings
- `src/combat.js`, `src/fx.js`, `src/world.js`, `src/hud.js`: the plumbing
