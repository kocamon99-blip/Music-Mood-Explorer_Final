import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import DiscoverPage from './components/DiscoverPage.jsx';
import MusicLibrary from './components/MusicLibrary.jsx';
import QueuePanel from './components/QueuePanel.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import SongModal from './components/SongModal.jsx';
import { uniqueApiSongs, uniqueGenres } from './dsa.mjs';

const SEARCH_HISTORY_KEY = 'music-mood-explorer-search-history';
const SEARCH_HISTORY_LIMIT = 8;
const SONG_CACHE_TTL = 60 * 1000;
const SONG_CACHE_LIMIT = 30;

async function readJson(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาลองอีกครั้ง');
  }
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'คำขอไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  return data;
}

function userErrorMessage(error, fallback) {
  if (error instanceof TypeError) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง';
  return typeof error?.message === 'string' && /[ก-๙]/.test(error.message)
    ? error.message
    : fallback;
}

function readSearchHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    return {
      items: Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, SEARCH_HISTORY_LIMIT) : [],
      error: '',
    };
  } catch (error) {
    return { items: [], error: 'อ่านประวัติการค้นหาไม่สำเร็จ กรุณาลองอีกครั้ง' };
  }
}

export default function App() {
  const [storedSearchHistory] = useState(readSearchHistory);
  const [moods, setMoods] = useState([]);
  const [moodsLoading, setMoodsLoading] = useState(true);
  const [moodsError, setMoodsError] = useState('');
  const [moodsRetryToken, setMoodsRetryToken] = useState(0);
  const [mood, setMood] = useState('chill');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchHistory, setSearchHistory] = useState(storedSearchHistory.items);
  const [recentlyDiscovered, setRecentlyDiscovered] = useState([]);
  const [sort, setSort] = useState('selection');
  const [searchPage, setSearchPage] = useState(0);
  const [catalogPage, setCatalogPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [songs, setSongs] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState('');
  const [queueStatus, setQueueStatus] = useState('เพิ่มเพลงเข้าคิว แล้วเลือกเล่นได้เลย');
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueActive, setQueueActive] = useState(false);
  const [playbackTrack, setPlaybackTrack] = useState(null);
  const [modalSong, setModalSong] = useState(null);
  const [notice, setNotice] = useState(storedSearchHistory.error);
  const searchHistoryRef = useRef(storedSearchHistory.items);
  const audioRef = useRef(null);
  const queueBusyRef = useRef(false);
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const lastRetryTokenRef = useRef(0);
  const responseCacheRef = useRef(new Map());
  const pendingRequestsRef = useRef(new Map());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearchTerm = searchDraft.trim();
      if (nextSearchTerm !== searchTerm) {
        setSearchPage(0);
        setSearchTerm(nextSearchTerm);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft, searchTerm]);

  useEffect(() => {
    let active = true;
    setMoodsLoading(true);
    setMoodsError('');
    fetch('/moods')
      .then(readJson)
      .then(data => {
        if (active) setMoods(Array.isArray(data.moods) ? data.moods : []);
      })
      .catch(error => {
        if (active) setMoodsError(userErrorMessage(error, 'โหลดรายการอารมณ์ไม่สำเร็จ กรุณาลองอีกครั้ง'));
      })
      .finally(() => {
        if (active) setMoodsLoading(false);
      });
    return () => { active = false; };
  }, [moodsRetryToken]);

  const refreshCollections = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setCollectionsLoading(true);
    try {
      const [queueResponse, historyResponse] = await Promise.all([
        fetch('/watchlist').then(readJson),
        fetch('/history').then(readJson),
      ]);
      setQueue(Array.isArray(queueResponse.items) ? queueResponse.items : []);
      setHistory(Array.isArray(historyResponse.history) ? historyResponse.history : []);
      setCollectionsError('');
    } catch (error) {
      setCollectionsError(userErrorMessage(error, 'โหลดคิวและประวัติไม่สำเร็จ กรุณาลองอีกครั้ง'));
      throw error;
    } finally {
      if (showLoading) setCollectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    refreshCollections({ showLoading: true }).catch(error => {
      if (active) setNotice(userErrorMessage(error, 'โหลดคิวหรือประวัติไม่สำเร็จ กรุณาลองอีกครั้ง'));
    });
    return () => { active = false; };
  }, [refreshCollections]);

  const songUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (searchTerm) {
      params.set('search', searchTerm);
      params.set('searchPage', String(searchPage));
    }
    else {
      params.set('mood', mood);
      params.set('catalogPage', String(catalogPage));
    }
    params.set('sort', sort);
    return `/songs?${params.toString()}`;
  }, [mood, searchTerm, sort, catalogPage, searchPage]);

  useEffect(() => {
    let active = true;
    const requestId = ++requestIdRef.current;
    const forceRequest = retryToken !== lastRetryTokenRef.current;
    lastRetryTokenRef.current = retryToken;
    setLibraryLoading(true);
    setLibraryError('');

    async function fetchSongs() {
      const cache = responseCacheRef.current;
      const pending = pendingRequestsRef.current;
      if (forceRequest) cache.delete(songUrl);
      const cached = cache.get(songUrl);
      if (!forceRequest && cached && cached.expiresAt > Date.now()) return cached.data;
      if (!forceRequest && pending.has(songUrl)) return pending.get(songUrl);

      const request = fetch(songUrl)
        .then(readJson)
        .then(data => {
          cache.set(songUrl, { data, expiresAt: Date.now() + SONG_CACHE_TTL });
          if (cache.size > SONG_CACHE_LIMIT) cache.delete(cache.keys().next().value);
          return data;
        })
        .finally(() => {
          if (pending.get(songUrl) === request) pending.delete(songUrl);
        });
      pending.set(songUrl, request);
      return request;
    }

    fetchSongs()
      .then(async data => {
        if (!active || requestId !== requestIdRef.current) return;
        if (data.source === 'fallback') {
          setSongs([]);
          setLibraryError('iTunes API ไม่พร้อมใช้งาน จึงไม่แสดงข้อมูลสำรองใน Music Library');
          return;
        }
        const actualSongs = uniqueApiSongs(Array.isArray(data.data) ? data.data : []);
        setSongs(actualSongs);
        setRecentlyDiscovered(current => uniqueApiSongs([...actualSongs, ...current]).slice(0, 8));
        setHasMore(data.hasMore === true);
        setLoadMoreError(data.failedQueries?.length
          ? 'โหลดผลลัพธ์ได้บางส่วน รายการที่แสดงมาจากคำค้นหาที่สำเร็จ ลองชุดนี้อีกครั้งเพื่อค้นหาส่วนที่เหลือ'
          : '');
        const apiGenres = new Set(actualSongs.map(song => song.apiGenre).filter(Boolean));
        setSelectedGenre(current => current !== 'all' && !apiGenres.has(current) ? 'all' : current);
        setNotice('');
        if (searchTerm) {
          rememberSuccessfulSearch(searchTerm);
        }
      })
      .catch(error => {
        if (active && requestId === requestIdRef.current) {
          const message = userErrorMessage(error, 'โหลดเพลงไม่สำเร็จ กรุณาลองอีกครั้ง');
          if (loadingMore) setLoadMoreError(message);
          else setLibraryError(message);
        }
      })
      .finally(() => {
        if (active && requestId === requestIdRef.current) {
          setLibraryLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      });

    return () => {
      active = false;
      loadingMoreRef.current = false;
    };
  }, [searchTerm, mood, sort, retryToken, songUrl]);

  const genres = useMemo(() => {
    return uniqueGenres(songs);
  }, [songs]);

  useEffect(() => {
    if (playbackTrack && audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(error => {
        setQueueActive(false);
        setQueueStatus(userErrorMessage(error, 'เล่นเสียงไม่ได้ กรุณาลองอีกครั้ง'));
      });
    }
  }, [playbackTrack]);

  function rememberSearch(term) {
    const value = term.trim();
    setSearchPage(0);
    setCatalogPage(0);
    setLoadingMore(false);
    setLoadMoreError('');
    if (!value) {
      setSearchDraft('');
      setSearchTerm('');
      return;
    }
    setSearchDraft(value);
    setSearchTerm(value);
  }

  function rememberSuccessfulSearch(term) {
    const next = [term, ...searchHistoryRef.current.filter(item => item.toLowerCase() !== term.toLowerCase())]
      .slice(0, SEARCH_HISTORY_LIMIT);
    searchHistoryRef.current = next;
    setSearchHistory(next);
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch (error) {
      setNotice('บันทึกประวัติการค้นหาไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์');
    }
  }

  function clearSearchHistory() {
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
      searchHistoryRef.current = [];
      setSearchHistory([]);
      setNotice('');
    } catch (error) {
      setNotice('ล้างประวัติการค้นหาไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  }

  async function addToQueue(song) {
    if (queueBusyRef.current) {
      setNotice('กำลังดำเนินการกับคิว กรุณารอสักครู่');
      return;
    }
    queueBusyRef.current = true;
    setQueueBusy(true);
    try {
      await readJson(await fetch('/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: song.id }),
      }));
      await refreshCollections();
      setQueueStatus(`เพิ่ม “${song.title}” เข้าคิวแล้ว`);
      setNotice('เพิ่มเพลงเข้าคิวสำเร็จ');
    } catch (error) {
      setNotice(`เพิ่มเพลงเข้าคิวไม่สำเร็จ: ${userErrorMessage(error, 'กรุณาลองอีกครั้ง')}`);
    } finally {
      queueBusyRef.current = false;
      setQueueBusy(false);
    }
  }

  async function removeFromQueue(index) {
    if (queueBusyRef.current) {
      setNotice('กำลังดำเนินการกับคิว กรุณารอสักครู่');
      return;
    }
    queueBusyRef.current = true;
    setQueueBusy(true);
    try {
      const response = await fetch(`/watchlist/items/${index}`, { method: 'DELETE' });
      const result = await readJson(response);
      await refreshCollections();
      setQueueStatus(result.message);
      setNotice(result.message);
    } catch (error) {
      setNotice(`นำเพลงออกจากคิวไม่สำเร็จ: ${userErrorMessage(error, 'กรุณาลองอีกครั้ง')}`);
    } finally {
      queueBusyRef.current = false;
      setQueueBusy(false);
    }
  }

  async function clearQueue() {
    if (queueBusyRef.current) {
      setNotice('กำลังดำเนินการกับคิว กรุณารอสักครู่');
      return;
    }
    queueBusyRef.current = true;
    setQueueBusy(true);
    try {
      const result = await readJson(await fetch('/watchlist', { method: 'DELETE' }));
      await refreshCollections();
      setQueueStatus(result.message);
      setNotice(result.message);
    } catch (error) {
      setNotice(`ล้างคิวไม่สำเร็จ: ${userErrorMessage(error, 'กรุณาลองอีกครั้ง')}`);
    } finally {
      queueBusyRef.current = false;
      setQueueBusy(false);
    }
  }

  const playNextQueuedTrack = useCallback(async () => {
    if (queueBusyRef.current) return;
    queueBusyRef.current = true;
    setQueueBusy(true);
    try {
      while (true) {
        const response = await fetch('/watchlist/process', { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 400) {
            setQueueActive(false);
            setPlaybackTrack(null);
            setQueueStatus('เล่นครบทุกเพลงในคิวแล้ว');
            await refreshCollections();
            return;
          }
          throw new Error(result.error || 'เล่นคิวไม่สำเร็จ');
        }
        await refreshCollections();
        if (!result.song?.preview) {
          setQueueStatus(`${result.song?.title || 'เพลงนี้'} ไม่มีตัวอย่างเสียง กำลังข้ามไปเพลงถัดไป…`);
          continue;
        }
        setPlaybackTrack(result.song);
        setQueueStatus(`กำลังเล่น: ${result.song.title}`);
        return;
      }
    } catch (error) {
      setQueueActive(false);
      setQueueStatus('เล่นคิวไม่สำเร็จ');
      setNotice(`เล่นคิวไม่สำเร็จ: ${userErrorMessage(error, 'กรุณาลองอีกครั้ง')}`);
    } finally {
      queueBusyRef.current = false;
      setQueueBusy(false);
    }
  }, [refreshCollections]);

  async function undoLastAction() {
    if (queueBusyRef.current || history.length === 0) return;
    queueBusyRef.current = true;
    setQueueBusy(true);
    try {
      const result = await readJson(await fetch('/undo', { method: 'POST' }));
      await refreshCollections();
      setQueueStatus(result.message);
      setNotice(result.message);
    } catch (error) {
      const message = userErrorMessage(error, 'Undo ไม่สำเร็จ กรุณาลองอีกครั้ง');
      setQueueStatus(message);
      setNotice(message);
    } finally {
      queueBusyRef.current = false;
      setQueueBusy(false);
    }
  }

  function playPreview(song) {
    setQueueActive(false);
    setPlaybackTrack(song);
    setQueueStatus(`กำลังเล่นตัวอย่าง: ${song.title} · คิวที่เหลือยังอยู่`);
  }

  function stopQueuePlayback() {
    setQueueActive(false);
    setPlaybackTrack(null);
    if (audioRef.current) audioRef.current.pause();
    setQueueStatus('หยุดเล่นแล้ว · เพลงที่เหลือยังอยู่ในคิว');
  }

  function loadMoreSongs() {
    if (libraryLoading || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError('');
    if (loadMoreError) setRetryToken(token => token + 1);
    else if (searchTerm) setSearchPage(page => page + 1);
    else setCatalogPage(page => page + 1);
  }

  function retryLibrary() {
    if ((catalogPage > 0 && !searchTerm || searchTerm && searchPage > 0) && songs.length > 0) {
      setLoadingMore(true);
      setLoadMoreError('');
    }
    setRetryToken(token => token + 1);
  }

  function handleAudioEnded() {
    if (queueActive) playNextQueuedTrack();
    else setPlaybackTrack(null);
  }

  return (
    <div className={`app-layout${playbackTrack ? ' player-active' : ''}`}>
      <Navbar />
      <div className="app-content">
        <main className="app-shell">
          <DiscoverPage
            mood={mood}
            loadedCount={songs.length}
            songs={songs}
            recentlyDiscovered={recentlyDiscovered}
            loading={libraryLoading}
            error={libraryError}
            onRetry={retryLibrary}
            search={{
              value: searchDraft,
              loading: libraryLoading && Boolean(searchTerm) && !loadingMore,
              history: searchHistory,
              onChange: value => {
                loadingMoreRef.current = false;
                setSearchDraft(value);
                setCatalogPage(0);
                setLoadingMore(false);
                setLoadMoreError('');
              },
              onSubmit: event => {
                event.preventDefault();
                loadingMoreRef.current = false;
                setSearchPage(0);
                setCatalogPage(0);
                setLoadingMore(false);
                setLoadMoreError('');
                setSearchTerm(searchDraft.trim());
              },
              onClear: () => {
                loadingMoreRef.current = false;
                setSearchPage(0);
                setCatalogPage(0);
                setLoadingMore(false);
                setLoadMoreError('');
                setSearchDraft('');
                setSearchTerm('');
              },
              onSelectHistory: rememberSearch,
              onClearHistory: clearSearchHistory,
            }}
            moods={moods}
            moodsLoading={moodsLoading}
            moodsError={moodsError}
            onRetryMoods={() => setMoodsRetryToken(token => token + 1)}
            onSelectMood={value => {
              loadingMoreRef.current = false;
              setCatalogPage(0);
              setLoadingMore(false);
              setLoadMoreError('');
              setMood(value);
            }}
            onOpenSong={setModalSong}
            onPreview={playPreview}
            onQueue={addToQueue}
            queueBusy={queueBusy}
          />
          {notice && <div className="notice" role="alert"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="ปิดข้อความ">×</button></div>}
          <div className="content-grid">
            <MusicLibrary
              songs={songs}
              loading={libraryLoading && !loadingMore}
              loadingMore={loadingMore}
              error={libraryError}
              searchTerm={searchTerm}
              loadedCount={songs.length}
              genres={genres}
              selectedGenre={selectedGenre}
              sort={sort}
              onGenreChange={setSelectedGenre}
              onSortChange={setSort}
              onRetry={retryLibrary}
              hasMore={hasMore}
              loadMoreError={loadMoreError}
              onLoadMore={loadMoreSongs}
              onClearSearch={() => {
                loadingMoreRef.current = false;
                setSearchPage(0);
                setCatalogPage(0);
                setLoadingMore(false);
                setLoadMoreError('');
                setSearchDraft('');
                setSearchTerm('');
              }}
              onOpenSong={setModalSong}
              onPreview={playPreview}
              onQueue={addToQueue}
              queueBusy={queueBusy}
            />
            <aside className="sidebar">
              <QueuePanel
                queue={queue}
                status={queueStatus}
                busy={queueBusy}
                loading={collectionsLoading}
                error={collectionsError}
                onRetry={() => refreshCollections({ showLoading: true }).catch(error => setNotice(userErrorMessage(error, 'โหลดคิวหรือประวัติไม่สำเร็จ กรุณาลองอีกครั้ง')))}
                onPlay={() => {
                  setQueueActive(true);
                  playNextQueuedTrack();
                }}
                onStop={stopQueuePlayback}
                onRemoveNext={playNextQueuedTrack}
                onRemoveSong={removeFromQueue}
                onClear={clearQueue}
              />
              <HistoryPanel
                history={history}
                busy={queueBusy}
                loading={collectionsLoading}
                error={collectionsError}
                onRetry={() => refreshCollections({ showLoading: true }).catch(error => setNotice(userErrorMessage(error, 'โหลดคิวหรือประวัติไม่สำเร็จ กรุณาลองอีกครั้ง')))}
                onUndo={undoLastAction}
              />
            </aside>
          </div>
        </main>
        <footer className="site-footer">Music Mood Explorer <span>·</span> ค้นพบเสียงเพลงในแบบของคุณ</footer>
      </div>
      {playbackTrack && (
        <section className="now-playing" aria-label="เครื่องเล่นเพลง">
          {playbackTrack.image && <img className="mini-player-art" src={playbackTrack.image} alt="" />}
          <div className="mini-player-track"><span className="section-kicker">NOW PLAYING</span><strong>{playbackTrack.title}</strong><small>{playbackTrack.artist}</small></div>
          <audio
            ref={audioRef}
            controls
            autoPlay
            src={`/preview/${encodeURIComponent(playbackTrack.id)}`}
            onEnded={handleAudioEnded}
            onError={() => {
              if (queueActive) {
                setQueueActive(false);
                setQueueStatus('เล่นเพลงไม่สำเร็จ · ลองเริ่มคิวอีกครั้ง');
              }
            }}
            aria-label={`เล่นตัวอย่าง ${playbackTrack.title}`}
          />
        </section>
      )}
      <SongModal
        song={modalSong}
        onClose={() => setModalSong(null)}
        onPreview={playPreview}
        playingSong={playbackTrack}
      />
    </div>
  );
}
