/* ═══════════════════════════════════════════════
   JADE PAVILION · app.js
   API: WLNUpdates.com  (wlnupdates.com/api)
   CORS proxy: corsproxy.io (free, no key needed)
   ═══════════════════════════════════════════════ */

'use strict';

/* ─── API CONFIG ─────────────────────────────── */
const WLN_API    = 'https://www.wlnupdates.com/api';
// corsproxy.io tunnels cross-origin POST requests from the browser
const CORS_PROXY = 'https://corsproxy.io/?url=';

const PAGE_SIZE = 20;

/* ─── GENRE → WLNUpdates genre-id mapping ─────
   These match the genre names in the WLNUpdates DB.
   An empty string means "no genre filter".           */
const GENRE_MAP = {
  '':            null,
  'wuxia':       'wuxia',
  'xianxia':     'xianxia',
  'xuanhuan':    'xuanhuan',
  'romance':     'romance',
  'historical':  'historical',
  'comedy':      'comedy',
  'mystery':     'mystery',
  'school-life': 'school-life',
  'action':      'action',
  'drama':       'drama',
};

/* ─── State ──────────────────────────────────── */
const state = {
  query:   '',
  tag:     '',
  sort:    'update',
  page:    0,
  total:   0,
  results: [],
  loading: false,
};

/* ─── DOM Refs ───────────────────────────────── */
const $ = id => document.getElementById(id);
const DOM = {
  search:   $('searchInput'),
  searchBtn:$('searchBtn'),
  sort:     $('sortSelect'),
  chips:    $('chipsEl'),
  status:   $('statusBar'),
  grid:     $('resultsGrid'),
  pages:    $('pagination'),
  overlay:  $('modalOverlay'),
  mClose:   $('modalClose'),
  mInner:   $('modalInner'),
  lanterns: $('lanternRow'),
  canvas:   $('petalCanvas'),
};

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
function init() {
  buildLanterns();
  initPetals();
  bindEvents();
  fetchNovels(); // initial load
}

/* ─── Lanterns ───────────────────────────────── */
function buildLanterns() {
  const n = Math.max(5, Math.floor(window.innerWidth / 125));
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'lantern';
    el.textContent = '🏮';
    el.style.animationDelay = (i * 0.28) + 's';
    DOM.lanterns.appendChild(el);
  }
}

/* ─── Canvas petal animation ─────────────────── */
function initPetals() {
  const cvs = DOM.canvas;
  const ctx = cvs.getContext('2d');
  const petals = [];
  const CHARS  = ['🌸','🌺','🌷','✿','❀','🍃'];

  function resize() {
    cvs.width  = window.innerWidth;
    cvs.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  for (let i = 0; i < 28; i++) {
    petals.push({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight - window.innerHeight,
      size:  10 + Math.random() * 14,
      speed: 0.6 + Math.random() * 1.1,
      drift: (Math.random() - .5) * .6,
      rot:   Math.random() * 360,
      rotS:  (Math.random() - .5) * 1.5,
      alpha: 0.25 + Math.random() * 0.4,
      char:  CHARS[Math.floor(Math.random() * CHARS.length)],
    });
  }

  function draw() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    petals.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.font = `${p.size}px serif`;
      ctx.fillText(p.char, 0, 0);
      ctx.restore();

      p.y   += p.speed;
      p.x   += p.drift;
      p.rot += p.rotS;

      if (p.y > cvs.height + 40) {
        p.y = -40;
        p.x = Math.random() * cvs.width;
      }
    });
    requestAnimationFrame(draw);
  }
  draw();
}

/* ═══════════════════════════════════════════════
   EVENT BINDING
   ═══════════════════════════════════════════════ */
function bindEvents() {
  DOM.searchBtn.addEventListener('click', triggerSearch);
  DOM.search.addEventListener('keydown', e => { if (e.key === 'Enter') triggerSearch(); });

  DOM.sort.addEventListener('change', () => {
    state.sort = DOM.sort.value;
    state.page = 0;
    fetchNovels();
  });

  DOM.chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.tag  = chip.dataset.tag;
    state.page = 0;
    fetchNovels();
  });

  DOM.mClose.addEventListener('click', closeModal);
  DOM.overlay.addEventListener('click', e => {
    if (e.target === DOM.overlay) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

function triggerSearch() {
  const q = DOM.search.value.trim();
  if (state.loading) return;
  // Clear chip selection when typing custom search
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.chip[data-tag=""]').classList.add('active');
  state.tag   = '';
  state.query = q;
  state.page  = 0;
  fetchNovels();
}

/* ═══════════════════════════════════════════════
   API CALLS  (WLNUpdates POST /api)
   ═══════════════════════════════════════════════ */

/**
 * Build the WLNUpdates API payload.
 * Uses "search-title" when there's a text query,
 * "search-advanced" when filtering by genre/tag.
 */
function buildPayload() {
  if (state.query) {
    // Title search: returns series IDs with match scores
    return { mode: 'search-title', title: state.query };
  }

  // Advanced search with optional genre tag
  const payload = {
    mode:       'search-advanced',
    'series-type': { Translated: 'included' },
    'sort-mode':   state.sort,
    offset:        state.page * PAGE_SIZE,
  };

  const genreKey = GENRE_MAP[state.tag];
  if (genreKey) {
    payload['genre-category'] = { [genreKey]: 'included' };
  }

  return payload;
}

async function fetchNovels() {
  if (state.loading) return;
  state.loading = true;

  renderLoader();
  DOM.pages.innerHTML   = '';
  DOM.status.textContent = '';

  try {
    const payload = buildPayload();
    const apiUrl  = encodeURIComponent(WLN_API);
    const res = await fetch(`${CORS_PROXY}${apiUrl}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.error) throw new Error(json.message || 'API error');

    await processResponse(json, payload.mode);

  } catch (err) {
    console.error('WLNUpdates fetch error:', err);
    renderError(err.message);
  } finally {
    state.loading = false;
  }
}

/**
 * Process the raw API response based on mode.
 * - search-title  → array of {match, sid} objects
 * - search-advanced → paginated series list
 */
async function processResponse(json, mode) {
  let novels = [];

  if (mode === 'search-title') {
    // json.data is an array of { match: [[score, name], ...], sid: number }
    const hits = json.data || [];
    if (hits.length === 0) { renderEmpty(); return; }

    // Fetch full series data for top results (limit to 20)
    const top = hits.slice(0, PAGE_SIZE);
    novels = await Promise.all(
      top.map(hit => fetchSeriesById(hit.sid))
    );
    novels = novels.filter(Boolean);
    state.total = hits.length;

  } else {
    // search-advanced returns data as array of series objects
    const raw = json.data;
    if (!raw || raw.length === 0) { renderEmpty(); return; }
    novels = raw;
    // WLNUpdates doesn't always return total count; estimate
    state.total = raw.length >= PAGE_SIZE
      ? (state.page + 2) * PAGE_SIZE
      : state.page * PAGE_SIZE + raw.length;
  }

  state.results = novels;

  const shown = novels.length;
  const from  = state.page * PAGE_SIZE + 1;
  DOM.status.textContent =
    `🏮 Showing ${from}–${from + shown - 1} novels` +
    (state.query ? ` for "${state.query}"` : state.tag ? ` · ${state.tag}` : '');

  renderCards(novels);
  renderPagination();
}

/** Fetch a single series by its WLNUpdates series ID */
async function fetchSeriesById(sid) {
  try {
    const apiUrl = encodeURIComponent(WLN_API);
    const res = await fetch(`${CORS_PROXY}${apiUrl}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode: 'get-series-id', id: sid }),
    });
    const json = await res.json();
    return json.error ? null : json.data;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════
   RENDER — CARDS
   ═══════════════════════════════════════════════ */
function renderCards(novels) {
  DOM.grid.innerHTML = '';
  novels.forEach((novel, i) => {
    const card = buildCard(novel, i);
    DOM.grid.appendChild(card);
  });
}

function buildCard(novel, idx) {
  const title    = novel.title   || 'Unknown Title';
  const origName = getOriginalName(novel);
  const author   = getAuthor(novel);
  const cover    = getCover(novel);
  const rating   = novel.rating  ? parseFloat(novel.rating).toFixed(1) : null;
  const chapters = novel.chapter_count || novel.chapters || null;
  const genres   = getGenres(novel).slice(0, 2);
  const updated  = novel.latest_published ? formatDate(novel.latest_published) : null;
  const sid      = novel.id || novel.sid;
  const wlnUrl   = sid ? `https://www.wlnupdates.com/series-id/${sid}/` : '#';
  const isNew    = updated && isRecent(novel.latest_published);

  const card = document.createElement('div');
  card.className = 'card';
  card.style.animationDelay = `${idx * 0.055}s`;

  card.innerHTML = `
    <div class="card-cover">
      ${cover
        ? `<img src="${esc(cover)}" alt="${esc(title)}" loading="lazy"
               onerror="this.parentElement.innerHTML=buildPlaceholderHTML('${esc(title)}')" />`
        : buildPlaceholderHTML(title)
      }
      ${isNew  ? '<span class="badge">✦ New</span>' : ''}
      ${rating ? `<span class="badge-rating">⭐ ${rating}</span>` : ''}
      ${chapters ? `<span class="badge-chapters">📖 ${fmtCount(chapters)} ch</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${esc(title)}</div>
      ${origName ? `<div class="card-author" title="Original title">${esc(origName)}</div>` : ''}
      <div class="card-author">✦ ${esc(author)}</div>
      ${genres.length
        ? `<div class="card-genres">${genres.map(g => `<span class="card-genre-tag">${esc(g)}</span>`).join('')}</div>`
        : ''}
      ${updated ? `<div class="card-updated">Updated ${esc(updated)}</div>` : ''}
      <a class="card-btn" href="${wlnUrl}" target="_blank" rel="noopener"
         onclick="event.stopPropagation()">View on WLNUpdates</a>
    </div>
  `;

  card.addEventListener('click', () => openModal(novel));
  return card;
}

/* Exposed globally for inline onerror */
window.buildPlaceholderHTML = function(title) {
  return `<div class="cover-placeholder">
    <span class="ph-icon">📚</span>
    <span class="ph-title">${esc(title || '')}</span>
  </div>`;
};

/* ═══════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════ */
function openModal(novel) {
  const title    = novel.title   || 'Unknown Title';
  const origName = getOriginalName(novel);
  const author   = getAuthor(novel);
  const cover    = getCover(novel);
  const desc     = novel.description || novel.desc || 'No description available.';
  const rating   = novel.rating      ? `⭐ ${parseFloat(novel.rating).toFixed(1)} / 5` : '';
  const chapters = novel.chapter_count || novel.chapters || '';
  const genres   = getGenres(novel);
  const tags     = getTags(novel).slice(0, 8);
  const sid      = novel.id || novel.sid;
  const wlnUrl   = sid ? `https://www.wlnupdates.com/series-id/${sid}/` : '#';
  const status   = novel.type || novel.status || '';

  DOM.mInner.innerHTML = `
    <div class="m-cover-wrap">
      ${cover
        ? `<img class="m-cover-img" src="${esc(cover)}" alt="${esc(title)}"
               onerror="this.outerHTML='<div class=\\'m-cover-ph\\'>📚</div>'" />`
        : '<div class="m-cover-ph">📚</div>'
      }
    </div>

    <h2 class="m-title">${esc(title)}</h2>
    ${origName ? `<p class="m-orig">${esc(origName)}</p>` : ''}
    <p class="m-author">✦ ${esc(author)}</p>

    <div class="m-tags">
      ${rating   ? `<span class="m-tag red">${esc(rating)}</span>` : ''}
      ${chapters ? `<span class="m-tag">📖 ${fmtCount(chapters)} chapters</span>` : ''}
      ${status   ? `<span class="m-tag">${esc(status)}</span>` : ''}
      ${genres.slice(0, 4).map(g => `<span class="m-tag">${esc(g)}</span>`).join('')}
      ${tags.map(t => `<span class="m-tag">${esc(t)}</span>`).join('')}
    </div>

    <div class="m-desc">${esc(desc)}</div>

    <div class="m-links">
      <a class="m-link primary" href="${wlnUrl}" target="_blank" rel="noopener">
        🏮 Open on WLNUpdates
      </a>
      ${sid ? `<a class="m-link secondary"
        href="https://www.wlnupdates.com/series-id/${sid}/releases/"
        target="_blank" rel="noopener">📖 Chapter List</a>` : ''}
    </div>
  `;

  DOM.overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  DOM.overlay.focus();
}

function closeModal() {
  DOM.overlay.classList.remove('open');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════
   PAGINATION
   ═══════════════════════════════════════════════ */
function renderPagination() {
  DOM.pages.innerHTML = '';
  // Only paginate advanced search (title search fetches all at once)
  if (state.query) return;

  const totalPages = Math.ceil(state.total / PAGE_SIZE);
  if (totalPages <= 1) return;

  const cur = state.page;
  addPageBtn('← 前', cur - 1, cur === 0, false);

  const range = getPageRange(cur, totalPages);
  range.forEach(item => {
    if (item === '…') {
      const el = document.createElement('span');
      el.className = 'page-ellipsis';
      el.textContent = '…';
      DOM.pages.appendChild(el);
    } else {
      addPageBtn(item + 1, item, false, item === cur);
    }
  });

  addPageBtn('后 →', cur + 1, cur >= totalPages - 1, false);
}

function addPageBtn(label, targetPage, disabled, active) {
  const btn = document.createElement('button');
  btn.className = 'page-btn' + (active ? ' active' : '');
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener('click', () => {
    state.page = targetPage;
    fetchNovels();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  DOM.pages.appendChild(btn);
}

function getPageRange(cur, total) {
  const set = new Set([0, total - 1]);
  for (let i = cur - 2; i <= cur + 2; i++) {
    if (i >= 0 && i < total) set.add(i);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  let prev = -1;
  for (const p of sorted) {
    if (prev !== -1 && p - prev > 1) result.push('…');
    result.push(p);
    prev = p;
  }
  return result;
}

/* ═══════════════════════════════════════════════
   STATES
   ═══════════════════════════════════════════════ */
function renderLoader() {
  DOM.grid.innerHTML = `
    <div class="state-box">
      <div class="loader-dots">
        <span>🏮</span><span>📖</span><span>🌸</span><span>🏮</span>
      </div>
      <p class="state-sub">Finding your novels…</p>
    </div>`;
}

function renderEmpty() {
  DOM.grid.innerHTML = `
    <div class="state-box">
      <div class="state-icon">📭</div>
      <div class="state-title">无书可寻…</div>
      <p class="state-sub">No novels found. Try a different search term or genre.</p>
    </div>`;
}

function renderError(msg) {
  DOM.grid.innerHTML = `
    <div class="state-box">
      <div class="state-icon">🫧</div>
      <div class="state-title">Connection Lost</div>
      <p class="state-sub">Could not reach WLNUpdates.<br/>
        <em>${esc(msg || 'Please check your internet connection.')}</em>
      </p>
    </div>`;
}

/* ═══════════════════════════════════════════════
   DATA HELPERS  (WLNUpdates response normalisation)
   ═══════════════════════════════════════════════ */

/** Get best English cover URL from series data */
function getCover(n) {
  // The API sometimes returns a 'covers' array or 'cover' string
  if (n.covers && n.covers.length) {
    const c = n.covers[0];
    // Covers are relative paths on wlnupdates
    if (c.url) return toAbsolute(c.url);
    if (typeof c === 'string') return toAbsolute(c);
  }
  if (n.cover) return toAbsolute(n.cover);
  return null;
}

function toAbsolute(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://www.wlnupdates.com${path}`;
}

/** Return original Chinese/Korean title if present */
function getOriginalName(n) {
  if (!n.alternatenames) return null;
  const names = n.alternatenames;
  if (Array.isArray(names)) {
    // look for a name with CJK characters
    const cjk = names.find(nm => {
      const s = typeof nm === 'string' ? nm : (nm.name || '');
      return /[\u4e00-\u9fff\u3040-\u30ff]/.test(s);
    });
    if (cjk) return typeof cjk === 'string' ? cjk : cjk.name;
  }
  return null;
}

/** Extract author name(s) */
function getAuthor(n) {
  if (n.authors) {
    const list = n.authors;
    if (Array.isArray(list) && list.length) {
      const a = list[0];
      return typeof a === 'string' ? a : (a.author || a.name || 'Unknown');
    }
  }
  if (n.author) return n.author;
  return 'Unknown Author';
}

/** Extract genre list */
function getGenres(n) {
  if (!n.genres) return [];
  return n.genres
    .map(g => typeof g === 'string' ? g : (g.genre || g.name || ''))
    .filter(Boolean)
    .map(g => capitalise(g));
}

/** Extract tag list */
function getTags(n) {
  if (!n.tags) return [];
  return n.tags
    .map(t => typeof t === 'string' ? t : (t.tag || t.name || ''))
    .filter(Boolean)
    .map(t => capitalise(t));
}

/* ═══════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════ */

function esc(str) {
  return String(str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtCount(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return n;
  return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : String(num);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return dateStr; }
}

function isRecent(dateStr) {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return (now - d) < 30 * 24 * 60 * 60 * 1000; // 30 days
  } catch { return false; }
}

/* ═══════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
