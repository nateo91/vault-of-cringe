// Roasts: the spicier side of the Ghost. Settings has Roasts: Spicy (default) / Mild (the original tone).
// House rules for anything added here: roast the *player's skill* and the memes, never people or groups.
// No slurs, nothing sexual, no real people, no politics, no self-harm jokes. Mean, not nasty.
import { G, pick, local } from './game.js';
import { HUD } from './hud.js';

export const spicy = () => (G.settings.roasts || 'spicy') === 'spicy';
const ghost = (t) => local(() => HUD.ghost(t)); // your roasts are yours: never broadcast to the fireteam

// ---------------- the death screen ----------------
const DEATH_MILD = ['Bruh.', 'Skill issue detected.', 'Have you tried not dying?', 'Your Ghost sighs audibly.', 'That was cringe.', 'L + ratio + revived.'];
const DEATH_SPICY = [
  'Skill issue. Diagnosed. Terminal.', 'Your K/D just filed a complaint.', 'That was so bad the memes are embarrassed for you.',
  'Even the Doge saw that coming.', 'Bro got cooked.', 'Aura: -1000.', 'Caught in 4K. Dying.', 'You are the NPC in this story.',
  'Your Ghost is updating your obituary. It is short.', 'Respawning. Your dignity will not.', 'Mid. And that is generous.',
  'Emotional damage.', 'That death was sponsored by your reaction time.', 'Who taught you to play? Asking so I can report them.',
  'Crashed out.', 'Bro is NOT him.', 'Certified bot behavior.', 'You got outplayed by a meme. Sit with that.',
];
export function deathQuip(cause = '') {
  if (!spicy()) return pick(DEATH_MILD);
  const c = cause.toLowerCase();
  if (/void|gravity|fell|fall/.test(c)) return pick(['Gravity: 1. You: 0.', 'You found the bottom. There is no bottom.', 'Jumping is the one thing Guardians do. Anyway.', 'Fell off. Literally and figuratively.']);
  if (/your own|yourself|self/.test(c)) return pick(['Friendly fire. From you. To you.', 'You were the threat all along.', 'Outplayed by yourself. Impressive, honestly.']);
  return pick(DEATH_SPICY);
}

// ---------------- the Ghost keeps count ----------------
const DEATH_COUNT = {
  3: 'Third death. I have started a tally.',
  5: 'Five deaths. Reviving you is not love anymore. It is a contractual obligation.',
  8: 'Eight. One more and I am telling the other Ghosts.',
  12: 'Twelve. I asked the Traveler for a different Guardian. It said no.',
  20: 'Twenty deaths. Legendary. Not the good kind.',
  30: 'Thirty. You are not dying anymore. You are touring.',
};
export function onDeath(n) { if (spicy() && DEATH_COUNT[n]) setTimeout(() => ghost(DEATH_COUNT[n]), 1200); }

// a long run of misses (the perk engine counts them)
const MISSES = ['Fifteen shots. Zero hits. The wall is terrified, though.', 'Are you shooting at them, or near them?', 'I have seen Stormtroopers with better aim.', 'Statistically, you should have hit something by now.', 'The memes are not even dodging. They are just standing there.'];
let missSaid = -999;
export function onMissStreak(n) {
  if (!spicy() || n !== 15 || G.time - missSaid < 40) return;
  missSaid = G.time; ghost(pick(MISSES));
}

// a teammate goes down (co-op)
const DOWN = ['{name} is down. Shocking. Truly.', '{name} went down. Pour one out.', '{name} has been deleted. Temporarily. Probably.', 'Someone get {name}. Or do not. I am not their Ghost.', '{name} is down. Again. Classic {name}.'];
let downSaid = -999;
export function onTeammateDown(name) {
  if (!spicy() || G.time - downSaid < 20 || Math.random() > 0.6) return;
  downSaid = G.time; ghost(pick(DOWN).replaceAll('{name}', name));
}

// the Approach: the Ghost catching you over the chasm, over and over
const CATCHES = {
  5: 'Five falls. I am billing you for these.',
  10: 'Ten. At this point the chasm knows your name.',
  20: 'Twenty. I am a safety net with feelings, and they are hurt.',
  35: 'Thirty-five falls. Some Guardians are born to jump. You were born to be caught.',
  50: 'Fifty. I am not mad. I am just going to tell everyone.',
};
export const catchLine = (n) => (spicy() ? CATCHES[n] : null);

// ---------------- the wipe screen ----------------
const WIPE_MILD = [
  'Bungie would like to remind you that this is a skill issue.', 'Have you considered: being better?', "Your Ghost is drafting a strongly worded LFG post.",
  'Somewhere, a Sherpa just felt a disturbance.', 'Wipe #{n}. The memes grow stronger.', 'Bruh.', 'Who was on adds? Nobody was on adds.',
];
const WIPE_SPICY = [
  'Not a wipe. A group project failure.', 'Everyone died. The memes are doing a victory lap.', 'Somewhere a Sherpa is laughing. Out loud.',
  'The fireteam has been cooked. Medium rare.', 'LFG post updated: must have hands.', 'Wipe #{n}. At this point the boss feels bad for you.',
  'Collective skill issue.', 'Four Guardians. Zero brain cells. Shared.', 'Who was on adds? Be honest. It was nobody. It is always nobody.',
  'The memes would like to thank you for the free content.', 'Run it back. Or do not. Both end the same way, apparently.',
];
export const wipeJoke = (n) => pick(spicy() ? [...WIPE_MILD, ...WIPE_SPICY, ...WIPE_SPICY] : WIPE_MILD).replace('{n}', n);

// ---------------- loading tips ----------------
const TIPS_SPICY = [
  'Tip: Being bad is a choice. Choose differently.', 'Tip: The floor is not your friend. Neither am I.',
  'Tip: Your teammates can see your K/D. They are being polite.', 'Tip: Sliding into enemies does not make you cool. It makes you dead, faster.',
  'Tip: "One more try," said this fireteam, four hours ago.', 'Tip: The Doges are not cute. They are a pack. Act accordingly.',
  'Tip: If you died to the Approach, the Ghost has told everyone.', 'Tip: Reloading after every shot is not a strategy. It is a personality.',
  'Tip: Aim for the head. You know, the thing you are not using.', 'Tip: Nobody reads loading tips. Except you. Nerd.',
];
export const extraTips = () => (spicy() ? TIPS_SPICY : []);

// ---------------- the killfeed: enemies go out worse ----------------
const LINES = {
  Doge: ['got sent to live on a farm', 'was, in hindsight, not a good boy'],
  Stonks: ['got rugged', 'is now a cautionary tale on Reddit', 'should have bought the dip, not been it'],
  Nyan: ['got yeeted into low orbit', 'rainbowed its last rainbow'],
  Algorithm: ['got shadowbanned', 'was demonetized', 'got community-noted'],
  SusSniper: ['got voted out (it was not even them)', 'emergency-meetinged itself'],
  MoaiKnight: ['got turned into gravel', 'got its jawline checked. It failed.'],
  Wizard: ['got sent back to the moon. Economy class.'],
  Sigma: ['got caught not mewing', 'fell off', 'was all aura, no substance'],
  Boyfriend: ['got left on read', 'got caught in 4K'],
  Troll: ['got ratioed', 'rage quit', 'got touched by grass'],
  RickRoller: ['got rickrolled itself', 'was given up'],
};
export const deathLines = (e) => (spicy() && LINES[e.constructor.name] ? LINES[e.constructor.name] : []);
