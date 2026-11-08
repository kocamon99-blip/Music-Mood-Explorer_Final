const test = require('node:test');
const assert = require('node:assert/strict');
const { CatalogBatchError, createCatalog, mergeTrackResults } = require('../catalog');

function track(trackId, title = `track-${trackId}`) {
  return { trackId, trackName: title };
}

test('Map merge keeps one real track per trackId and ignores missing IDs', () => {
  const merged = mergeTrackResults([
    [track(1), track(2)],
    [track('1', 'duplicate'), track(null, 'missing')],
  ]);
  assert.deepEqual(merged.map(item => item.trackName), ['track-1', 'track-2']);
});

test('catalog pages merge distinct query results and reuse cached earlier batches', async () => {
  const calls = [];
  const catalog = createCatalog({
    moodQueryBatches: { chill: [['chill pop', 'lofi'], ['ambient', 'acoustic']] },
    fetchImpl: async url => {
      const term = new URL(url).searchParams.get('term');
      calls.push(term);
      const data = {
        'chill pop': [track(1), track(2)],
        lofi: [track(2), track(3)],
        ambient: [track(3), track(4)],
        acoustic: [track(5)],
      };
      return { ok: true, json: async () => ({ results: data[term] }) };
    },
  });

  const first = await catalog.loadMoodBatch('chill', 0, (item, mood) => ({ ...item, mood }));
  assert.deepEqual(first.data.map(item => item.trackId), [1, 2, 3]);
  assert.equal(first.hasMore, true);
  const second = await catalog.loadMoodBatch('chill', 1, (item, mood) => ({ ...item, mood }));
  assert.deepEqual(second.data.map(item => item.trackId), [1, 2, 3, 4, 5]);
  assert.equal(second.hasMore, false);
  assert.equal(calls.length, 4);
});

test('catalog returns successful mood tracks after partial failures and retries failed queries only', async () => {
  let retryCount = 0;
  const successfulCalls = [];
  const catalog = createCatalog({
    moodQueryBatches: { happy: [['good pop', 'dance']] },
    fetchImpl: async url => {
      const term = new URL(url).searchParams.get('term');
      if (term === 'dance' && retryCount++ === 0) throw new Error('temporary failure');
      successfulCalls.push(term);
      return { ok: true, json: async () => ({ results: [track(7), track(term)] }) };
    },
  });

  const partial = await catalog.loadMoodBatch('happy', 0, item => item);
  assert.deepEqual(partial.data.map(item => item.trackId), [7, 'good pop']);
  assert.deepEqual(partial.failedQueries, ['dance']);
  assert.equal(partial.hasMore, true);
  const retry = await catalog.loadMoodBatch('happy', 0, item => item);
  assert.equal(retry.data.length, 3);
  assert.deepEqual(retry.failedQueries, []);
  assert.deepEqual(successfulCalls.sort(), ['dance', 'good pop']);
});

test('catalog limits concurrent upstream calls', async () => {
  let active = 0;
  let maxActive = 0;
  const catalog = createCatalog({
    moodQueryBatches: { focus: [['one', 'two'], ['three', 'four']] },
    maxConcurrent: 2,
    fetchImpl: async url => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      const term = new URL(url).searchParams.get('term');
      return { ok: true, json: async () => ({ results: [track(term)] }) };
    },
  });

  await catalog.loadMoodBatch('focus', 1, item => item);
  assert.equal(maxActive, 2);
});

test('catalog does not cache failed API responses', async () => {
  let calls = 0;
  const catalog = createCatalog({
    moodQueryBatches: { energy: [['workout']] },
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 503 };
    },
  });
  await assert.rejects(catalog.loadMoodBatch('energy', 0, item => item), CatalogBatchError);
  await assert.rejects(catalog.loadMoodBatch('energy', 0, item => item), CatalogBatchError);
  assert.equal(calls, 2);
});

test('catalog converts upstream timeouts into retryable batch failures', async () => {
  const catalog = createCatalog({
    moodQueryBatches: { chill: [['slow query']] },
    requestTimeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  });

  await assert.rejects(catalog.loadMoodBatch('chill', 0, item => item), CatalogBatchError);
});

test('search batches support Thai terms, field attributes, partial matching, and unique track IDs', async () => {
  const calls = [];
  const catalog = createCatalog({
    fetchImpl: async url => {
      const params = new URL(url).searchParams;
      const attribute = params.get('attribute') || 'general';
      calls.push({ term: params.get('term'), attribute, limit: params.get('limit') });
      const results = {
        general: [track(21, 'เพลงไทย เพลงใหม่'), track(22, 'เพลงไทย รวมเพลง')],
        songTerm: [track(22, 'เพลงไทย duplicate'), track(23, 'เพลงไทย บางส่วน')],
        artistTerm: [track(24, 'เพลงรักของ artist')],
        albumTerm: [track(25, 'เพลงไทย อัลบั้ม')],
      };
      return { ok: true, json: async () => ({ results: results[attribute] }) };
    },
  });
  const normalize = item => item;

  const first = await catalog.loadSearchBatch('เพลงไทย', 0, normalize);
  const second = await catalog.loadSearchBatch('เพลงไทย', 1, normalize);
  assert.deepEqual(first.data.map(item => item.trackId), [21, 22]);
  assert.deepEqual(second.data.map(item => item.trackId), [21, 22, 23, 25]);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(calls.every(call => call.term === 'เพลงไทย' && call.limit === '200'), true);
  assert.deepEqual(calls.map(call => call.attribute), ['general', 'songTerm', 'artistTerm', 'albumTerm']);

  const artist = await catalog.loadSearchBatch('artist', 1, normalize);
  assert.ok(artist.data.some(item => item.trackId === 24));
  assert.equal(calls.some(call => call.attribute === 'artistTerm' && call.term === 'artist'), true);
});

test('search batches return successful results after a partial failure and retry only failed terms', async () => {
  const calls = [];
  let shouldFail = true;
  const catalog = createCatalog({
    fetchImpl: async url => {
      const params = new URL(url).searchParams;
      const attribute = params.get('attribute') || 'general';
      calls.push(attribute);
      if (attribute === 'songTerm' && shouldFail) {
        shouldFail = false;
        throw new Error('temporary search failure');
      }
      const results = attribute === 'general'
        ? [track(31, 'Retry Song')]
        : [track(31, 'Duplicate Retry Song'), track(32, 'Retry Song Two')];
      return { ok: true, json: async () => ({ results }) };
    },
  });
  const normalize = item => item;

  const partial = await catalog.loadSearchBatch('Retry', 1, normalize);
  assert.deepEqual(partial.data.map(item => item.trackId), [31, 32]);
  assert.deepEqual(partial.failedQueries, ['songTerm']);
  assert.equal(partial.hasMore, true);

  const retried = await catalog.loadSearchBatch('Retry', 1, normalize);
  assert.deepEqual(retried.data.map(item => item.trackId), [31, 32]);
  assert.deepEqual(retried.failedQueries, []);
  assert.deepEqual(calls, ['general', 'songTerm', 'artistTerm', 'albumTerm', 'songTerm']);
});

test('English title, artist, and album searches use supported iTunes attributes case-insensitively', async () => {
  const calls = [];
  const catalog = createCatalog({
    fetchImpl: async url => {
      const params = new URL(url).searchParams;
      const term = params.get('term');
      const attribute = params.get('attribute') || 'general';
      calls.push({ term, attribute });
      const results = {
        general: [{ ...track(41, 'Instant Crush'), artistName: 'Daft Punk' }],
        songTerm: [{ ...track(42, 'Daft Punk Song'), artistName: 'Artist' }],
        artistTerm: [{ ...track(43, 'Digital Love'), artistName: 'Daft Punk' }],
        albumTerm: [{ ...track(44, 'Discovery Track'), collectionName: 'Daft Punk Discovery' }],
      };
      return { ok: true, json: async () => ({ results: results[attribute] }) };
    },
  });
  const first = await catalog.loadSearchBatch('DAFT PUNK', 0, item => item);
  assert.deepEqual(first.data.map(item => item.trackId), [41]);
  const tokenResults = await catalog.loadSearchBatch('DAFT PUNK', 1, item => item);
  assert.deepEqual(tokenResults.data.map(item => item.trackId), [41]);
  assert.equal(tokenResults.hasMore, true);
  const fieldResults = await catalog.loadSearchBatch('DAFT PUNK', 2, item => item);
  assert.deepEqual(fieldResults.data.map(item => item.trackId), [41, 42, 43, 44]);
  assert.equal(fieldResults.hasMore, false);
  assert.deepEqual(calls.map(call => call.term), ['DAFT PUNK', 'DAFT', 'PUNK', 'DAFT PUNK', 'DAFT PUNK', 'DAFT PUNK']);
  assert.deepEqual(calls.map(call => call.attribute), ['general', 'general', 'general', 'songTerm', 'artistTerm', 'albumTerm']);
});
