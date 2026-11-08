export function uniqueApiSongs(songs) {
  const songsById = new Map();
  for (const song of songs) {
    if (song.apiId === null || song.apiId === undefined) continue;
    const id = String(song.apiId);
    if (!songsById.has(id)) songsById.set(id, song);
  }
  return [...songsById.values()];
}

export function uniqueGenres(songs) {
  const genres = new Set(songs.map(song => song.apiGenre).filter(Boolean));
  return [...genres].sort((a, b) => a.localeCompare(b));
}
