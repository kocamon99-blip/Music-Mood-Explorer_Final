const MOOD_QUERY_BATCHES = {
  chill: [
    ['chill pop', 'lofi beats'],
    ['acoustic chill', 'ambient music'],
    ['Norah Jones', 'soft rock'],
  ],
  happy: [
    ['feel good pop', 'upbeat music'],
    ['dance pop', 'disco hits'],
    ['Katy Perry', 'upbeat indie'],
  ],
  sad: [
    ['sad acoustic', 'piano ballads'],
    ['Adele ballads', 'sad pop'],
    ['Billie Eilish', 'alternative ballads'],
  ],
  focus: [
    ['instrumental focus', 'study music'],
    ['classical piano', 'ambient instrumental'],
    ['lofi hip hop', 'jazz instrumental'],
  ],
  energy: [
    ['workout music', 'rock anthems'],
    ['electronic dance', 'dance hits'],
    ['The Weeknd', 'pop hits'],
  ],
};

const SEARCH_FIELD_ATTRIBUTES = ['songTerm', 'artistTerm', 'albumTerm'];

function createSearchBatches(searchTerm) {
  const term = searchTerm.trim();
  const normalizedTerm = term.toLocaleLowerCase();
  const keywordQueries = [...new Set(term.split(/\s+/).filter(Boolean))]
    .filter(keyword => keyword.toLocaleLowerCase() !== normalizedTerm)
    .map(keyword => ({ term: keyword, attribute: null }));
  const batches = [[{ term, attribute: null }]];

  if (keywordQueries.length) batches.push(keywordQueries);
  batches.push(SEARCH_FIELD_ATTRIBUTES.map(attribute => ({ term, attribute })));
  return batches;
}

class CatalogBatchError extends Error {
  constructor(failedQueries) {
    super(`iTunes catalog queries failed: ${failedQueries.join(', ')}`);
    this.name = 'CatalogBatchError';
    this.failedQueries = failedQueries;
  }
}

function mergeTrackResults(queryResults) {
  const tracksById = new Map();
  for (const results of queryResults) {
    for (const track of results) {
      if (track.trackId === null || track.trackId === undefined) continue;
      const id = String(track.trackId);
      if (!tracksById.has(id)) tracksById.set(id, track);
    }
  }
  return [...tracksById.values()];
}

function createCatalog({
  apiUrl = 'https://itunes.apple.com/search',
  fetchImpl = (...args) => fetch(...args),
  moodQueryBatches = MOOD_QUERY_BATCHES,
  maxConcurrent = 2,
  maxRequestsPerMinute = 18,
  requestTimeoutMs = 15_000,
  cacheTtlMs = 10 * 60 * 1000,
  cacheLimit = 100,
} = {}) {
  const responseCache = new Map();
  const pendingRequests = new Map();
  const waiting = [];
  const requestStarts = [];
  let activeRequests = 0;

  async function acquireSlot() {
    if (activeRequests < maxConcurrent) {
      activeRequests++;
      return;
    }
    await new Promise(resolve => waiting.push(resolve));
  }

  function releaseSlot() {
    const next = waiting.shift();
    if (next) {
      next();
      return;
    }
    activeRequests--;
  }

  async function waitForRateSlot() {
    while (true) {
      const now = Date.now();
      while (requestStarts.length && requestStarts[0] <= now - 60_000) requestStarts.shift();
      if (requestStarts.length < maxRequestsPerMinute) {
        requestStarts.push(now);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, requestStarts[0] + 60_000 - now));
    }
  }

  function getCached(cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      responseCache.delete(cacheKey);
      return null;
    }
    responseCache.delete(cacheKey);
    responseCache.set(cacheKey, cached);
    return cached.results;
  }

  function cacheResponse(cacheKey, results) {
    responseCache.delete(cacheKey);
    responseCache.set(cacheKey, { results, expiresAt: Date.now() + cacheTtlMs });
    if (responseCache.size > cacheLimit) {
      responseCache.delete(responseCache.keys().next().value);
    }
  }

  function fetchTerm(term, attribute = null, limit = 50) {
    const cacheKey = JSON.stringify([term, attribute, limit]);
    const cached = getCached(cacheKey);
    if (cached) return Promise.resolve(cached);
    if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

    const request = (async () => {
      await acquireSlot();
      try {
        await waitForRateSlot();
        const params = new URLSearchParams({
          term,
          media: 'music',
          entity: 'song',
          limit: String(limit),
        });
        if (attribute) params.set('attribute', attribute);
        const url = `${apiUrl}?${params}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const response = await fetchImpl(url, { signal: controller.signal });
          if (!response.ok) throw new Error(`iTunes responded with status ${response.status}`);
          const data = await response.json();
          const results = Array.isArray(data.results) ? data.results : [];
          cacheResponse(cacheKey, results);
          return results;
        } finally {
          clearTimeout(timeout);
        }
      } finally {
        releaseSlot();
      }
    })();

    pendingRequests.set(cacheKey, request);
    request.then(
      () => {
        if (pendingRequests.get(cacheKey) === request) pendingRequests.delete(cacheKey);
      },
      () => {
        if (pendingRequests.get(cacheKey) === request) pendingRequests.delete(cacheKey);
      },
    );
    return request;
  }

  async function loadMoodBatch(mood, page, normalizeTrack) {
    const batches = moodQueryBatches[mood];
    if (!batches) throw new RangeError(`Unsupported mood: ${mood}`);
    if (!Number.isInteger(page) || page < 0 || page >= batches.length) {
      throw new RangeError(`Invalid catalog page: ${page}`);
    }

    const terms = batches.slice(0, page + 1).flat();
    const startedAt = performance.now();
    const settled = await Promise.allSettled(terms.map(term => fetchTerm(term)));
    const successfulResults = settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    const failedQueries = settled
      .map((result, index) => result.status === 'rejected' ? terms[index] : null)
      .filter(Boolean);
    if (failedQueries.length === terms.length) throw new CatalogBatchError(failedQueries);

    const tracks = mergeTrackResults(successfulResults);
    const data = tracks.map((track, index) => normalizeTrack(track, mood, index));
    return {
      data,
      apiMs: (performance.now() - startedAt).toFixed(3),
      catalogPage: page,
      failedQueries,
      hasMore: page < batches.length - 1 || failedQueries.length > 0,
    };
  }

  async function loadSearchBatch(searchTerm, page, normalizeTrack) {
    const term = typeof searchTerm === 'string' ? searchTerm.trim() : '';
    if (!term) throw new RangeError('A search term is required');
    const batches = createSearchBatches(term);
    if (!Number.isInteger(page) || page < 0 || page >= batches.length) {
      throw new RangeError(`Invalid search page: ${page}`);
    }

    const queries = batches.slice(0, page + 1).flat();
    const startedAt = performance.now();
    const settled = await Promise.allSettled(
      queries.map(query => fetchTerm(query.term, query.attribute, 200)),
    );
    const successfulResults = settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    const failedQueries = settled
      .map((result, index) => result.status === 'rejected'
        ? (queries[index].attribute || (queries[index].term === term ? 'general' : `keyword:${queries[index].term}`))
        : null)
      .filter(Boolean);
    if (failedQueries.length === queries.length) throw new CatalogBatchError(failedQueries);
    const tokens = term.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const tracks = mergeTrackResults(successfulResults).filter(track => {
      const fields = [track.trackName, track.artistName, track.collectionName, track.primaryGenreName]
        .filter(value => typeof value === 'string')
        .map(value => value.toLocaleLowerCase());
      return tokens.every(token => fields.some(field => field.includes(token)));
    });

    return {
      data: tracks.map((track, index) => normalizeTrack(track, 'chill', index)),
      apiMs: (performance.now() - startedAt).toFixed(3),
      searchPage: page,
      failedQueries,
      hasMore: page < batches.length - 1 || failedQueries.length > 0,
    };
  }

  return { loadMoodBatch, loadSearchBatch };
}

module.exports = {
  CatalogBatchError,
  MOOD_QUERY_BATCHES,
  SEARCH_FIELD_ATTRIBUTES,
  createCatalog,
  createSearchBatches,
  mergeTrackResults,
};
