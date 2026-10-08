// The build stamp. Bump BUILD with every push: the menu shows it, running games notice a newer one, and co-op
// warns when a fireteam is on different builds.
export const BUILD = '2026.10.08.7';

// what's on the server right now (no-cache, so it's the real latest)
export async function latestBuild() {
  try {
    const t = await (await fetch('src/version.js?v=' + Date.now(), { cache: 'no-store' })).text();
    return t.match(/BUILD = '([^']+)'/)?.[1] || null;
  } catch (e) { return null; }
}

// check now and then; call onNew(build) once when a newer one appears
export function watchForUpdates(onNew, everyMs = 5 * 60 * 1000) {
  let told = false;
  const check = async () => { if (told) return; const b = await latestBuild(); if (b && b !== BUILD) { told = true; onNew(b); } };
  setTimeout(check, 15000);
  setInterval(check, everyMs);
}
