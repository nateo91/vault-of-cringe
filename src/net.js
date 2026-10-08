// Online co-op over WebRTC (PeerJS). One player hosts and runs the simulation;
// everyone else renders snapshots and is authoritative only over their own guardian.
import * as THREE from 'three';
import { Peer } from 'peerjs';
import { G, pick, local } from './game.js';
import { applyFx, dmgNumber, impact, superRing, crater, grenadeField, rally } from './fx.js';
import { play, playAt, say } from './audio.js';
import { HUD } from './hud.js';
import { BUILD } from './version.js';
import { hasSeal } from './triumphs.js';
// a build mismatch: in the killfeed mid-raid, and on the lobby line in the menu (where the killfeed isn't shown)
function versionWarning(t) {
  HUD.killfeed(t);
  const s = document.querySelector('#lobby .lobby-status');
  if (s) { s.textContent = t; s.classList.add('err'); }
}
import { Projectile, Shockwave, Pickup, applyPickup } from './combat.js';
import { NET_TYPES, applyMods, creditKill } from './enemies.js';
import { Avatar } from './avatars.js';

const PREFIX = 'vault-of-cringe-v1-';
const TICK = 1 / 20;
const r2 = (n) => Math.round(n * 100) / 100;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const Net = G.net;
Object.assign(Net, {
  peer: null, code: null, name: 'Guardian',
  peers: new Map(),      // host only: id -> { conn, name, cls, state }
  hostConn: null,        // client only
  bcast: [],             // host: events for everyone  ({ ev, except })
  targeted: new Map(),   // host: id -> events for one guardian
  outbox: [],            // client: events for the host
  hud: {},               // host: latest shared HUD state (objective, boss bar)
  tickT: 0,
  lobby: [],
  onLobby: null, onLoad: null, onWipe: null, onVictory: null, onHostLost: null,
});

// ---------------- sending ----------------
Net.emit = (ev) => { if (Net.isHost) Net.bcast.push({ ev }); };
Net.sendTo = (id, ev) => {
  if (!Net.isHost) return;
  if (id === Net.myId) { handleEvent(ev); return; }
  if (!Net.peers.has(id)) return;
  const q = Net.targeted.get(id) || [];
  // merge continuous damage (lasers, lava) into one event per tick
  if (ev[0] === 'hurt') { const h = q.find((e) => e[0] === 'hurt'); if (h) { h[1] += ev[1]; Net.targeted.set(id, q); return; } }
  q.push(ev); Net.targeted.set(id, q);
};
// Your own guardian's visible actions (shots, rockets, slams): to everyone else.
Net.playerEv = (ev) => {
  if (!Net.active) return;
  if (Net.isHost) Net.bcast.push({ ev });
  else Net.outbox.push(ev);
};
function sendRaw(conn, msg) { try { if (conn.open) conn.send(msg); } catch (e) { console.warn('send failed', e); } }
Net.broadcast = (msg) => { for (const p of Net.peers.values()) sendRaw(p.conn, msg); };

// ---------------- hosting ----------------
// earned the TERMINALLY ONLINE seal? everyone sees the medal next to your name
const titled = (name) => (hasSeal() ? `${String(name).slice(0, 16)} 🏅` : name);
export function hostGame(name) {
  Net.name = titled(name);
  return new Promise((resolve, reject) => {
    const tryCode = (attempt) => {
      const code = Array.from({ length: 5 }, () => pick(CODE_CHARS.split(''))).join('');
      const peer = new Peer(PREFIX + code, { debug: 1 });
      peer.on('open', () => {
        Object.assign(Net, { peer, code, active: true, isHost: true, isClient: false, myId: 'host' });
        updateLobby();
        resolve(code);
      });
      peer.on('connection', (conn) => setupHostConn(conn));
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryCode(attempt + 1); }
        else if (!Net.active) reject(e);
        else console.warn('peer error', e);
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    };
    tryCode(0);
  });
}

function setupHostConn(conn) {
  conn.on('data', (msg) => onHostData(conn, msg));
  conn.on('close', () => dropPeer(conn.peer));
  conn.on('error', () => dropPeer(conn.peer));
}

function dropPeer(id) {
  const p = Net.peers.get(id);
  if (!p) return;
  Net.peers.delete(id); Net.targeted.delete(id);
  const av = G.avatars.get(id);
  if (av) { av.dispose(); G.avatars.delete(id); }
  HUD.killfeed(`${p.name} left the fireteam`);
  updateLobby();
}

function onHostData(conn, msg) {
  const id = conn.peer;
  switch (msg.t) {
    case 'hello': {
      if (Net.peers.size >= 5) { sendRaw(conn, { t: 'full' }); return; }
      Net.peers.set(id, { conn, name: clean(msg.name), cls: msg.cls, state: null });
      sendRaw(conn, { t: 'welcome', id, build: BUILD });
      if (msg.build !== BUILD) versionWarning(`⚠ ${clean(msg.name)} is on a different version (${msg.build || 'old'} vs your ${BUILD}). Everyone should reload.`);
      if (G.state !== 'menu') { ensureAvatar(id, clean(msg.name), msg.cls); sendRaw(conn, { t: 'load', i: G.encounterIndex }); }
      HUD.killfeed(`${clean(msg.name)} joined the fireteam`);
      updateLobby();
      break;
    }
    case 'ps': {
      const p = Net.peers.get(id); if (!p) return;
      p.state = msg.s;
      if (G.state !== 'menu') ensureAvatar(id, p.name, msg.s[6]).setState(msg.s);
      break;
    }
    case 'hit': {
      const e = G.enemies.find((x) => x.nid === msg.n && x.alive);
      if (e) e.takeDamage(msg.d, msg.c, { from: id, splash: msg.s, element: msg.el || null, weapon: msg.w || null });
      break;
    }
    case 'ev':
      for (const ev of msg.e) {
        if (ev[0] === 'revive') { reviveGuardian(ev[1]); continue; }
        local(() => handleEvent(ev, id));       // show it on the host (local: the relay below already forwards it)
        Net.bcast.push({ ev, except: id });     // and relay it to the rest
      }
      break;
  }
}

function reviveGuardian(target) {
  if (target === Net.myId) handleEvent(['revive']);
  else Net.sendTo(target, ['revive']);
}

function ensureAvatar(id, name, cls) {
  let av = G.avatars.get(id);
  if (!av) { av = new Avatar(id, name, cls); G.avatars.set(id, av); }
  return av;
}

function updateLobby() {
  Net.lobby = [{ id: Net.myId, name: Net.name, cls: G.cls, host: true }, ...[...Net.peers].map(([pid, p]) => ({ id: pid, name: p.name, cls: p.state?.[6] || p.cls }))];
  if (Net.isHost) Net.broadcast({ t: 'lobby', players: Net.lobby });
  Net.onLobby?.(Net.lobby);
}

// Host tells everyone to (re)load an encounter / that the squad wiped / that the raid is done.
Net.hostLoad = (i) => Net.broadcast({ t: 'load', i });
Net.hostWipe = (reason) => Net.broadcast({ t: 'wipe', reason });
Net.hostVictory = (run) => Net.broadcast({ t: 'victory', run });

function myState() {
  const p = G.player;
  if (!p) return null;
  return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), p.alive ? 1 : 0, p.cls, Net.name, r2(p.lastSafe.x), r2(p.lastSafe.y), r2(p.lastSafe.z), p.emote || 0];
}

function buildSnap() {
  const en = [];
  for (const e of G.enemies) if (e.alive) en.push(e.netRow());
  const pk = G.pickups.filter((p) => p.alive).map((p) => [p.nid, p.kind, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)]);
  const pl = [['host', myState()]];
  for (const [id, p] of Net.peers) if (p.state) pl.push([id, p.state]);
  return { t: 'snap', i: G.encounterIndex, en, pk, pl, es: G.encounter?.netState?.() ?? 0, hud: Net.hud, rc: G.run ? [Math.round(G.run.clock * 10) / 10, G.run.eligible ? 1 : 0] : 0 };
}

function hostTick() {
  if (!Net.peers.size) { Net.bcast.length = 0; Net.targeted.clear(); return; }
  const snap = G.state === 'playing' ? buildSnap() : null;
  for (const [id, p] of Net.peers) {
    const ev = [];
    for (const b of Net.bcast) if (b.except !== id) ev.push(b.ev);
    const t = Net.targeted.get(id); if (t) ev.push(...t);
    if (snap) sendRaw(p.conn, { ...snap, ev });
    else if (ev.length) sendRaw(p.conn, { t: 'evs', ev });
  }
  Net.bcast.length = 0; Net.targeted.clear();
}

// ---------------- joining ----------------
export function joinGame(code, name) {
  Net.name = titled(name);
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 1 });
    let done = false;
    const fail = (why) => { if (!done) { done = true; peer.destroy(); reject(new Error(why)); } };
    setTimeout(() => fail('Timed out. Check the code, and that the host is still in the menu or raid.'), 15000);
    peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'No raid with that code. Typo?' : 'Connection error: ' + e.type));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        Object.assign(Net, { peer, hostConn: conn, code: code.toUpperCase(), active: true, isHost: false, isClient: true });
        sendRaw(conn, { t: 'hello', name, cls: G.cls, build: BUILD });
      });
      conn.on('data', (msg) => {
        if (msg.t === 'welcome') {
          Net.myId = msg.id; done = true; resolve();
          if (msg.build !== BUILD) setTimeout(() => versionWarning(`⚠ The host is on a different version (${msg.build || 'old'} vs your ${BUILD}). Everyone should reload.`), 500);
        }
        else if (msg.t === 'full') fail('That fireteam is full (6 max).');
        else onClientData(msg);
      });
      conn.on('close', () => { if (done) Net.onHostLost?.(); else fail('Host closed the connection.'); });
    });
  });
}

function onClientData(msg) {
  switch (msg.t) {
    case 'lobby': Net.lobby = msg.players; Net.onLobby?.(msg.players); break;
    case 'load': Net.onLoad?.(msg.i); break;
    case 'wipe': Net.onWipe?.(msg.reason); break;
    case 'victory': Net.onVictory?.(msg.run); break;
    case 'evs': for (const ev of msg.ev) handleEvent(ev); break;
    case 'snap': applySnap(msg); break;
  }
}

const proxyPickups = new Map();
let lastHud = {};
function applySnap(s) {
  const ready = G.state === 'playing' && G.encounterIndex === s.i && G.encounter;
  if (ready) {
    // deaths first, so their proxies burn away instead of just vanishing
    for (const ev of s.ev || []) if (ev[0] === 'die') G.enemies.find((x) => x.nid === ev[1] && x.alive)?.dissolveOut();
    // enemies
    const seen = new Set();
    for (const row of s.en) {
      const nid = row[0];
      seen.add(nid);
      let e = G.enemies.find((x) => x.nid === nid);
      if (!e) {
        const make = NET_TYPES[row[1]];
        if (!make) continue;
        e = make(row[2]);
        if (!e) continue;
        applyMods(e);
        e.nid = nid; e.proxy = true;
        G.enemies.push(e);
      }
      if (e.alive) e.applyRow(row);
    }
    for (const e of G.enemies) if (e.alive && !seen.has(e.nid)) e.remove();
    // pickups (render-only)
    const pseen = new Set();
    for (const [nid, kind, x, y, z] of s.pk) {
      pseen.add(nid);
      let p = proxyPickups.get(nid);
      if (!p) { p = new Pickup(kind, new THREE.Vector3(x, y, z), { proxy: true }); proxyPickups.set(nid, p); }
      p.pos.set(x, y, z);
    }
    for (const [nid, p] of proxyPickups) if (!pseen.has(nid)) { p.remove(); proxyPickups.delete(nid); }
    G.encounter.applyNet?.(s.es);
  }
  // other guardians (including the host)
  const pseen = new Set();
  for (const [id, st] of s.pl) {
    if (id === Net.myId || !st) continue;
    pseen.add(id);
    let av = G.avatars.get(id);
    if (!av) { av = new Avatar(id, st[7], st[6]); G.avatars.set(id, av); }
    av.setState(st);
  }
  for (const [id, av] of G.avatars) if (!pseen.has(id)) { av.dispose(); G.avatars.delete(id); }
  G.runView = s.rc || null; // the host's raid clock, for the HUD timer
  // shared HUD state
  for (const k in s.hud) {
    const v = JSON.stringify(s.hud[k]);
    if (lastHud[k] !== v) { lastHud[k] = v; const [m, a] = s.hud[k]; HUD[m]?.(...a); }
  }
  for (const ev of s.ev || []) handleEvent(ev);
}
export function resetClientWorld() { proxyPickups.forEach((p) => p.remove()); proxyPickups.clear(); lastHud = {}; }

// Clients: report a hit on a proxy to the host, and predict the feedback locally.
Net.clientHit = (e, dmg, crit, info) => {
  if (!e.alive) return 0;
  if (G.settings.mods?.glass) dmg *= 1.5;
  Net.outbox.push(['__hit', e.nid, Math.round(dmg), !!crit, !!info.splash, info.element || 0, info.weapon || 0]);
  if (info.weapon) G.player?.perks?.noteHit(info.weapon); // (Bait and Switch counts your hits on your machine)
  if (e.hostile === false) return 0; // crewmates / statues: the host decides what happens
  if (e.immune || e.untargetable) { dmgNumber(e.top(), 'IMMUNE', 'immune'); return 0; }
  e.pop = 1; e.flinch = Math.min(1.2, (e.flinch || 0) + (crit ? 0.9 : 0.45));
  let side = 0;
  if (info.point) { const dx = info.point.x - e.pos.x, dz = info.point.z - e.pos.z; side = Math.sign(dx * Math.cos(e.yaw) - dz * Math.sin(e.yaw)) || 0; }
  e.rig?.hit(crit, side);
  // predict the shield hit so the number shows in the shield's colour (the host does the real maths)
  if (e.shieldHp > 0) { const m = info.element === e.shieldEl; const sd = Math.round(dmg * (m ? 3 : 1)); e.shieldFlash = 1; dmgNumber(e.top(), sd, 'shield el-' + e.shieldEl + (m ? ' match' : '')); return sd; }
  const d = Math.max(1, Math.round(dmg));
  dmgNumber(e.top(), d, crit ? 'crit' : '');
  if (crit) G.stats.crits++;
  return d;
};

function clientTick() {
  const c = Net.hostConn;
  if (!c) return;
  const st = myState();
  if (st) sendRaw(c, { t: 'ps', s: st });
  if (!Net.outbox.length) return;
  const hits = Net.outbox.filter((e) => e[0] === '__hit');
  const evs = Net.outbox.filter((e) => e[0] !== '__hit');
  for (const h of hits) sendRaw(c, { t: 'hit', n: h[1], d: h[2], c: h[3], s: h[4], el: h[5] || null, w: h[6] || null });
  if (evs.length) sendRaw(c, { t: 'ev', e: evs });
  Net.outbox.length = 0;
}

// Ask a teammate's machine to bring them back.
Net.revive = (targetId) => {
  if (Net.isHost) reviveGuardian(targetId);
  else Net.outbox.push(['revive', targetId]);
};

// ---------------- events (both sides) ----------------
function handleEvent(ev, from) {
  const [type, a, b, c, d, e] = ev;
  const playing = G.state === 'playing';
  switch (type) {
    case 'fx': if (playing) applyFx(a, b); break;
    case 'snd': play(a, ...(b || [])); break;
    case 'snd3': playAt(a, b, ...(c || [])); break;
    case 'say': say(a, b, c); break;
    case 'hud': HUD[a]?.(...b); break;
    case 'proj': if (playing) Projectile.fromNet(a, a.owner === 'player'); break;
    case 'shock': if (playing) new Shockwave({ ...a, center: new THREE.Vector3(...a.center), fromNet: true }); break;
    case 'enc': if (playing) G.encounter?.['ev_' + a]?.(b); break;
    case 'shot': if (playing) {
      applyFx('tracer', [a, b, c, d]); if (e) playAt(a, e);
      const pa = new THREE.Vector3(...a), pb = new THREE.Vector3(...b);
      impact(pb, null, pb.clone().sub(pa).normalize(), { sparks: 4 });
    } break;
    case 'noclip': if (Net.isHost) G.onNoclip?.(); break;
    case 'pfx':
      if (!playing) break;
      if (a === 'boom') { applyFx('explosion', [b, c, d]); playAt(b, 'explosion', 1.5); }
      else if (a === 'ring') superRing(new THREE.Vector3(...b), c, 7);
      else if (a === 'gren') grenadeField(c, new THREE.Vector3(...b), 3);
      else if (a === 'rally') rally(new THREE.Vector3(...b));
      else if (a === 'crater') { const q = new THREE.Vector3(...b); superRing(q, 0x7fd7ff, 12); crater(q, 7); }
      break;
    case 'hurt': G.player?.hurt(a, b, c != null ? { x: c, z: d } : null); break;
    case 'rick': G.player?.rickroll(); break;
    case 'pickup': applyPickup(a); break;
    case 'kill': G.stats.kills++; G.player?.addSuper(a); creditKill(b || null, !!c); break;
    case 'revive': G.player?.revive(); break;
    case 'loot': G.onLoot?.(a, b ?? a, c ?? undefined, !!d); break;
  }
}

// Called every frame from the game loop.
export function netUpdate(dt) {
  if (!Net.active) return;
  Net.tickT += dt;
  if (Net.tickT < TICK) return;
  Net.tickT = 0;
  if (Net.isHost) hostTick(); else clientTick();
}
// Hidden tabs throttle requestAnimationFrame — keep the host ticking anyway.
setInterval(() => { if (Net.active && document.hidden) netUpdate(TICK); }, 50);

export function leave() { try { Net.peer?.destroy(); } catch (e) { /* ignore */ } }
const clean = (n) => String(n || 'Guardian').replace(/[<>]/g, '').slice(0, 20) || 'Guardian'; // (16 + room for a seal medal)
export { Net, clean };
