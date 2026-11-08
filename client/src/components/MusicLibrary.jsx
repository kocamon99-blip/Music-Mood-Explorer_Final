import React from 'react';
import EmptyState from './EmptyState.jsx';
import ErrorState from './ErrorState.jsx';
import GenreFilter from './GenreFilter.jsx';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import SongCard from './SongCard.jsx';

export default function MusicLibrary({
  songs,
  loading,
  loadingMore,
  error,
  searchTerm,
  loadedCount,
  genres,
  selectedGenre,
  sort,
  onGenreChange,
  onSortChange,
  onRetry,
  hasMore,
  loadMoreError,
  onLoadMore,
  onOpenSong,
  onPreview,
  onQueue,
  queueBusy,
  onClearSearch,
}) {
  const visibleSongs = selectedGenre === 'all'
    ? songs
    : songs.filter(song => song.apiGenre === selectedGenre);

  return (
    <section className="panel library-panel" id="library" aria-labelledby="library-title">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">DISCOVER</span>
          <h2 id="library-title">Music Library</h2>
        </div>
        <span className="loaded-count" aria-live="polite">
          {loading || loadingMore
            ? `กำลังโหลด · ${loadedCount} รายการพร้อมใช้งาน`
            : `${visibleSongs.length} ผลลัพธ์ · โหลดแล้ว ${loadedCount} รายการ`}
        </span>
      </div>
      <div className="library-controls">
        <GenreFilter genres={genres} value={selectedGenre} onChange={onGenreChange} />
        <label className="genre-filter">
          <span className="muted small">เรียงตาม</span>
          <select value={sort} onChange={event => onSortChange(event.target.value)} aria-label="วิธีเรียงเพลง">
            <option value="selection">Selection Sort</option>
            <option value="insertion">Insertion Sort</option>
            <option value="bubble">Bubble Sort</option>
          </select>
        </label>
      </div>
      {loading && songs.length === 0 && !error
          ? <LoadingSkeleton />
          : <>
              {error && <ErrorState
                title="โหลดผลลัพธ์ไม่สำเร็จ"
                message={songs.length ? `${error} ผลลัพธ์ก่อนหน้ายังคงแสดงอยู่` : error}
                onRetry={onRetry}
              />}
              {loading && songs.length > 0 && (
                <p className="results-loading" role="status">กำลังอัปเดตเพลง · ผลลัพธ์ที่โหลดไว้ยังแสดงอยู่</p>
              )}
              {visibleSongs.length === 0 && !error && !loading
                ? <EmptyState
                title={selectedGenre !== 'all' && songs.length ? 'ไม่มีเพลงในประเภทนี้' : 'ยังไม่พบเพลง'}
                message={songs.length
                  ? 'ลองเลือกประเภทเพลงอื่น'
                  : searchTerm
                    ? `ไม่พบเพลงที่ตรงกับ “${searchTerm}” ลองคำค้นหาอื่นหรือแก้การสะกด`
                    : 'ลองเลือกอารมณ์เพลงอื่นเพื่อค้นพบเพลงเพิ่มเติม'}
                actionLabel={!songs.length && searchTerm ? 'ล้างคำค้นหา' : undefined}
                onAction={!songs.length && searchTerm ? onClearSearch : undefined}
              />
                : visibleSongs.length > 0 && <div className="song-grid" aria-busy={loading}>
                {visibleSongs.map(song => (
                  <SongCard
                    key={song.apiId}
                    song={song}
                    onOpen={onOpenSong}
                    onPreview={onPreview}
                    onQueue={onQueue}
                    queueBusy={queueBusy}
                  />
                ))}
              </div>}
            </>}
      {!loading && !error && songs.length > 0 && (
        <p className="results-note">{selectedGenre === 'all' ? `แสดง ${visibleSongs.length} จาก ${loadedCount} เพลงจริงที่ได้รับจาก API` : `แสดง ${visibleSongs.length} จาก ${loadedCount} เพลงที่โหลด`}</p>
      )}
      {loadingMore && (
        <p className="results-loading" role="status" aria-live="polite">กำลังโหลดชุดเพลงเพิ่มเติม…</p>
      )}
      {loadMoreError && (
        <p className="load-more-error" role="alert">{loadMoreError}</p>
      )}
      {hasMore && !error && (
        <div className="load-more-area">
          <button className="button button-primary" type="button" onClick={onLoadMore} disabled={loading || loadingMore} aria-busy={loadingMore}>
            {loadingMore ? 'กำลังโหลดเพลงเพิ่มเติม…' : loadMoreError ? 'ลองโหลดชุดนี้อีกครั้ง' : 'โหลดเพลงเพิ่มเติม'}
          </button>
        </div>
      )}
      {!hasMore && !loading && !error && songs.length > 0 && (
        <p className="results-note">
          {searchTerm
            ? 'ค้นหาครบทุกหมวดของ iTunes Search ที่รองรับแล้ว'
            : 'โหลดครบทุกชุดคำค้นหาที่มีสำหรับอารมณ์นี้แล้ว'}
        </p>
      )}
    </section>
  );
}
