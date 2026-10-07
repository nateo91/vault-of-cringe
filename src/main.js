// Bootstrap, raid flow, game loop.
import * as THREE from 'three';
import { MODS, G, pick, after, updateTimers, alivePlayers, local } from './game.js';
import { Input, initInput, lockPointer, endFrame, down, hit } from './input.js';
import { initAudio, play, say, setVolume, startMusic, stopMusic, updateListener, setRoom, setAmbience, setMusicIntensity } from './audio.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { updateEnemies, clearEnemies } from './enemies.js';
import { updateCombat, clearCombat, Pickup } from './combat.js';
import { updateFx, clearFx } from './fx.js';
import { clearWorld, mergeStatic } from './world.js';
import { initRenderer, render, applyQuality, followSun, bakeEnvironment, wipeGrade } from './render.js';
import { togglePhoto, photoUpdate } from './photo.js';
import { updateDressing } from './dressing.js';
import { loadInventory, rollLoot, DEFS, PERKS } from './arsenal.js';
import { initArmory, openArmory, closeArmory, isOpen as armoryOpen } from './inventory.js';
import { recordRun, formatTime, renderBoard, clearBoard, shareText } from './leaderboard.js';
import { hostGame, joinGame, netUpdate, resetClientWorld, leave, clean } from './net.js';
import { TheApproach } from './encounters/approach.js';
import { NormieGate } from './encounters/normie.js';
import { EmergencyMeeting } from './encounters/meeting.js';
import { VineBoomChamber } from './encounters/vineboom.js';
import { ThisIsFine } from './encounters/thisisfine.js';
import { FiringRange } from './encounters/range.js';
import { SkibidiFinale } from './encounters/skibidi.js';

const ENCOUNTERS = [TheApproach, NormieGate, EmergencyMeeting, VineBoomChamber, ThisIsFine, SkibidiFinale];
const TIPS = [
  'Tip: Have you tried not dying?',
  'Tip: Bungie has nerfed this loading screen.',
  'Tip: Shoot the meme until it stops being a meme.',
  'Tip: Crits do more damage. Aim for the face. Every meme has a face.',
  'Tip: Your Ghost has been listening to you sleep.',
  'Tip: Rocket jumping is not a bug. It is a lifestyle.',
  'Tip: Touch grass. No, really. Later it will save your life.',
  'Tip: Crewmates do not use vents.',
  'Tip: If you hear a vine boom, someone, somewhere, made a mistake.',
  'Tip: The Titan super is just punching the floor. Respect it anyway.',
  'Tip: Hold space as a Warlock to glide. Look at you. Floating. Reading.',
  'Tip: Power level does nothing here. Just like real life.',
  'Tip: In co-op, hold E on a dead teammate\'s Ghost to revive them. Or don\'t. Your call.',
];
const WIPE_JOKES = [
  'Bungie would like to remind you that this is a skill issue.',
  'Have you considered: being better?',
  "Your Ghost is drafting a strongly worded LFG post.",
  'Somewhere, a Sherpa just felt a disturbance.',
  'Wipe #{n}. The memes grow stronger.',
  'Bruh.',
  'Who was on adds? Nobody was on adds.',
];
const LOOT = [
  ['Touch of Grass', 'Exotic Hand Cannon. "Go outside." Perk: Photosynthesis.'],
  ['Vex Mythoclast (but it\'s a meme)', 'Exotic Fusion Rifle. Every kill plays a vine boom.'],
  ['Gjallarhorn\'t', 'Exotic Rocket Launcher. You already have this. Here is another one.'],
  ['The Sus-pect', 'Legendary Sniper. Perk: Venting — reload by hiding in the floor.'],
  ['Big Chungus Pulse', 'Legendary Pulse Rifle. Simply too big for your inventory.'],
  ['Stonks Bow', 'Legendary Bow. Number go up. Then down.'],
  ['Ghost Shell of a Thousand Toilets', 'Exotic Ghost Shell. Your Ghost hates it.'],
  ['Emblem: Terminally Online', 'Commemorates completing the Vault of Cringe.'],
];

let canvas, clock;
const $ = (s) => document.querySelector(s);

function init() {
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem('voc-settings') || '{}')); } catch (e) { /* fine */ }
  const r = initRenderer(document.getElementById('game'));
  canvas = r.domElement;
  G.worldGroup = new THREE.Group(); G.entities = new THREE.Group(); G.fxGroup = new THREE.Group(); G.avatarGroup = new THREE.Group();
  G.scene.add(G.worldGroup, G.entities, G.fxGroup, G.avatarGroup);
  HUD.init();
  initInput(canvas, onLockChange);
  loadInventory();
  initArmory(onArmoryClosed);
  setupMenus();
  setupCoop();
  G.onEngram = () => grantLoot({ exoticChance: 0.04 }, 'ENGRAM DECRYPTED');
  // loot scales with how deep into the run you are (k), and the last encounter of the run pays a bonus
  G.onLoot = (i, k = i, last = i === ENCOUNTERS.length - 1) => { if (ENCOUNTERS[i]?.traversal) return; grantLoot({ exoticChance: [0, 0.05, 0.12, 0.2, 0.3, 0.5][k] ?? 0.1 }); if (last) after(1.2, () => grantLoot({ exoticChance: 0.2 })); };
  // skip a boss intro
  addEventListener('keydown', (e) => { if (G.cine && ['Space', 'Enter', 'KeyE', 'Escape'].includes(e.code)) G.cine.skip(); });
  addEventListener('mousedown', () => { if (G.cine) G.cine.skip(); });
  // Tab / I opens the armory mid-raid
  addEventListener('keydown', (e) => {
    if ((e.code === 'Tab' || e.code === 'KeyI') && G.state === 'playing' && !armoryOpen() && !G.cine) {
      e.preventDefault();
      if (!G.net.active) G.paused = true;
      openArmory();
      document.exitPointerLock?.();
    }
  });
  menuBackdrop();
  clock = new THREE.Clock();
  requestAnimationFrame(frame);
  G.onPlayerDeath = onPlayerDeath;
  G.onEncounterComplete = onEncounterComplete;
  G.wipe = wipe;
  window.G = G; // for the curious (and for cheating). try G.godMode = true
}

// A slowly rotating vista behind the main menu.
function menuBackdrop() {
  clearWorld();
  const enc = new SkibidiFinale();
  enc.build();
  G.menuEnc = enc;
  G.camera.position.set(0, 14, 40);
  G.camera.lookAt(0, 4, 0);
}

function setupMenus() {
  document.querySelectorAll('.cls').forEach((b) => {
    if (b.dataset.cls === G.cls) b.classList.add('sel');
    b.onclick = () => { G.cls = b.dataset.cls; document.querySelectorAll('.cls').forEach((x) => x.classList.toggle('sel', x === b)); };
  });
  const syncSettings = () => {
    document.querySelectorAll('.sens').forEach((e) => (e.value = G.settings.sens));
    document.querySelectorAll('.vol').forEach((e) => (e.value = G.settings.volume));
    document.querySelectorAll('.voice').forEach((e) => (e.checked = G.settings.voice));
    document.querySelectorAll('.music').forEach((e) => (e.checked = G.settings.music));
    document.querySelectorAll('.quality').forEach((e) => (e.value = G.settings.quality || 'high'));
    document.querySelectorAll('.aimassist').forEach((e) => (e.checked = G.settings.aimAssist ?? true));
  };
  syncSettings();
  const save = () => { try { localStorage.setItem('voc-settings', JSON.stringify(G.settings)); } catch (e) { /* fine */ } syncSettings(); };
  document.querySelectorAll('.sens').forEach((e) => (e.oninput = () => { G.settings.sens = +e.value; save(); }));
  document.querySelectorAll('.vol').forEach((e) => (e.oninput = () => { G.settings.volume = +e.value; setVolume(G.settings.volume); save(); }));
  document.querySelectorAll('.voice').forEach((e) => (e.onchange = () => { G.settings.voice = e.checked; if (!e.checked) speechSynthesis?.cancel(); save(); }));
  document.querySelectorAll('.quality').forEach((e) => (e.onchange = () => { G.settings.quality = e.value; G.settings.qualityPicked = true; save(); applyQuality(); }));
  document.querySelectorAll('.aimassist').forEach((e) => (e.onchange = () => { G.settings.aimAssist = e.checked; save(); }));
  document.querySelectorAll('.music').forEach((e) => (e.onchange = () => {
    G.settings.music = e.checked; save();
    if (!e.checked) stopMusic(); else if (G.encounter) startMusic(G.encounter.cursed);
  }));
  $('#launch').onclick = () => {
    if (G.net.isClient) return;
    initAudio();
    startRaid(+$('#startEnc').value);
    lockPointer(canvas);
  };
  $('#resume').onclick = () => { lockPointer(canvas); if (G.debug || G.net.active) resume(); };
  $('#restartEnc').onclick = () => { $('#pause').classList.add('hidden'); G.paused = false; G.player.revives = 3; loadEncounter(G.encounterIndex); lockPointer(canvas); };
  $('#quit').onclick = () => { leave(); location.reload(); };
  $('#armoryBtn').onclick = () => openArmory();
  // raid modifiers
  G.settings.mods ||= {};
  const drawMods = () => { $('#mods').innerHTML = Object.entries(MODS).map(([k, m]) => `<button class="mod ${G.settings.mods[k] ? 'on' : ''}" data-mod="${k}" title="${m.desc}">${m.icon} ${m.name}</button>`).join(''); };
  drawMods();
  $('#mods').onclick = (e) => { const b = e.target.closest('[data-mod]'); if (!b) return; G.settings.mods[b.dataset.mod] = !G.settings.mods[b.dataset.mod]; try { localStorage.setItem('voc-settings', JSON.stringify(G.settings)); } catch (err) { /* fine */ } drawMods(); };
  $('#boardBtn').onclick = () => { renderBoard($('#leaderboard')); $('#leaderboard').classList.remove('hidden'); };
  $('#boardClose').onclick = () => $('#leaderboard').classList.add('hidden');
  $('#boardClear').onclick = () => { if (confirm('Delete every saved clear on this browser?')) { clearBoard(); renderBoard($('#leaderboard')); } };
  $('#pauseArmory').onclick = () => { $('#pause').classList.add('hidden'); openArmory(); };
  // credits: who was in your fireteam goes at the top
  const closeCredits = () => $('#credits').classList.add('hidden');
  $('#creditsBtn').onclick = () => {
    const team = [G.net.active ? G.net.name : (localStorage.getItem('voc-name') || 'Guardian'), ...[...G.avatars.values()].map((a) => a.name)].map((n) => String(n).replace(/[<>&]/g, '')).join(', ');
    const roll = $('#credits .cr-roll');
    roll.dataset.tpl ??= roll.innerHTML;
    roll.innerHTML = roll.dataset.tpl.replace('{team}', team);
    const C = $('#credits'); C.classList.remove('hidden');
    roll.style.animation = 'none'; void roll.offsetWidth; roll.style.animation = '';
  };
  $('#credits').onclick = closeCredits;
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !$('#credits').classList.contains('hidden')) closeCredits(); });
  $('#again').onclick = () => {
    if (G.net.isHost) { $('#victory').classList.add('hidden'); G.stats.start = performance.now(); G.runLoot = []; beginRun(0); loadEncounter(0); lockPointer(canvas); }
    else if (!G.net.isClient) location.reload();
  };
  canvas.addEventListener('click', () => { if (G.state === 'playing' && !Input.locked) lockPointer(canvas); });
}

// ---------------- co-op lobby ----------------
function setupCoop() {
  const nameIn = $('#pname');
  try { nameIn.value = localStorage.getItem('voc-name') || ''; } catch (e) { /* fine */ }
  const myName = () => { const n = clean(nameIn.value.trim() || 'Guardian'); try { localStorage.setItem('voc-name', n); } catch (e) { /* fine */ } return n; };
  const status = (t, err = false) => { $('#lobby').classList.remove('hidden'); const s = $('#lobby .lobby-status'); s.textContent = t; s.classList.toggle('err', err); };
  const lockUi = () => { $('#hostBtn').disabled = $('#joinBtn').disabled = true; nameIn.disabled = $('#joinCode').disabled = true; };

  $('#hostBtn').onclick = async () => {
    lockUi(); status('Opening a portal to the PeerJS realm...');
    try {
      const code = await hostGame(myName());
      $('#lobby .lobby-code').innerHTML = `RAID CODE <b>${code}</b> <button class="copy">copy</button>`;
      $('#lobby .copy').onclick = () => navigator.clipboard?.writeText(code);
      status('Send the code to your friends. Hit LAUNCH when everyone is in (people can also join mid-raid).');
    } catch (e) { status('Could not host: ' + (e.type || e.message) + '. Check your internet connection.', true); $('#hostBtn').disabled = $('#joinBtn').disabled = false; nameIn.disabled = $('#joinCode').disabled = false; }
  };
  $('#joinBtn').onclick = async () => {
    const code = $('#joinCode').value.trim();
    if (code.length < 5) { status('Raid codes are 5 characters.', true); return; }
    initAudio();
    lockUi(); status('Joining...');
    try {
      await joinGame(code, myName());
      $('#launch').textContent = 'WAITING FOR HOST';
      $('#launch').classList.add('disabled');
      $('#startEnc').disabled = true;
      status('You\'re in! Pick a class. The host starts the raid.');
    } catch (e) { status(e.message, true); $('#hostBtn').disabled = $('#joinBtn').disabled = false; nameIn.disabled = $('#joinCode').disabled = false; }
  };
  G.net.onLobby = (players) => {
    $('#lobby .lobby-players').innerHTML = players.map((p) => `<div>${p.host ? '👑' : '◆'} ${escapeHtml(p.name)} <small>${p.cls || ''}</small></div>`).join('');
  };
  G.net.onLoad = (i) => {
    if (G.state === 'menu' || !G.player) { $('#menu').classList.add('hidden'); createPlayer(); }
    $('#victory').classList.add('hidden');
    loadEncounter(i);
  };
  G.net.onWipe = (reason) => showWipe(reason);
  G.net.onVictory = (run) => victory(run);
  G.net.onHostLost = () => {
    G.state = 'wipe';
    $('#wipe .wipe-title').textContent = 'HOST LEFT';
    showWipe('The host closed the raid. Back to orbit...');
    setTimeout(() => location.reload(), 4000);
  };
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Personal loot: rolled on each player's own machine, saved to their own inventory.
function grantLoot(opts, label) {
  const item = rollLoot(opts);
  local(() => {
    play(DEFS[item.id].rarity === 'exotic' ? 'exotic' : 'engram');
    HUD.loot(item);
    if (label) HUD.killfeed(`${label}: ${DEFS[item.id].name}`);
  });
  (G.runLoot ||= []).push(item);
}
function onArmoryClosed() {
  if (G.state === 'playing') { G.paused = false; lockPointer(canvas); }
}

function onLockChange(locked) {
  if (G.debug || G.uiOpen) return;
  // co-op can't pause the world for everyone, so the menu just overlays
  if (!locked && G.state === 'playing' && !G.paused && $('#pause').classList.contains('hidden')) {
    if (!G.net.active) { G.paused = true; speechSynthesis?.pause(); }
    $('#pause').classList.remove('hidden');
    $('#restartEnc').classList.toggle('hidden', G.net.isClient);
  }
  if (locked) resume();
}
function resume() { G.paused = false; $('#pause').classList.add('hidden'); speechSynthesis?.resume(); }

function createPlayer() {
  G.runLoot = [];
  G.stats = { kills: 0, crits: 0, deaths: 0, wipes: 0, shots: 0, hits: 0, start: performance.now(), bruh: 0 };
  if (G.player) G.vmCamera.remove(G.player.vm);
  G.player = new Player(G.cls);
  HUD.buildWeapons(G.player);
}
function startRaid(index) {
  $('#menu').classList.add('hidden');
  createPlayer();
  beginRun(index);
  loadEncounter(index);
}
// the run's encounter order (Shuffle mixes up the five after The Approach)
function runOrder() { return G.run?.order || ENCOUNTERS.map((_, i) => i); }
function nextIndex(i) { const o = runOrder(), k = o.indexOf(i); return k >= 0 && k + 1 < o.length ? o[k + 1] : -1; }
function beginRun(index) {
  G.run = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), clock: 0, splits: [], eligible: index === 0 && !G.debug, wipes: 0, startIdx: index };
  if (G.settings.mods?.shuffle && index === 0) {
    const rest = ENCOUNTERS.map((_, k) => k).slice(1);
    for (let a = rest.length - 1; a > 0; a--) { const b = Math.floor(Math.random() * (a + 1)); [rest[a], rest[b]] = [rest[b], rest[a]]; }
    G.run.order = [0, ...rest];
  }
}

function resetAll() {
  G.encounter?.cleanup();
  clearEnemies(); clearCombat(); clearFx(); clearWorld();
  if (G.net.isClient) resetClientWorld();
  G.timers.length = 0;
  HUD.hideBoss(); HUD.clearDebuffs(); HUD.death(false);
}

// the Firing Range lives outside the raid's encounter list
const RANGE_INDEX = 99;
const encClass = (i) => (i === RANGE_INDEX ? FiringRange : ENCOUNTERS[i]);

const SOUNDSCAPES = {
  FiringRange: ['courtyard', 'outdoor'],
  TheApproach: ['outdoor', 'storm'], NormieGate: ['courtyard', 'courtyard'], EmergencyMeeting: ['ship', 'ship'],
  VineBoomChamber: ['temple', 'temple'], ThisIsFine: ['livingroom', 'livingroom'], SkibidiFinale: ['void', 'void'],
};
// how hard the music should go: enemies near you, a boss you can actually hurt
let musicT = 0;
function updateMusicIntensity(dt) {
  if ((musicT -= dt) > 0) return;
  musicT = 0.5;
  const p = G.player;
  let near = 0, boss = null;
  for (const e of G.enemies) {
    if (!e.alive || !e.hostile) continue;
    if (e.rank === 'boss') boss = e;
    else if (e.pos.distanceTo(p.pos) < 35) near++;
  }
  setMusicIntensity(0.28 + Math.min(0.45, near * 0.09) + (boss ? (boss.immune ? 0.15 : 0.4) : 0) + (G.cursed >= 4 ? 0.1 : 0));
}

function loadEncounter(i) {
  if (G.photo) togglePhoto();
  G.isFinal = nextIndex(i) < 0; // (Shuffle: the finale isn't always last)
  G.state = 'loading';
  if (G.net.isHost) G.net.hostLoad(i);
  stopMusic();
  const E = encClass(i);
  const L = $('#loading');
  L.querySelector('.load-name').textContent = E.title;
  L.querySelector('.load-tip').textContent = pick(TIPS);
  const fill = L.querySelector('.load-bar .fill');
  fill.style.transition = 'none'; fill.style.width = '0';
  L.classList.remove('hidden');
  $('#wipe').classList.add('hidden');
  requestAnimationFrame(() => { fill.style.transition = ''; fill.style.width = '100%'; });
  HUD.show(false);
  setTimeout(() => {
    resetAll();
    G.encounterIndex = i;
    const enc = new E();
    G.encounter = enc;
    G.cursed = enc.cursed;
    G.nextNid = 1; // build() creates the same static actors with the same ids everywhere
    enc.build();
    mergeStatic();
    bakeEnvironment();
    // each arena sounds like itself: its own reverb + background
    const snd = SOUNDSCAPES[E.name] || ['hall', null];
    setRoom(snd[0]); setAmbience(snd[1]);
    const spawn = enc.spawn.clone();
    if (G.net.active) { spawn.x += (Math.random() - 0.5) * 6; spawn.z += Math.random() * 3; }
    G.player.reset(spawn, enc.spawnYaw);
    G.player.revives = G.net.active ? 0 : 3;
    HUD.setRevives(G.player.revives);
    HUD.setCursed(enc.cursed);
    local(() => HUD.objective(E.title, ''));
    G.nextNid = 1000; // anything spawned from here on gets its id from the host
    if (G.net.isClient) enc.clientStart(); else enc.start();
    L.classList.add('hidden');
    HUD.show(!G.cine); // a boss intro keeps the HUD hidden until it ends
    G.state = 'playing';
    G.allDeadT = 0;
    startMusic(enc.cursed);
  }, G.debug ? 200 : 2700);
}

function onPlayerDeath() {
  const p = G.player;
  if (G.encounter?.traversal) {
    after(2.5, () => {
      if (G.state !== 'playing' || p.alive) return;
      HUD.death(false);
      p.reset(G.encounter.spawn.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, 0)), G.encounter.spawnYaw);
      HUD.ghost(pick(['Back to the checkpoint. Watch your step.', 'Gravity: undefeated.', 'I have seen Hunters fall less. Barely.']), { voice: true });
    });
    return;
  }
  if (G.net.active) return; // co-op: teammates revive you; the host wipes when everyone is down
  if (G.settings.mods?.oneLife) { wipe('One Life. You had one job. (Modifier: 💀 One Life)'); return; }
  if (p.revives > 0) {
    p.revives--;
    HUD.setRevives(p.revives);
    after(4, () => {
      if (G.state !== 'playing') return;
      HUD.death(false);
      p.reset(G.encounter.spawn, G.encounter.spawnYaw);
      G.encounter.onPlayerRespawn?.();
      HUD.ghost(pick(['Back on your feet, Guardian. Try to be less dead.', `Revive tokens left: ${p.revives}. I am not made of light, you know.`, 'Revived. I had to use the good light for that.']), { voice: true });
    });
  } else {
    after(2.5, () => wipe('Out of revives. The memes win this round.'));
  }
}

function showWipe(reason) {
  G.state = 'wipe';
  G.stats.wipes++;
  stopMusic();
  local(() => { play('wipe'); say('squad wiped. bruh.', 'bruh'); });
  wipeGrade(); HUD.death(false);
  const W = $('#wipe');
  W.querySelector('.wipe-reason').textContent = reason;
  W.querySelector('.wipe-joke').textContent = pick(WIPE_JOKES).replace('{n}', G.stats.wipes);
  W.classList.remove('hidden');
}
function wipe(reason) {
  if (G.state !== 'playing' || G.net.isClient) return;
  if (G.run) G.run.wipes++;
  if (G.net.isHost) G.net.hostWipe(reason);
  showWipe(reason);
  setTimeout(() => {
    $('#wipe').classList.add('hidden');
    G.player.revives = 3;
    loadEncounter(G.encounterIndex);
  }, 4200);
}

function onEncounterComplete() {
  if (G.run) G.run.splits.push({ name: ENCOUNTERS[G.encounterIndex].title, t: +G.run.clock.toFixed(2) });
  if (G.encounter?.traversal) {
    play('superReady');
    HUD.bigText('THE VAULT OF CRINGE', 'the raid begins', 3, 'meme');
    after(2.5, () => loadEncounter(nextIndex(G.encounterIndex)));
    return;
  }
  play('fanfare');
  HUD.bigText('ENCOUNTER COMPLETE', pick(['the memes have been defeated', 'certified W', 'that was cringe. good job.']), 3.5, 'good');
  const k = runOrder().indexOf(G.encounterIndex), last = nextIndex(G.encounterIndex) < 0;
  if (G.net.isHost) G.net.emit(['loot', G.encounterIndex, k, last]);
  local(() => G.onLoot(G.encounterIndex, k, last));
  for (let i = 0; i < 4; i++) new Pickup(i % 2 ? 'special' : 'heavy', G.player.pos.clone().setY(G.player.pos.y + 2));
  after(5, () => {
    const next = nextIndex(G.encounterIndex);
    if (next >= 0) loadEncounter(next);
    else { const run = finishRun(); if (G.net.isHost) G.net.hostVictory(run); victory(run); }
  });
}

// Package the clear: time, splits, who was in the fireteam.
function finishRun() {
  const r = G.run;
  if (!r) return null;
  const team = [{ name: G.net.active ? G.net.name : (localStorage.getItem('voc-name') || 'Guardian'), cls: G.player.cls }, ...[...G.avatars.values()].map((a) => ({ name: a.name, cls: a.cls }))];
  const mods = Object.keys(MODS).filter((k) => G.settings.mods?.[k]);
  return { id: r.id, time: +r.clock.toFixed(2), date: Date.now(), team, wipes: r.wipes, kills: G.stats.kills, splits: r.splits, eligible: r.eligible, mods };
}

function victory(run = null) {
  G.state = 'victory';
  // the leaderboard
  const L = $('#victory .clear');
  if (run && run.eligible) {
    const res = recordRun(run);
    L.innerHTML = `<div class="ct-label">CLEAR TIME</div><div class="ct-time">${formatTime(run.time)}</div>`
      + (res.pb ? '<div class="ct-pb">⚡ NEW PERSONAL BEST ⚡</div>' : res.rank ? `<div class="ct-rank">#${res.rank} on your board</div>` : '<div class="ct-rank">not in your top 25. skill issue.</div>')
      + `<div class="ct-splits">${run.splits.map((s, i) => `<span>${s.name.replace(/^THE /, '')} <b>${formatTime(s.t - (i ? run.splits[i - 1].t : 0), false)}</b></span>`).join('')}</div>`
      + '<button class="btn ghostbtn inline" id="copyRun">📋 COPY RESULT</button>';
    $('#copyRun').onclick = (e) => { navigator.clipboard?.writeText(shareText(run)); e.target.textContent = '✅ COPIED — paste it in the group chat'; };
  } else if (run) {
    L.innerHTML = `<div class="ct-label">PRACTICE RUN · ${formatTime(run.time)}</div><div class="ct-rank">${G.debug || run.startIdx !== 0 ? 'Start from The Approach' : 'No cheats'} to put a time on the leaderboard.</div>`;
  } else L.innerHTML = '';
  stopMusic();
  local(() => { play('fanfare'); play('airhorn'); say('raid complete. you are now terminally online.', 'ghost'); });
  document.exitPointerLock?.();
  const s = G.stats;
  const mins = Math.floor((performance.now() - s.start) / 60000), secs = Math.floor((performance.now() - s.start) / 1000) % 60;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const V = $('#victory');
  V.querySelector('.stats').innerHTML = [
    ['Time', run ? formatTime(run.time, false) : `${mins}:${String(secs).padStart(2, '0')}`], ['Memes Deleted', s.kills], ['Crits', s.crits],
    ['Deaths', s.deaths], ['Wipes', s.wipes], ['Bruh Moments', s.bruh], ['Accuracy', acc + '%'], ['Class', G.player.clsDef.name],
    G.net.active ? ['Fireteam', G.avatars.size + 1] : ['Title', 'Terminally Online'],
  ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  // what you actually got this run (it's already in your armory), plus one bit of flavor
  const got = (G.runLoot || []).map((it) => { const d = DEFS[it.id]; return `<div class="item ${d.rarity === 'exotic' ? '' : 'leg'}"><b>${d.name}</b><div>${d.rarity === 'exotic' ? 'Exotic' : 'Legendary'} ${d.type} · ${it.perks.map((k) => PERKS[k].icon + ' ' + PERKS[k].name).join(' · ')}</div></div>`; });
  const flavor = pick(LOOT);
  V.querySelector('.loot').innerHTML = got.join('') + `<div class="item"><b>${flavor[0]}</b><div>${flavor[1]}</div></div>`;
  $('#again').textContent = G.net.isClient ? 'WAITING FOR HOST' : 'RUN IT BACK';
  HUD.show(false);
  V.classList.remove('hidden');
}

// ---------------- co-op per-frame bits ----------------
let reviveT = 0;
function coopFrame(dt) {
  for (const av of G.avatars.values()) av.update(dt);
  HUD.fireteam(G.net.active ? [{ name: G.net.name + ' (you)', alive: G.player.alive }, ...[...G.avatars.values()].map((a) => ({ name: a.name, alive: a.alive }))] : null);
  // revive a downed teammate: hold E near their Ghost
  const p = G.player;
  let target = null;
  if (p.alive) for (const av of G.avatars.values()) if (!av.alive && av.revivePos.distanceTo(p.pos) < 2.6) { target = av; break; }
  if (target && down('KeyE')) {
    reviveT += dt;
    if (reviveT >= 1.4) { reviveT = 0; G.net.revive(target.id); HUD.killfeed(`You revived ${target.name}`); }
  } else reviveT = 0;
  HUD.prompt(target ? `Hold [E] to revive ${target.name}` : null, reviveT / 1.4);
  // host: everyone down = wipe
  if (G.net.isHost && G.state === 'playing') {
    G.allDeadT = alivePlayers().length === 0 && !G.encounter?.traversal ? (G.allDeadT || 0) + dt : 0;
    if (G.allDeadT > 2.5) wipe('The whole fireteam is down. Nobody left to pick anyone up.');
  }
}

function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  autoQuality(raw);
  step(Math.min(raw, 1 / 20));
}

if (G.debug) window.autoQuality = (dt) => autoQuality(dt); // test hook
// First-run auto quality: if real gameplay can't hold ~45 fps, step down a preset (until the player picks one).
let aqWarm = 0, aqT = 0, aqN = 0;
function autoQuality(dt) {
  const st = G.settings;
  if (st.qualityPicked || st.qualityChecked || G.debug) return;
  if (G.state !== 'playing' || G.paused || G.cine || document.visibilityState !== 'visible' || dt > 0.5) { aqWarm = 0; aqT = 0; aqN = 0; return; }
  if ((aqWarm += dt) < 3) return; // let shaders compile and the arena settle
  aqT += dt; aqN++;
  if (aqT < 5) return;
  const ms = (aqT / aqN) * 1000;
  aqWarm = 0; aqT = 0; aqN = 0;
  const q = st.quality || 'high';
  if (ms > 22 && q !== 'low') {
    st.quality = q === 'high' ? 'medium' : 'low';
    applyQuality();
    document.querySelectorAll('.quality').forEach((e) => (e.value = st.quality));
    HUD.killfeed(`Graphics set to ${st.quality.toUpperCase()} for smoother play (${Math.round(1000 / ms)} fps). Change it in the menu.`);
  } else st.qualityChecked = true;
  try { localStorage.setItem('voc-settings', JSON.stringify(st)); } catch (e) { /* fine */ }
}
// Debug helper: advance the sim manually (e.g. when the tab is in the background)
window.simulate = (seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) step(dt, false); render(dt); };

function step(dt, doRender = true) {
  // the raid clock: counts while playing (cutscenes included), stops while paused or loading
  if (G.state === 'playing' && !G.paused) updateMusicIntensity(dt);
  // the Distracted Boyfriend's stare
  if (G.state === 'playing' && G.player) {
    const n = G.enemies.some((e) => e.alive && e.markId && e.markId === G.net.myId);
    if (n !== G.player.noticed) { G.player.noticed = n; if (n) HUD.setDebuff('noticed', '👀 NOTICED: +50% damage taken, enemies focus you', true); else HUD.clearDebuff('noticed'); }
  }
  if (G.state === 'playing' && !G.paused && G.run && !G.net.isClient) {
    G.run.clock += dt;
    if (G.godMode) G.run.eligible = false; // nice try
  }
  if (G.state === 'menu') {
    const t = performance.now() / 1000;
    G.camera.position.set(Math.sin(t * 0.08) * 42, 14, Math.cos(t * 0.08) * 42);
    G.camera.lookAt(0, 5, 0);
    G.menuEnc?.animateOrbiters(dt);
    updateDressing(dt);
  } else if (G.state === 'playing' && !G.paused && G.cine) {
    // boss intro: the world holds its breath (no AI, no timers, no damage); the camera is the cinematic's
    updateEnemies(dt);
    G.encounter?.cineTick?.(dt);
    G.cine?.update(dt);
    for (const av of G.avatars.values()) av.update(dt);
    updateDressing(dt);
    updateFx(dt);
  } else if (G.state === 'playing' && !G.paused && G.photo && !G.net.active) {
    // photo mode, solo: the world is frozen, only the camera moves
    if (hit('KeyP')) togglePhoto(); else photoUpdate(dt);
  } else if (G.state === 'playing' && !G.paused) {
    if (hit('KeyP') && G.player.alive) togglePhoto();
    G.time += dt;
    updateTimers();
    if (G.photo) photoUpdate(dt); else G.player.update(dt);
    followSun(G.sun, G.player.pos);
    updateEnemies(dt);
    updateCombat(dt);
    if (!G.net.isClient) G.encounter?.update(dt);
    G.encounter?.runLocal(dt);
    if (G.net.active) coopFrame(dt);
    updateDressing(dt);
    updateFx(dt);
    HUD.update(G.player);
  } else if (G.state === 'wipe' || G.state === 'victory' || G.state === 'loading') {
    updateFx(dt);
    for (const av of G.avatars.values()) av.update(dt);
  }
  updateListener(G.camera);
  netUpdate(dt);
  endFrame();
  if (doRender) render(dt);
}

init();
if (G.debug) import('./debug.js');
