/* ============================================================
   2) GAME STATE
   Everything the board depends on lives in one object so
   switching between Daily and Infinite mode is just swapping
   this out and re-rendering, instead of juggling loose globals.
   ============================================================ */
let game = {
  mode: 'daily',       // 'daily' | 'infinite'
  answer: DAILY_ANSWER,
  guessedIds: new Set(),
  solved: false
};

const input = document.getElementById('inputBar');
const suggestionsBox = document.getElementById('suggestions');
let activeIndex = -1;
let currentMatches = [];

/* ============================================================
   3) AUTOCOMPLETE
   Dropdown position is computed from the input's real on-screen
   location (getBoundingClientRect) and applied as position:fixed,
   rather than relying on position:absolute + a positioned
   ancestor. Fixes it rendering in the wrong place in some
   preview/iframe contexts.
   ============================================================ */
function positionSuggestions() {
  const rect = input.getBoundingClientRect();
  suggestionsBox.style.position = 'fixed';
  suggestionsBox.style.top = (rect.bottom + 6) + 'px';
  suggestionsBox.style.left = rect.left + 'px';
  suggestionsBox.style.width = rect.width + 'px';
}
window.addEventListener('resize', () => { if (suggestionsBox.style.display === 'block') positionSuggestions(); });
window.addEventListener('scroll', () => { if (suggestionsBox.style.display === 'block') positionSuggestions(); }, true);

input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  activeIndex = -1;
  if (!q) { suggestionsBox.style.display = 'none'; return; }
  currentMatches = jokes
    .filter(j => !game.guessedIds.has(j.id))
    .filter(j => j.name.toLowerCase().includes(q))
    .slice(0, 8);
  renderSuggestions(q);
});

function renderSuggestions(q) {
  if (currentMatches.length === 0) { suggestionsBox.style.display = 'none'; return; }
  suggestionsBox.innerHTML = currentMatches.map((j) => {
    const idx = j.name.toLowerCase().indexOf(q);
    const highlighted = idx >= 0
      ? j.name.slice(0, idx) + '<mark>' + j.name.slice(idx, idx + q.length) + '</mark>' + j.name.slice(idx + q.length)
      : j.name;
    const thumb = j.image ? `<img src="${j.image}" class="thumb-sm" alt="${j.name}" onerror="this.remove()">` : '';
    return `<div class="suggestion" data-id="${j.id}">${thumb}<span>${highlighted}</span></div>`;
  }).join('');
  positionSuggestions();
  suggestionsBox.style.display = 'block';
}

suggestionsBox.addEventListener('click', (e) => {
  const thumb = e.target.closest('.thumb-sm');
  if (thumb) { e.stopPropagation(); openLightbox(thumb.src, thumb.alt); return; }
  const row = e.target.closest('.suggestion');
  if (row) submitGuess(row.dataset.id);
});

input.addEventListener('keydown', (e) => {
  const rows = [...suggestionsBox.querySelectorAll('.suggestion')];
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, rows.length - 1); updateActive(rows); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); updateActive(rows); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0 && rows[activeIndex]) submitGuess(rows[activeIndex].dataset.id);
    else if (currentMatches.length === 1) submitGuess(currentMatches[0].id);
  } else if (e.key === 'Escape') { suggestionsBox.style.display = 'none'; }
});

function updateActive(rows) {
  rows.forEach(r => r.classList.remove('active'));
  if (rows[activeIndex]) { rows[activeIndex].classList.add('active'); rows[activeIndex].scrollIntoView({ block: 'nearest' }); }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search') && !e.target.closest('#suggestions')) suggestionsBox.style.display = 'none';
});

/* ============================================================
   4) COMPARISON LOGIC (unchanged from before)
   ============================================================ */
function compareCategory(guessVal, answerVal) {
  return guessVal.trim().toLowerCase() === answerVal.trim().toLowerCase() ? 'correct' : 'wrong';
}

const ERA_ORDER = ["2020-2022", "2023-2024", "2025-present"];
function compareEra(guessVal, answerVal) {
  if (guessVal === answerVal) return { cls: 'correct', arrow: '' };
  const gi = ERA_ORDER.indexOf(guessVal);
  const ai = ERA_ORDER.indexOf(answerVal);
  const dist = Math.abs(gi - ai);
  const arrow = gi < ai ? '▲' : '▼';
  return dist === 1 ? { cls: 'close', arrow } : { cls: 'wrong', arrow };
}

const STATUS_INFO = {
  "inanimate":          { state: "inanimate", real: true },
  "alive":              { state: "alive",     real: true },
  "dead":               { state: "dead",      real: true },
  "in limbo":           { state: "limbo",     real: true },
  "alive (fictitious)": { state: "alive",     real: false },
  "dead (fictitious)":  { state: "dead",      real: false }
};
function compareStatus(guessVal, answerVal) {
  if (guessVal === answerVal) return 'correct';
  const g = STATUS_INFO[guessVal];
  const a = STATUS_INFO[answerVal];
  if (!g || !a) return 'wrong';
  return (g.state === a.state || g.real === a.real) ? 'close' : 'wrong';
}

const COLOR_WHEEL = ["red", "orange", "yellow", "green", "blue", "purple", "pink"];
function compareColor(guessVal, answerVal) {
  if (guessVal === answerVal) return 'correct';
  const gi = COLOR_WHEEL.indexOf(guessVal);
  const ai = COLOR_WHEEL.indexOf(answerVal);
  if (gi === -1 || ai === -1) return 'wrong';
  const dist = Math.min(Math.abs(gi - ai), COLOR_WHEEL.length - Math.abs(gi - ai));
  return dist === 1 ? 'close' : 'wrong';
}

function compareRating(guessVal, answerVal) {
  if (guessVal === answerVal) return { cls: 'correct', arrow: '' };
  const arrow = guessVal < answerVal ? '▲' : '▼';
  const isOutlier = v => Math.abs(v) > 5;
  const gOut = isOutlier(guessVal);
  const aOut = isOutlier(answerVal);
  if (!gOut && !aOut) return { cls: Math.abs(guessVal - answerVal) <= 1 ? 'close' : 'wrong', arrow };
  if (gOut && aOut && Math.sign(guessVal) === Math.sign(answerVal)) return { cls: 'close', arrow };
  return { cls: 'wrong', arrow };
}

function evaluateGuess(guess) {
  return {
    category: compareCategory(guess.category, game.answer.category),
    era: compareEra(guess.era, game.answer.era),
    status: compareStatus(guess.status, game.answer.status),
    color: compareColor(guess.color, game.answer.color),
    rating: compareRating(guess.rating, game.answer.rating)
  };
}

/* ============================================================
   5) GUESSING + BOARD RENDERING
   ============================================================ */
function submitGuess(id) {
  if (game.solved) return;
  const guess = jokes.find(j => j.id === id);
  if (!guess || game.guessedIds.has(id)) return;
  game.guessedIds.add(id);
  input.value = '';
  suggestionsBox.style.display = 'none';

  addRow(guess, evaluateGuess(guess));
  if (game.mode === 'daily') saveTodayProgress();

  if (guess.id === game.answer.id) { game.solved = true; endGame(); }
}

function addRow(guess, r) {
  const tbody = document.getElementById('boardBody');
  const tr = document.createElement('tr');
  const thumb = guess.image ? `<img src="${guess.image}" class="thumb" alt="${guess.name}" onerror="this.remove()">` : '';
  tr.innerHTML = `
    <td class="name-cell">${thumb}<span>${guess.name}</span></td>
    <td><div class="cell ${r.category}">${guess.category}</div></td>
    <td><div class="cell ${r.era.cls}">${guess.era} <span class="arrow">${r.era.arrow}</span></div></td>
    <td><div class="cell ${r.status}">${guess.status}</div></td>
    <td><div class="cell ${r.color}">${guess.color}</div></td>
    <td><div class="cell ${r.rating.cls}">${guess.rating}/5 <span class="arrow">${r.rating.arrow}</span></div></td>
  `;
  tbody.prepend(tr);
  updateCount();
}

function clearBoard() {
  document.getElementById('boardBody').innerHTML = '';
  const status = document.getElementById('status');
  status.textContent = '';
  status.classList.remove('win');
  input.disabled = false;
  updateCount();
}

function updateCount() {
  document.getElementById('guessCount').textContent =
    `${game.guessedIds.size} guess${game.guessedIds.size === 1 ? '' : 'es'}`;
}

function endGame() {
  const status = document.getElementById('status');
  input.disabled = true;
  status.textContent = `🎉 Got it — "${game.answer.name}" — in ${game.guessedIds.size} guess${game.guessedIds.size === 1 ? '' : 'es'}!`;
  status.classList.add('win');
  if (game.mode === 'daily') {
    recordWin(game.guessedIds.size);
  } else {
    document.getElementById('newGameBtn').style.display = 'inline-block';
  }
}

/* ============================================================
   6) MODE SWITCHING — Daily vs Infinite
   Infinite mode never touches saveTodayProgress/recordWin, so
   practice games can never affect the daily puzzle or the streak.
   ============================================================ */
function startInfiniteGame(freshRandom = true) {
  game = {
    mode: 'infinite',
    answer: freshRandom ? pickRandomAnswer(game.answer && game.answer.id) : game.answer,
    guessedIds: new Set(),
    solved: false
  };
  clearBoard();
  updateModeUI();
}

function startDailyGame() {
  game = { mode: 'daily', answer: DAILY_ANSWER, guessedIds: new Set(), solved: false };
  clearBoard();
  updateModeUI();
  loadTodayProgress();
}

function updateModeUI() {
  const banner = document.getElementById('modeBanner');
  const newGameBtn = document.getElementById('newGameBtn');
  const toggleBtn = document.getElementById('modeToggleBtn');
  if (game.mode === 'infinite') {
    banner.textContent = 'Infinite Mode does NOT count toward your streak.';
    banner.style.display = 'block';
    newGameBtn.style.display = game.solved ? 'inline-block' : 'none';
    toggleBtn.textContent = 'Back to Daily';
  } else {
    banner.style.display = 'none';
    newGameBtn.style.display = 'none';
    toggleBtn.textContent = 'Infinite Mode';
  }
}

document.getElementById('modeToggleBtn').addEventListener('click', () => {
  if (game.mode === 'daily') startInfiniteGame(true);
  else startDailyGame();
});
document.getElementById('newGameBtn').addEventListener('click', () => startInfiniteGame(true));

/* ============================================================
   7) PERSISTENCE — today's daily progress + stats/streak
   (Infinite mode intentionally never calls these.)
   ============================================================ */
// Storage adapter: tries window.storage first (only exists inside Claude.ai's
// artifact viewer), falls back to localStorage (works once this is hosted as
// a real site, e.g. GitHub Pages), falls back to an in-memory Map as a last
// resort so the game never throws even if both are unavailable.
const memoryStore = new Map();
function hasWindowStorage() { return typeof window.storage !== 'undefined' && window.storage !== null; }
function hasLocalStorage() {
  try {
    const testKey = '__jokedle_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) { return false; }
}
const STORAGE_MODE = hasWindowStorage() ? 'artifact' : (hasLocalStorage() ? 'local' : 'memory');
const LOCAL_PREFIX = 'jokedle:';

async function storageGet(key) {
  if (STORAGE_MODE === 'artifact') {
    try { return await window.storage.get(key, false); } catch (e) { return null; }
  }
  if (STORAGE_MODE === 'local') {
    const v = localStorage.getItem(LOCAL_PREFIX + key);
    return v === null ? null : { key, value: v, shared: false };
  }
  const v = memoryStore.get(key);
  return v === undefined ? null : { key, value: v, shared: false };
}

async function storageSet(key, value) {
  if (STORAGE_MODE === 'artifact') {
    try { return await window.storage.set(key, value, false); } catch (e) { return null; }
  }
  if (STORAGE_MODE === 'local') {
    localStorage.setItem(LOCAL_PREFIX + key, value);
    return { key, value, shared: false };
  }
  memoryStore.set(key, value);
  return { key, value, shared: false };
}

async function saveTodayProgress() {
  try {
    await storageSet(`progress:${TODAY}`, JSON.stringify({ guessedIds: [...game.guessedIds], solved: game.solved }));
  } catch (e) { console.error('Could not save progress', e); }
}

async function loadTodayProgress() {
  try {
    const result = await storageGet(`progress:${TODAY}`);
    if (!result) return;
    const data = JSON.parse(result.value);
    for (const id of data.guessedIds) {
      const guess = jokes.find(j => j.id === id);
      if (!guess) continue;
      game.guessedIds.add(id);
      addRow(guess, evaluateGuess(guess));
    }
    if (data.solved) {
      game.solved = true;
      const status = document.getElementById('status');
      input.disabled = true;
      status.textContent = `🎉 Got it — "${game.answer.name}" — in ${game.guessedIds.size} guess${game.guessedIds.size === 1 ? '' : 'es'}!`;
      status.classList.add('win');
    }
  } catch (e) { /* no saved progress yet for today - that's fine */ }
}

const DEFAULT_STATS = { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0, lastWinDate: null, distribution: {} };

async function loadStats() {
  try {
    const result = await storageGet('stats');
    if (!result) return { ...DEFAULT_STATS };
    return { ...DEFAULT_STATS, ...JSON.parse(result.value) };
  } catch (e) { return { ...DEFAULT_STATS }; }
}

async function saveStats(stats) {
  try { await storageSet('stats', JSON.stringify(stats)); }
  catch (e) { console.error('Could not save stats', e); }
}

function isYesterday(dateStr, todayStr) {
  return Math.round((new Date(todayStr) - new Date(dateStr)) / 86400000) === 1;
}

async function recordWin(guessCount) {
  const stats = await loadStats();
  if (stats.lastWinDate === TODAY) { await renderStats(stats); return; }

  stats.gamesPlayed += 1;
  stats.gamesWon += 1;
  stats.distribution[guessCount] = (stats.distribution[guessCount] || 0) + 1;
  stats.currentStreak = (stats.lastWinDate && isYesterday(stats.lastWinDate, TODAY)) ? stats.currentStreak + 1 : 1;
  stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  stats.lastWinDate = TODAY;

  await saveStats(stats);
  await renderStats(stats);
}

async function renderStats(stats) {
  const body = document.getElementById('statsBody');
  const winPct = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  const maxDistVal = Math.max(1, ...Object.values(stats.distribution));
  const distRows = Object.keys(stats.distribution)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => {
      const count = stats.distribution[k];
      const widthPct = Math.max(10, Math.round((count / maxDistVal) * 100));
      return `<div class="distRow"><div class="distLabel">${k}</div><div class="distBarWrap"><div class="distBar" style="width:${widthPct}%">${count}</div></div></div>`;
    }).join('') || '<div class="statsLoading">No wins yet — go guess something!</div>';

  const storageNote = STORAGE_MODE === 'memory' ? `
    <div class="statsLoading" style="margin-bottom:16px;">
      ⚠️ Progress isn't being saved right now — your browser is blocking local
      storage (e.g. private/incognito mode), so this will reset on reload.
    </div>` : '';

  body.innerHTML = `
    ${storageNote}
    <div class="statGrid">
      <div class="statBox"><div class="statNum">${stats.gamesPlayed}</div><div class="statLabel">Played</div></div>
      <div class="statBox"><div class="statNum">${winPct}%</div><div class="statLabel">Win rate</div></div>
      <div class="statBox"><div class="statNum">${stats.currentStreak}</div><div class="statLabel">Streak</div></div>
    </div>
    <div class="statGrid" style="grid-template-columns:1fr;">
      <div class="statBox"><div class="statNum">${stats.maxStreak}</div><div class="statLabel">Max streak</div></div>
    </div>
    <div class="distTitle">Guess distribution (daily only)</div>
    ${distRows}
  `;
}

document.getElementById('boardBody').addEventListener('click', (e) => {
  const thumb = e.target.closest('.thumb');
  if (thumb) openLightbox(thumb.src, thumb.alt);
});

const lightboxOverlay = document.getElementById('lightboxOverlay');
const lightboxImg = document.getElementById('lightboxImg');
function openLightbox(src, alt) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightboxOverlay.classList.add('open');
}
document.getElementById('closeLightbox').addEventListener('click', () => lightboxOverlay.classList.remove('open'));
lightboxOverlay.addEventListener('click', (e) => { if (e.target === lightboxOverlay) lightboxOverlay.classList.remove('open'); });

const statsBtn = document.getElementById('statsBtn');
const statsOverlay = document.getElementById('statsOverlay');
document.getElementById('closeStats').addEventListener('click', () => statsOverlay.classList.remove('open'));
statsOverlay.addEventListener('click', (e) => { if (e.target === statsOverlay) statsOverlay.classList.remove('open'); });
statsBtn.addEventListener('click', async () => {
  statsOverlay.classList.add('open');
  renderStats(await loadStats());
});

const infoBtn = document.getElementById('infoBtn');
const infoOverlay = document.getElementById('infoOverlay');
document.getElementById('closeInfo').addEventListener('click', () => infoOverlay.classList.remove('open'));
infoOverlay.addEventListener('click', (e) => { if (e.target === infoOverlay) infoOverlay.classList.remove('open'); });
infoBtn.addEventListener('click', async () => {
  infoOverlay.classList.add('open');
});

/* ============================================================
   8) DATABASE SIDEBAR — scrollable list of every entry (name +
   image only, no other hints). Reuses the lightbox from the
   guess board.
   ============================================================ */
function renderDatabase() {
  const dbList = document.getElementById('dbList');
  if (!dbList) return;
  dbList.innerHTML = jokes.map(j => {
    const thumb = j.image ? `<img src="${j.image}" alt="${j.name}" onerror="this.remove()">` : '';
    return `<div class="dbEntry" data-id="${j.id}">${thumb}<span>${j.name}</span></div>`;
  }).join('');
}

document.getElementById('dbList')?.addEventListener('click', (e) => {
  const img = e.target.closest('img');
  if (img) openLightbox(img.src, img.alt);
});

renderDatabase();

/* ============================================================
   9) PLAYLIST SIDEBAR — plays songs from the "music" folder
   using song info from songs.js. Supports play/pause/skip/back.
   ============================================================ */
let currentTrackIndex = 0;
let isPlaying = false;

const audioPlayer = document.getElementById('audioPlayer');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevTrackBtn = document.getElementById('prevBtn');
const nextTrackBtn = document.getElementById('nextBtn');
const npCover = document.getElementById('npCover');
const npTitle = document.getElementById('npTitle');
const npArtist = document.getElementById('npArtist');
const playlistListEl = document.getElementById('playlistList');

function renderPlaylist() {
  if (!playlistListEl) return;
  playlistListEl.innerHTML = songs.map((s, i) => {
    const cover = s.cover ? `<img src="${s.cover}" alt="${s.title}" onerror="this.remove()">` : '';
    return `
      <div class="playlistItem${i === currentTrackIndex ? ' playing' : ''}" data-index="${i}">
        ${cover}
        <div class="plMeta">
          <div class="plTitle">${s.title}</div>
          <div class="plArtist">${s.artist}</div>
        </div>
      </div>`;
  }).join('');
}

function updatePlayPauseIcon() {
  if (playPauseBtn) playPauseBtn.textContent = isPlaying ? '⏸' : '▶';
}

function loadTrack(index, autoplay = false) {
  if (!songs.length || !audioPlayer) return;
  currentTrackIndex = ((index % songs.length) + songs.length) % songs.length;
  const track = songs[currentTrackIndex];

  audioPlayer.src = track.file;
  if (npTitle) npTitle.textContent = track.title;
  if (npArtist) npArtist.textContent = track.artist || '';
  if (npCover) {
    if (track.cover) { npCover.src = track.cover; npCover.style.display = 'block'; }
    else { npCover.removeAttribute('src'); npCover.style.display = 'none'; }
  }
  renderPlaylist();

  if (autoplay) {
    audioPlayer.play().then(() => { isPlaying = true; updatePlayPauseIcon(); }).catch(() => {});
  } else {
    updatePlayPauseIcon();
  }
}

function togglePlayPause() {
  if (!songs.length || !audioPlayer) return;
  if (!audioPlayer.src) { loadTrack(currentTrackIndex, true); return; }
  if (isPlaying) audioPlayer.pause();
  else audioPlayer.play().catch(() => {});
}

function playNext() { loadTrack(currentTrackIndex + 1, true); }
function playPrev() { loadTrack(currentTrackIndex - 1, true); }

playPauseBtn?.addEventListener('click', togglePlayPause);
nextTrackBtn?.addEventListener('click', playNext);
prevTrackBtn?.addEventListener('click', playPrev);

audioPlayer?.addEventListener('ended', playNext);
audioPlayer?.addEventListener('play', () => { isPlaying = true; updatePlayPauseIcon(); });
audioPlayer?.addEventListener('pause', () => { isPlaying = false; updatePlayPauseIcon(); });

playlistListEl?.addEventListener('click', (e) => {
  const item = e.target.closest('.playlistItem');
  if (!item) return;
  loadTrack(Number(item.dataset.index), true);
});

renderPlaylist();
if (songs.length) loadTrack(0, false);

// boot
loadTodayProgress();