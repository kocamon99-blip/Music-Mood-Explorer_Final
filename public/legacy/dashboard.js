const state = { mood: 'chill', searchTerm: '' };
state.catalogPage = 0;
state.catalogHasMore = false;
state.catalogLoadingMore = false;
const queuePlayback = { active: false, loading: false };
let songsById = new Map();
let lastModalTrigger = null;
let searchTimer = null;
let dashboardRequestId = 0;
let searchHistory = [];
let searchStorageError = '';
let librarySongs = [];
let selectedGenre = 'all';
const songResponseCache = new Map();
const songRequests = new Map();

const SEARCH_HISTORY_KEY = 'music-mood-explorer-search-history';
const SEARCH_HISTORY_LIMIT = 8;
const SONG_CACHE_TTL = 60 * 1000;
const SONG_CACHE_LIMIT = 30;

const songsGrid = document.getElementById('songs');
const loadMoreContainer = document.createElement('div');
loadMoreContainer.id = 'loadMoreCatalog';
loadMoreContainer.className = 'load-more-area';
songsGrid.insertAdjacentElement('afterend', loadMoreContainer);

function showError(msg) {
  const box = document.getElementById('error');
  box.textContent = msg;
  box.style.display = msg ? 'block' : 'none';
}

function formatDuration(ms) {
  if (!ms) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getPreviewUrl(song) {
  return `/preview/${encodeURIComponent(song.id)}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadDashboard(recordSearch = false, retry = false, loadingMore = false) {
  const algo = document.getElementById('algo').value;
  const requestId = ++dashboardRequestId;
  const searchTerm = state.searchTerm;
  const batchParam = searchTerm ? '' : `&catalogPage=${state.catalogPage}`;
  const songsUrl = `/songs?${searchTerm ? `search=${encodeURIComponent(searchTerm)}` : `mood=${encodeURIComponent(state.mood)}`}${batchParam}&sort=${algo}`;
  if (retry || !getCachedSongs(songsUrl)) {
    if (loadingMore && librarySongs.length) {
      loadMoreContainer.textContent = 'กำลังโหลดเพลงเพิ่มเติม…';
    } else {
      renderLibraryLoading();
    }
  }
  try {
    const [songsData, watchlistRes, historyRes] = await Promise.all([
      fetchSongs(songsUrl, retry),
      fetch('/watchlist'),
      fetch('/history'),
    ]);

    if (!watchlistRes.ok || !historyRes.ok) throw new Error('โหลดข้อมูลหน้าเว็บไม่สำเร็จ');
    const watchlistData = await watchlistRes.json();
    const historyData = await historyRes.json();

    if (requestId !== dashboardRequestId) return;
    renderSongs(songsData);
    state.catalogHasMore = !searchTerm && songsData.hasMore === true;
    state.catalogLoadingMore = false;
    renderLoadMore();
    renderWatchlist(watchlistData);
    renderHistory(historyData);
    document.getElementById('queueSummary').textContent = watchlistData.size || 0;
    document.getElementById('historySummary').textContent = historyData.size || 0;
    if (songsData.source === 'fallback') {
      setSearchStatus('iTunes API ไม่พร้อมใช้งาน · Library ไม่แสดงข้อมูลสำรอง');
    } else if (searchTerm) {
      setSearchStatus(`พบ ${songsData.count} เพลงสำหรับ “${searchTerm}” · iTunes API ${songsData.apiMs} ms · sort ${songsData.ms} ms`);
    } else {
      setSearchStatus(`แสดง ${songsData.count} เพลงตามอารมณ์ที่เลือก`);
    }
    showError(searchStorageError);
    if (searchTerm && recordSearch) saveSearchTerm(searchTerm);
  } catch (error) {
    if (requestId !== dashboardRequestId) return;
    state.catalogLoadingMore = false;
    if (loadingMore && librarySongs.length) {
      renderLoadMore(error.message);
      showError(`โหลดเพลงเพิ่มเติมไม่สำเร็จ: ${error.message}`);
      return;
    }
    setSearchStatus(searchTerm ? 'ค้นหาไม่สำเร็จ กรุณาลองอีกครั้ง' : 'โหลดเพลงไม่สำเร็จ');
    showError('โหลดข้อมูลไม่สำเร็จ: ' + error.message);
    renderLibraryError(error.message);
  }

  function renderLoadMore(error = '') {
    if (state.searchTerm || !state.catalogHasMore) {
      loadMoreContainer.replaceChildren();
      return;
    }
    loadMoreContainer.innerHTML = `${error ? `<p class="load-more-error" role="alert">${escapeHtml(error)}</p>` : ''}<button class="primary" type="button" id="loadMoreSongs" ${state.catalogLoadingMore ? 'disabled' : ''}>${state.catalogLoadingMore ? 'กำลังโหลดเพลงเพิ่มเติม…' : error ? 'ลองโหลดชุดนี้อีกครั้ง' : 'โหลดเพลงเพิ่มเติม'}</button>`;
    document.getElementById('loadMoreSongs').addEventListener('click', () => {
      if (state.catalogLoadingMore) return;
      state.catalogLoadingMore = true;
      if (!error) state.catalogPage++;
      loadDashboard(false, Boolean(error), true);
    });
  }
}

function getCachedSongs(url) {
  const cached = songResponseCache.get(url);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    songResponseCache.delete(url);
    return null;
  }
  return cached.data;
}

function fetchSongs(url, retry = false) {
  if (retry) songResponseCache.delete(url);
  if (!retry) {
    const cached = getCachedSongs(url);
    if (cached) return Promise.resolve(cached);
    if (songRequests.has(url)) return songRequests.get(url);
  }

  const request = fetch(url)
    .then(async response => {
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'โหลดรายการเพลงไม่สำเร็จ');
      }
      return response.json();
    })
    .then(data => {
      songResponseCache.set(url, { data, expiresAt: Date.now() + SONG_CACHE_TTL });
      if (songResponseCache.size > SONG_CACHE_LIMIT) {
        songResponseCache.delete(songResponseCache.keys().next().value);
      }
      return data;
    })
    .finally(() => {
      if (songRequests.get(url) === request) songRequests.delete(url);
    });
  songRequests.set(url, request);
  return request;
}

function renderLibraryLoading() {
  document.getElementById('libraryCount').textContent = 'กำลังโหลดรายการเพลง…';
  document.getElementById('songs').innerHTML = Array.from({ length: 6 }, () => `
    <article class="card skeleton-card" aria-hidden="true">
      <div class="skeleton-block skeleton-art"></div>
      <div class="info">
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line short"></div>
      </div>
    </article>
  `).join('');
}

function renderLibraryError(message) {
  librarySongs = [];
  songsById = new Map();
  document.getElementById('sortInfo').textContent = 'โหลด Library ไม่สำเร็จ';
  document.getElementById('libraryCount').textContent = 'โหลดรายการไม่ได้';
  document.getElementById('songs').innerHTML = `
    <div class="library-message library-error" role="alert">
      โหลด Music Library ไม่สำเร็จ: ${escapeHtml(message)}
      <br><button class="primary" type="button" id="retryLibrary">ลองอีกครั้ง</button>
    </div>
  `;
  document.getElementById('retryLibrary').addEventListener('click', () => loadDashboard(false, true));
}

function renderSongs(res) {
  if (!res.search) document.getElementById('currentMood').textContent = res.mood;
  if (res.source === 'fallback') {
    renderLibraryError('iTunes API ไม่พร้อมใช้งาน ขณะนี้ไม่แสดงข้อมูลสำรองใน Library');
    return;
  }

  songsById = new Map();
  const uniqueSongs = new Map();
  for (const song of res.data) {
    if (song.apiId === null || song.apiId === undefined) continue;
    const id = String(song.apiId);
    if (!uniqueSongs.has(id)) uniqueSongs.set(id, song);
  }
  librarySongs = [...uniqueSongs.values()];
  songsById = new Map(librarySongs.map(song => [String(song.id), song]));
  document.getElementById('sortInfo').textContent = `${res.search ? 'ค้นหา' : res.algorithm} · ${librarySongs.length} เพลง · iTunes API ${res.apiMs} ms · sort ${res.ms} ms`;
  populateGenreFilter();
  renderLibrary();
}

function populateGenreFilter() {
  const filter = document.getElementById('genreFilter');
  const genres = new Set(librarySongs.map(song => song.apiGenre).filter(Boolean));
  const previous = selectedGenre;
  filter.innerHTML = '<option value="all">ทุกประเภท</option>' +
    [...genres].sort((a, b) => a.localeCompare(b)).map(genre =>
      `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`
    ).join('');
  selectedGenre = genres.has(previous) ? previous : 'all';
  filter.value = selectedGenre;
}

function renderLibrary() {
  const visibleSongs = selectedGenre === 'all'
    ? librarySongs
    : librarySongs.filter(song => song.apiGenre === selectedGenre);
  document.getElementById('libraryCount').textContent = selectedGenre === 'all'
    ? `โหลดแล้ว ${librarySongs.length} รายการ`
    : `โหลดแล้ว ${librarySongs.length} รายการ · แสดง ${visibleSongs.length} รายการ`;

  if (visibleSongs.length === 0) {
    const message = librarySongs.length
      ? 'ไม่มีเพลงในประเภทที่เลือก'
      : (state.searchTerm ? `ไม่พบเพลงที่ตรงกับ “${escapeHtml(state.searchTerm)}”` : 'ไม่พบเพลงจาก API สำหรับอารมณ์นี้');
    document.getElementById('songs').innerHTML = `<div class="library-message">${message}</div>`;
    return;
  }

  document.getElementById('songs').innerHTML = visibleSongs.map(song => `
    <article class="card" data-song-id="${escapeHtml(String(song.apiId))}">
      <img src="${song.image}" alt="${escapeHtml(song.title)}" loading="lazy">
      <div class="info">
        <button class="track-open" onclick="openSongModal(${JSON.stringify(song.id)}, this)">${escapeHtml(song.title)}</button>
        <span class="meta">${escapeHtml(song.artist)} · ${escapeHtml(song.apiGenre || 'ไม่ระบุประเภท')}</span>
        <span class="eps">${formatDuration(song.duration)}</span>
      </div>
      <div class="card-actions">
        <button class="preview-btn" onclick="playPreview(${JSON.stringify(song.id)})" ${song.preview ? '' : 'disabled'} aria-label="${song.preview ? 'ฟังตัวอย่าง' : 'ไม่มีตัวอย่าง'}: ${escapeHtml(song.title)}">▶ ฟังตัวอย่าง</button>
        <button class="queue-btn" onclick="addToWatchlist(${JSON.stringify(song.id)})" aria-label="เพิ่ม ${escapeHtml(song.title)} เข้าคิว">+ คิว</button>
      </div>
    </article>
  `).join('');
}

function setSearchStatus(message, loading = false) {
  const status = document.getElementById('searchStatus');
  status.textContent = message;
  status.setAttribute('aria-busy', String(loading));
}

function renderSearchHistory() {
  const container = document.getElementById('searchHistory');
  container.innerHTML = searchHistory.length
    ? `<span class="search-history-label">ค้นหาล่าสุด</span>${searchHistory.map(term => `
        <button class="history-query" type="button" data-search-term="${escapeHtml(term)}">${escapeHtml(term)}</button>
      `).join('')}<button id="clearSearchHistory" class="history-clear" type="button">ล้างประวัติ</button>`
    : '';

  container.querySelectorAll('[data-search-term]').forEach(button => {
    button.addEventListener('click', () => {
      const term = button.dataset.searchTerm;
      document.getElementById('searchInput').value = term;
      state.searchTerm = term;
      clearTimeout(searchTimer);
      setSearchStatus(`กำลังค้นหา “${term}”…`, true);
      loadDashboard(true);
    });
  });
  const clearButton = document.getElementById('clearSearchHistory');
  if (clearButton) clearButton.addEventListener('click', clearSearchHistory);
}

function saveSearchTerm(term) {
  searchHistory = [term, ...searchHistory.filter(item => item.toLowerCase() !== term.toLowerCase())]
    .slice(0, SEARCH_HISTORY_LIMIT);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    searchStorageError = '';
    renderSearchHistory();
  } catch (error) {
    searchStorageError = `บันทึกประวัติการค้นหาไม่สำเร็จ: ${error.message}`;
    showError(searchStorageError);
  }
}

function clearSearchHistory() {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    searchHistory = [];
    searchStorageError = '';
    renderSearchHistory();
  } catch (error) {
    searchStorageError = `ล้างประวัติการค้นหาไม่สำเร็จ: ${error.message}`;
    showError(searchStorageError);
  }
}

function initializeSearch() {
  try {
    const stored = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    searchHistory = Array.isArray(stored)
      ? stored.filter(term => typeof term === 'string').slice(0, SEARCH_HISTORY_LIMIT)
      : [];
  } catch (error) {
    searchHistory = [];
    searchStorageError = `อ่านประวัติการค้นหาไม่สำเร็จ: ${error.message}`;
    showError(searchStorageError);
  }
  renderSearchHistory();
  document.getElementById('genreFilter').addEventListener('change', event => {
    selectedGenre = event.target.value;
    renderLibrary();
  });

  document.getElementById('searchInput').addEventListener('input', event => {
    clearTimeout(searchTimer);
    dashboardRequestId++;
    state.searchTerm = event.target.value.trim();
    state.catalogPage = 0;
    state.catalogHasMore = false;
    state.catalogLoadingMore = false;
    if (!state.searchTerm) {
      setSearchStatus('กำลังแสดงเพลงตามอารมณ์ที่เลือก…', true);
      loadDashboard();
      return;
    }
    setSearchStatus(`กำลังค้นหา “${state.searchTerm}”…`, true);
    searchTimer = setTimeout(() => loadDashboard(true), 300);
  });

  document.getElementById('searchForm').addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(searchTimer);
    state.searchTerm = document.getElementById('searchInput').value.trim();
    state.catalogPage = 0;
    state.catalogHasMore = false;
    if (!state.searchTerm) {
      loadDashboard(true);
      return;
    }
    setSearchStatus(`กำลังค้นหา “${state.searchTerm}”…`, true);
    loadDashboard(true);
  });

  document.getElementById('clearSearch').addEventListener('click', () => {
    clearTimeout(searchTimer);
    document.getElementById('searchInput').value = '';
    state.searchTerm = '';
    state.catalogPage = 0;
    state.catalogHasMore = false;
    setSearchStatus('กำลังแสดงเพลงตามอารมณ์ที่เลือก…', true);
    loadDashboard();
    document.getElementById('searchInput').focus();
  });
}

function renderWatchlist(res) {
  document.getElementById('queueSize').textContent = res.size;
  document.getElementById('queueSummary').textContent = res.size;
  document.getElementById('watchlist').innerHTML = res.size === 0
    ? '<li class="empty">คิวว่าง</li>'
    : res.items.map((song, index) => `<li>${index + 1}. ${escapeHtml(song.title)}</li>`).join('');
}

function renderHistory(res) {
  document.getElementById('historySummary').textContent = res.size;
  document.getElementById('history').innerHTML = res.size === 0
    ? '<li class="empty">ยังไม่มีประวัติ</li>'
    : res.history.map(item => `<li><b>${item.action}</b> ${escapeHtml(item.song.title)} <span>${item.time}</span></li>`).join('');
}

function playPreview(id) {
  const song = songsById.get(String(id));
  if (!song || !song.preview) return;

  queuePlayback.active = false;
  document.getElementById('queueStatus').textContent = 'เล่นตัวอย่างเพลงเดี่ยว · คิวที่เหลือยังรออยู่';
  const player = document.getElementById('previewAudio');
  const previewPanel = document.getElementById('previewPlayer');
  const modalPlayer = document.getElementById('modalPreview');
  modalPlayer.pause();
  modalPlayer.currentTime = 0;
  player.pause();
  player.src = getPreviewUrl(song);
  player.load();
  document.getElementById('previewTitle').textContent = song.title;
  document.getElementById('previewArtist').textContent = song.artist;
  previewPanel.hidden = false;
  player.play().catch(() => {
    showError('ไม่สามารถเล่นตัวอย่างเพลงนี้ได้ กรุณากดเล่นจากเครื่องเล่นอีกครั้ง');
  });
}

function openSongModal(id, trigger = null) {
  const song = songsById.get(String(id));
  if (!song) return;

  lastModalTrigger = trigger || document.activeElement;
  if (queuePlayback.active) stopQueuePlayback();
  document.getElementById('modalImage').src = song.image;
  document.getElementById('modalImage').alt = song.title;
  document.getElementById('modalName').textContent = song.title;
  document.getElementById('modalArtist').textContent = song.artist;
  document.getElementById('modalGenre').textContent = song.genre;
  document.getElementById('modalAlbum').textContent = song.album || 'ไม่ระบุ';
  document.getElementById('modalDuration').textContent = formatDuration(song.duration);
  document.getElementById('modalMood').textContent = song.mood || state.mood;
  document.getElementById('modalLink').href = song.url || '#';
  document.getElementById('modalLink').textContent = 'เปิด iTunes';

  const preview = document.getElementById('modalPreview');
  document.getElementById('previewAudio').pause();
  if (song.preview) {
    preview.src = getPreviewUrl(song);
    document.getElementById('modalPreviewWrap').style.display = 'block';
    preview.load();
  } else {
    preview.removeAttribute('src');
    document.getElementById('modalPreviewWrap').style.display = 'none';
  }

  document.getElementById('songModal').style.display = 'flex';
  document.querySelector('.modal-close').focus();
}

function closeSongModal() {
  document.getElementById('songModal').style.display = 'none';
  document.getElementById('modalPreview').pause();
  if (lastModalTrigger && document.contains(lastModalTrigger)) lastModalTrigger.focus();
}

document.addEventListener('keydown', event => {
  const modal = document.getElementById('songModal');
  if (event.key === 'Escape' && modal.style.display === 'flex') closeSongModal();
  if (event.key === 'Tab' && modal.style.display === 'flex') {
    const closeButton = modal.querySelector('.modal-close');
    const link = document.getElementById('modalLink');
    const modalAudio = document.getElementById('modalPreview');
    const focusable = [closeButton, link, ...(modalAudio.offsetParent ? [modalAudio] : [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

document.getElementById('modalPreview').addEventListener('play', () => {
  document.getElementById('previewAudio').pause();
});

async function addToWatchlist(id) {
  try {
    const res = await fetch('/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
}

async function processQueue() {
  if (queuePlayback.loading) return;
  queuePlayback.active = true;
  await playNextQueuedTrack();
}

async function playNextQueuedTrack() {
  if (!queuePlayback.active || queuePlayback.loading) return;
  queuePlayback.loading = true;
  try {
    const res = await fetch('/watchlist/process', { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) {
      if (res.status === 400) {
        queuePlayback.active = false;
        document.getElementById('queueStatus').textContent = 'เล่นครบทุกเพลงในคิวแล้ว';
        return;
      }
      throw new Error(result.error || 'เล่นคิวไม่สำเร็จ');
    }

    const song = result.song;
    if (!queuePlayback.active) return;
    if (!song?.preview) {
      document.getElementById('queueStatus').textContent = `${song?.title || 'เพลงนี้'} ไม่มีตัวอย่างเสียง กำลังข้ามไปเพลงถัดไป…`;
      queuePlayback.loading = false;
      await loadDashboard();
      return playNextQueuedTrack();
    }

    const player = document.getElementById('previewAudio');
    document.getElementById('modalPreview').pause();
    player.pause();
    player.src = getPreviewUrl(song);
    player.load();
    document.getElementById('previewTitle').textContent = song.title;
    document.getElementById('previewArtist').textContent = song.artist;
    document.getElementById('previewPlayer').hidden = false;
    document.getElementById('queueStatus').textContent = `กำลังเล่น: ${song.title} · เพลงถัดไปจะเริ่มอัตโนมัติ`;
    await player.play();
    await loadDashboard();
  } catch (error) {
    queuePlayback.active = false;
    document.getElementById('queueStatus').textContent = 'เล่นคิวหยุดชั่วคราว · กดเริ่มเล่นคิวอีกครั้ง';
    showError(`เล่นคิวไม่สำเร็จ: ${error.message}`);
  } finally {
    queuePlayback.loading = false;
  }
}

function stopQueuePlayback() {
  queuePlayback.active = false;
  document.getElementById('previewAudio').pause();
  document.getElementById('queueStatus').textContent = 'หยุดเล่นแล้ว · เพลงที่เหลือยังอยู่ในคิว';
}

document.getElementById('previewAudio').addEventListener('ended', () => {
  if (queuePlayback.active) playNextQueuedTrack();
});

document.getElementById('previewAudio').addEventListener('error', () => {
  if (!queuePlayback.active) return;
  queuePlayback.active = false;
  document.getElementById('queueStatus').textContent = 'เล่นเพลงไม่สำเร็จ · กดเริ่มเล่นคิวอีกครั้ง';
  showError('ไม่สามารถเล่นเพลงจากคิวได้ กรุณาลองใหม่อีกครั้ง');
});

async function undo() {
  try {
    const res = await fetch('/undo', { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
}

document.querySelectorAll('[data-mood]').forEach((button) => {
  button.addEventListener('click', () => {
    state.mood = button.dataset.mood;
    state.catalogPage = 0;
    state.catalogHasMore = false;
    state.catalogLoadingMore = false;
    document.querySelectorAll('[data-mood]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    if (!state.searchTerm) loadDashboard();
  });
});

initializeSearch();
window.addEventListener('load', loadDashboard);
