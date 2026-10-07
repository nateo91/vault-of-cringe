// Raid clear-time leaderboard, stored in this browser. Co-op clears are saved for everyone in the fireteam.
const KEY = 'voc-leaderboard-v1';
const MAX = 25;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CLASS_ICON = { hunter: '🔺', titan: '🛡️', warlock: '📖' };

export function formatTime(sec, tenths = true) {
  if (!isFinite(sec)) return '--:--';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function loadBoard() {
  try { const b = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(b) ? b : []; } catch (e) { return []; }
}
function save(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) { /* storage full or blocked */ } }
export function clearBoard() { save([]); }

// Add a clear. Returns { rank (1-based, or null if it didn't make the board), pb, prevBest, board }
export function recordRun(run) {
  const board = loadBoard();
  // the same co-op clear can arrive twice (e.g. host + relay); don't double-count it
  if (run.id && board.some((r) => r.id === run.id)) return { rank: null, pb: false, board };
  const prevBest = board.length ? Math.min(...board.map((r) => r.time)) : Infinity;
  board.push(run);
  board.sort((a, b) => a.time - b.time);
  const trimmed = board.slice(0, MAX);
  save(trimmed);
  const idx = trimmed.indexOf(run);
  return { rank: idx >= 0 ? idx + 1 : null, pb: run.time < prevBest, prevBest, board: trimmed };
}

// Best time for each segment across every saved clear (the "sum of best" a speedrunner would chase)
export function bestSplits(board = loadBoard()) {
  const best = {};
  for (const r of board) {
    let prev = 0;
    for (const s of r.splits || []) { const seg = s.t - prev; prev = s.t; if (!(s.name in best) || seg < best[s.name]) best[s.name] = seg; }
  }
  return best;
}

export function shareText(run) {
  const team = run.team.map((m) => m.name).join(', ');
  const segs = segments(run).map((s) => `${s.name.toLowerCase()} ${formatTime(s.seg, false)}`).join(' · ');
  return `🏆 VAULT OF CRINGE cleared in ${formatTime(run.time)}\n👥 ${team}${run.wipes ? `\n💀 ${run.wipes} wipe${run.wipes > 1 ? 's' : ''}` : ' · flawless'}\n⏱ ${segs}`;
}
function segments(run) {
  let prev = 0;
  return (run.splits || []).map((s) => { const seg = s.t - prev; prev = s.t; return { name: s.name, seg }; });
}

export function renderBoard(el) {
  const board = loadBoard();
  const best = bestSplits(board);
  const rows = board.map((r, i) => `<tr class="${i === 0 ? 'top' : ''}">
      <td class="rk">${i === 0 ? '👑' : i + 1}</td>
      <td class="tm">${formatTime(r.time)}</td>
      <td class="team">${r.team.map((m) => `<span title="${esc(m.cls || '')}">${CLASS_ICON[m.cls] || '◆'} ${esc(m.name)}</span>`).join('')}</td>
      <td>${r.wipes || 0}</td>
      <td>${r.kills ?? '-'}</td>
      <td class="dt">${new Date(r.date).toLocaleDateString()}</td>
    </tr>`).join('');
  const sum = Object.values(best).reduce((a, b) => a + b, 0);
  el.querySelector('.lb-table').innerHTML = board.length ? `<table>
      <thead><tr><th>#</th><th>TIME</th><th>FIRETEAM</th><th>WIPES</th><th>KILLS</th><th>DATE</th></tr></thead>
      <tbody>${rows}</tbody></table>`
    : '<div class="lb-empty">No clears yet. Start a run from <b>The Approach</b> and flush Skibidi to get on the board.</div>';
  el.querySelector('.lb-splits').innerHTML = board.length ? `<div class="lb-sub">BEST SEGMENTS</div>${Object.entries(best).map(([n, t]) => `<div class="seg"><span>${esc(n)}</span><b>${formatTime(t)}</b></div>`).join('')}<div class="seg sob"><span>SUM OF BEST</span><b>${formatTime(sum)}</b></div>` : '';
}
