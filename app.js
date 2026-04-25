const input            = document.getElementById('search-input');
const btn              = document.getElementById('search-btn');
const grid             = document.getElementById('books-grid');
const loading          = document.getElementById('loading');
const emptyState       = document.getElementById('empty-state');
const resultsCount     = document.getElementById('results-count');
const resultsHeaderWrap = document.getElementById('results-header-wrap');
const paginationEl     = document.getElementById('pagination');
const modalOverlay     = document.getElementById('modal-overlay');
const modalClose       = document.getElementById('modal-close');
const modalBody        = document.getElementById('modal-body');

let currentPage  = 1;
let currentQuery = '';
let currentType  = 'all';
let totalResults = 0;
const PAGE_SIZE  = 18;

/* ── Butoane de filtrare ─────────────────────────────────────── */
document.querySelectorAll('.filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentType = b.dataset.type;
  });
});

/* ── Declansatoare pentru cautare ────────────────────────────── */
btn.addEventListener('click', () => doSearch());
input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

/* ── Functia principala de cautare ───────────────────────────── */
async function doSearch(page = 1) {
  const q = input.value.trim();
  if (!q) return;

  currentQuery = q;
  currentPage  = page;

  showLoading(true);
  grid.innerHTML        = '';
  paginationEl.innerHTML = '';
  resultsHeaderWrap.style.display = 'none';
  emptyState.style.display        = 'none';

  try {
    let searchParam = '';
    if      (currentType === 'title')   searchParam = `title=${encodeURIComponent(q)}`;
    else if (currentType === 'author')  searchParam = `author=${encodeURIComponent(q)}`;
    else if (currentType === 'subject') searchParam = `subject=${encodeURIComponent(q)}`;
    else                                searchParam = `q=${encodeURIComponent(q)}`;

    const offset = (page - 1) * PAGE_SIZE;
    const url = `https://openlibrary.org/search.json?${searchParam}&limit=${PAGE_SIZE}&offset=${offset}&fields=key,title,author_name,first_publish_year,cover_i,isbn,subject,number_of_pages_median,publisher`;

    const res  = await fetch(url);
    const data = await res.json();

    totalResults = data.numFound || 0;
    showLoading(false);

    if (!data.docs || data.docs.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    resultsHeaderWrap.style.display = 'block';
    const start = offset + 1;
    const end   = Math.min(offset + data.docs.length, totalResults);
    resultsCount.innerHTML = `Showing <span>${start}–${end}</span> of <span>${totalResults.toLocaleString()}</span> volumes`;

    data.docs.forEach((book, i) => {
      grid.appendChild(createBookCard(book, i));
    });

    buildPagination(totalResults, page);

  } catch (err) {
    showLoading(false);
    emptyState.style.display = 'block';
    console.error(err);
  }
}

/* ── Construieste un singur card de carte ────────────────────── */
function createBookCard(book, index) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.style.animationDelay = `${index * 0.04}s`;

  const coverUrl = book.cover_i
    ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
    : null;

  const title  = book.title || 'Unknown Title';
  const author = book.author_name ? book.author_name[0] : 'Unknown Author';
  const year   = book.first_publish_year || '';

  card.innerHTML = `
    <div class="book-cover-wrap">
      ${coverUrl
        ? `<img src="${coverUrl}" alt="${escapeHtml(title)}" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : ''}
      <div class="book-no-cover" style="${coverUrl ? 'display:none' : ''}">
        <div class="book-spine-glyph">📚</div>
        <div class="book-no-cover-title">${escapeHtml(title)}</div>
      </div>
      <div class="book-overlay">
        <span class="book-overlay-text">View Details</span>
      </div>
    </div>
    <div class="book-info">
      <div class="book-title">${escapeHtml(title)}</div>
      <div class="book-author">${escapeHtml(author)}</div>
      ${year ? `<div class="book-year">${year}</div>` : ''}
    </div>
  `;

  card.addEventListener('click', () => openModal(book));
  return card;
}

/* ── Deschide modalul de detalii ─────────────────────────────── */
async function openModal(book) {
  const title     = book.title || 'Unknown Title';
  const authors   = book.author_name ? book.author_name.join(', ') : 'Unknown Author';
  const year      = book.first_publish_year || '—';
  const pages     = book.number_of_pages_median || '—';
  const publisher = book.publisher ? book.publisher[0] : '—';
  const subjects  = book.subject ? book.subject.slice(0, 8) : [];
  const olKey     = book.key || '';
  const coverUrl  = book.cover_i
    ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
    : null;

  modalBody.innerHTML = `
    <div class="modal-cover">
      ${coverUrl
        ? `<img src="${coverUrl}" alt="${escapeHtml(title)}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : ''}
      <div class="modal-cover-placeholder" style="${coverUrl ? 'display:none' : ''}">📖</div>
    </div>
    <div class="modal-content">
      <div class="modal-category">Literary Work</div>
      <div class="modal-title">${escapeHtml(title)}</div>
      <div class="modal-author">${escapeHtml(authors)}</div>
      <div class="modal-divider"></div>
      <div class="modal-meta">
        <div class="meta-item">
          <label>First Published</label>
          <span>${year}</span>
        </div>
        <div class="meta-item">
          <label>Pages</label>
          <span>${pages}</span>
        </div>
        <div class="meta-item">
          <label>Publisher</label>
          <span>${escapeHtml(publisher)}</span>
        </div>
      </div>
      <div id="modal-desc-area">
        <p class="modal-desc" style="color:var(--smoke);font-style:italic;font-size:0.85rem">
          Fetching details from the archive…
        </p>
      </div>
      ${subjects.length ? `
        <div class="modal-subjects">
          ${subjects.map(s => `<span class="subject-tag">${escapeHtml(s)}</span>`).join('')}
        </div>` : ''}
      ${olKey ? `<a class="modal-link" href="https://openlibrary.org${olKey}" target="_blank">Open in Library ↗</a>` : ''}
    </div>
  `;

  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  /* Preia descrierea cartii din Open Library */
  if (olKey) {
    try {
      const res  = await fetch(`https://openlibrary.org${olKey}.json`);
      const data = await res.json();
      let desc = data.description;
      if (desc && typeof desc === 'object') desc = desc.value;

      const area = document.getElementById('modal-desc-area');
      if (area) {
        area.innerHTML = desc
          ? `<p class="modal-desc">${escapeHtml(desc.slice(0, 500))}${desc.length > 500 ? '…' : ''}</p>`
          : `<p class="modal-desc" style="opacity:0.4;font-style:italic">No synopsis found in the archives.</p>`;
      }
    } catch (e) {
      const area = document.getElementById('modal-desc-area');
      if (area) area.innerHTML = '';
    }
  }
}

/* ── Inchide modalul ──────────────────────────────────────────── */
function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── Paginare ─────────────────────────────────────────────────── */
function buildPagination(total, current) {
  const totalPages = Math.min(Math.ceil(total / PAGE_SIZE), 50);
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className   = 'page-btn';
  prev.textContent = '← Prev';
  prev.disabled    = current === 1;
  prev.addEventListener('click', () => doSearch(current - 1));
  paginationEl.appendChild(prev);

  const info = document.createElement('span');
  info.className   = 'page-info';
  info.textContent = `Page ${current} of ${totalPages}`;
  paginationEl.appendChild(info);

  const next = document.createElement('button');
  next.className   = 'page-btn';
  next.textContent = 'Next →';
  next.disabled    = current >= totalPages;
  next.addEventListener('click', () => doSearch(current + 1));
  paginationEl.appendChild(next);
}

/* ── Functii ajutatoare ───────────────────────────────────────── */
function showLoading(show) {
  loading.style.display = show ? 'block' : 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}