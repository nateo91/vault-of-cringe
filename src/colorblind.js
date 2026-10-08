// Colourblind modes. Rather than filter the whole image (a daltonize pass measured *worse* for the signals
// that matter here), each mode recolours the handful of gameplay signals that would otherwise be hard to see:
// the on-target reticle, the damage-direction arcs and enemy grenade warning rings. For protanopia and
// deuteranopia, red on a dark floor nearly vanishes, so those signals turn yellow (the strongest contrast on
// every background we use). Red already reads well with tritanopia, so that mode keeps it.
import { G } from './game.js';

const PALETTES = {
  off: { warn: 0xff2a1a },
  protan: { warn: 0xffe600 },
  deutan: { warn: 0xffe600 },
  tritan: { warn: 0xff2a1a },
};

export function applyColorblind(kind = 'off') {
  if (!PALETTES[kind]) kind = 'off';
  G.signals = PALETTES[kind];
  document.documentElement.dataset.cvd = kind; // the CSS side (reticle, arcs)
}
