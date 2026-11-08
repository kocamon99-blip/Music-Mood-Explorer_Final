import React from 'react';
import EmptyState from './EmptyState.jsx';
import ErrorState from './ErrorState.jsx';
import HeroSection from './HeroSection.jsx';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import MoodSelector from './MoodSelector.jsx';
import SearchBar from './SearchBar.jsx';
import SongCard from './SongCard.jsx';

function TrackGrid({ songs, onOpenSong, onPreview, onQueue, queueBusy }) {
  return (
    <div className="song-grid discover-track-grid">
      {songs.map(song => (
        <SongCard
          key={song.apiId}
          song={song}
          onOpen={onOpenSong}
          onPreview={onPreview}
          onQueue={onQueue}
          queueBusy={queueBusy}
        />
      ))}
    </div>
  );
}

function TrackSection({
  id,
  title,
  kicker,
  note,
  songs,
  loading,
  error,
  emptyTitle,
  emptyMessage,
  onRetry,
  onOpenSong,
  onPreview,
  onQueue,
  queueBusy,
}) {
  return (
    <section className="discover-track-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="discover-section-heading">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        {note && <p>{note}</p>}
      </div>
      {loading && songs.length === 0
        ? <LoadingSkeleton count={4} />
        : error
          ? <>
              <ErrorState
                message={songs.length ? `${error} ผลลัพธ์ก่อนหน้ายังคงแสดงอยู่` : error}
                onRetry={onRetry}
              />
              {songs.length > 0 && <TrackGrid
                songs={songs}
                onOpenSong={onOpenSong}
                onPreview={onPreview}
                onQueue={onQueue}
                queueBusy={queueBusy}
              />}
            </>
          : loading
            ? <>
                <p className="results-loading" role="status">กำลังอัปเดตผลลัพธ์ · เพลงที่โหลดไว้ยังแสดงอยู่</p>
                <TrackGrid
                  songs={songs}
                  onOpenSong={onOpenSong}
                  onPreview={onPreview}
                  onQueue={onQueue}
                  queueBusy={queueBusy}
                />
              </>
            : songs.length
              ? <TrackGrid
                  songs={songs}
                  onOpenSong={onOpenSong}
                  onPreview={onPreview}
                  onQueue={onQueue}
                  queueBusy={queueBusy}
                />
              : <EmptyState title={emptyTitle} message={emptyMessage} />}
    </section>
  );
}

export default function DiscoverPage({
  mood,
  loadedCount,
  songs,
  recentlyDiscovered,
  loading,
  error,
  onRetry,
  search,
  moods,
  moodsLoading,
  moodsError,
  onRetryMoods,
  onSelectMood,
  onOpenSong,
  onPreview,
  onQueue,
  queueBusy,
}) {
  const featuredSongs = songs.slice(0, 4);
  const recommendedSongs = songs.slice(4, 8);
  const recentSongs = recentlyDiscovered.slice(0, 4);
  const trackActions = { onOpenSong, onPreview, onQueue, queueBusy };

  return (
    <div className="discover-page" id="discover">
      <HeroSection mood={mood} loadedCount={loadedCount} />

      <section className="discover-search-card" aria-label="Search music">
        <div className="search-card-heading">
          <span className="section-kicker">FIND YOUR NEXT FAVORITE</span>
          <p>Search real tracks, artists, albums, and genres.</p>
        </div>
        <SearchBar {...search} />
      </section>

      <MoodSelector
        moods={moods}
        selectedMood={mood}
        onSelect={onSelectMood}
        loading={moodsLoading}
        error={moodsError}
        onRetry={onRetryMoods}
      />

      <div className="discover-track-shelves">
        <TrackSection
          id="featured-tracks"
          title="Featured tracks"
          kicker="IN THE SPOTLIGHT"
          note="Real results from your current discovery."
          songs={featuredSongs}
          loading={loading}
          error={error}
          emptyTitle="No tracks yet"
          emptyMessage="Choose a mood or search to discover real tracks."
          onRetry={onRetry}
          {...trackActions}
        />
        <TrackSection
          id="recommended-tracks"
          title="Recommended for you"
          kicker="MORE TO EXPLORE"
          note="Selected from the loaded API results—not a popularity ranking."
          songs={recommendedSongs}
          loading={loading}
          emptyTitle="More music awaits"
          emptyMessage="Load more tracks or try another mood to see additional recommendations."
          {...trackActions}
        />
        <TrackSection
          id="recently-discovered"
          title="Recently discovered"
          kicker="FROM THIS SESSION"
          note="Tracks successfully returned by the API in this session."
          songs={recentSongs}
          loading={loading && recentSongs.length === 0}
          emptyTitle="Your discoveries will appear here"
          emptyMessage="Search or explore a mood. Only real tracks returned during this session are shown."
          {...trackActions}
        />
      </div>
    </div>
  );
}
