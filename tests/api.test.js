const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const app = require('../server');

const nativeFetch = global.fetch;
const previewCacheDirectory = path.join(os.tmpdir(), 'music-mood-explorer-previews');
const apiTracks = [
  { trackId: 11, trackName: 'Short Song', artistName: 'Artist', trackTimeMillis: 100 },
  { trackId: 12, trackName: 'Long Song', artistName: 'Artist', trackTimeMillis: 900 },
  { trackId: 13, trackName: 'Middle Song', artistName: 'Artist', trackTimeMillis: 500 },
];

async function startApi(t, fetchImpl, options = {}) {
  app.resetForTests(options);
  global.fetch = fetchImpl;
  const server = app.listen(0);
  t.after(() => new Promise(resolve => {
    server.close(() => {
      global.fetch = nativeFetch;
      app.resetForTests();
      resolve();
    });
  }));
  await new Promise(resolve => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function createPcmWav() {
  const sampleRate = 8_000;
  const sampleCount = sampleRate / 4;
  const dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < sampleCount; index++) {
    wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * index / sampleRate) * 1200), 44 + index * 2);
  }
  return wav;
}

function previewSong(trackId, previewUrl = 'https://preview.test/audio') {
  return {
    trackId,
    trackName: `Test Fixture ${trackId}`,
    artistName: 'Mock Provider',
    previewUrl,
    trackTimeMillis: 250,
  };
}

function previewFixtureId(label) {
  return `test-${process.pid}-${Date.now()}-${label}`;
}

async function removePreviewCache(trackId) {
  await fs.rm(path.join(previewCacheDirectory, `${encodeURIComponent(String(trackId))}.mp3`), { force: true });
}

async function loadPreviewFixtures(baseUrl) {
  const response = await nativeFetch(`${baseUrl}/songs?mood=chill`);
  assert.equal(response.status, 200);
  return response.json();
}

test('legacy API contracts, Queue/History/Undo, and catalog paging remain compatible', async t => {
  let failAmbientOnce = true;
  let failArtistSearchOnce = true;
  const upstreamCalls = [];
  const searchCalls = [];
  const baseUrl = await startApi(t, async url => {
    const params = new URL(url).searchParams;
    const term = params.get('term') || '';
    const attribute = params.get('attribute') || 'general';
    upstreamCalls.push(term);
    if (term === 'upstream-error' || term === 'feel good pop' || term === 'upbeat music') {
      return { ok: false, status: 503 };
    }
    if (term === 'เพลงไทย') {
      searchCalls.push({ attribute, limit: params.get('limit') });
      if (attribute === 'artistTerm' && failArtistSearchOnce) {
        failArtistSearchOnce = false;
        return { ok: false, status: 503 };
      }
      const resultsByAttribute = {
        general: [{ ...apiTracks[0], trackId: 71, trackName: 'เพลงไทย เพลงหนึ่ง' }],
        songTerm: [
          { ...apiTracks[1], trackId: 71, trackName: 'เพลงไทย duplicate' },
          { ...apiTracks[2], trackId: 72, trackName: 'เพลงไทย เพลงสอง' },
        ],
        artistTerm: [{ ...apiTracks[1], trackId: 73, trackName: 'เพลงไทย Artist Song', artistName: 'เพลงไทย Artist' }],
        albumTerm: [{ ...apiTracks[2], trackId: 74, trackName: 'เพลงไทย Album Song', collectionName: 'เพลงไทย Album' }],
      };
      return { ok: true, json: async () => ({ results: resultsByAttribute[attribute] || [] }) };
    }
    if (term === 'ambient music' && failAmbientOnce) {
      failAmbientOnce = false;
      return { ok: false, status: 503 };
    }
    const resultsByTerm = {
      'chill pop': [
        { ...apiTracks[0], trackId: 11 },
        { ...apiTracks[1], trackId: 12 },
      ],
      'lofi beats': [
        { ...apiTracks[1], trackId: 12 },
        { ...apiTracks[2], trackId: 13 },
      ],
      'ambient music': [
        { ...apiTracks[2], trackId: 13 },
        { ...apiTracks[0], trackId: 14, trackName: 'Extra Song' },
      ],
      'acoustic chill': [
        { ...apiTracks[0], trackId: 14, trackName: 'Duplicate Extra Song' },
        { ...apiTracks[1], trackId: 15, trackName: 'New Song' },
      ],
    };
    return {
      ok: true,
      json: async () => ({ results: resultsByTerm[term] || apiTracks }),
    };
  });

  for (const sort of ['selection', 'insertion', 'bubble']) {
    for (const kind of ['mood', 'search']) {
      const params = new URLSearchParams({ sort });
      if (kind === 'mood') params.set('mood', 'chill');
      else params.set('search', 'Song');
      const response = await nativeFetch(`${baseUrl}/songs?${params}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(Object.keys(data), ['mood', 'search', 'source', 'algorithm', 'count', 'apiMs', 'ms', 'data']);
      assert.equal(data.algorithm, sort);
      assert.equal(data.count, 3);
      assert.ok(Number(data.apiMs) >= 0);
      assert.ok(Number(data.ms) >= 0);
      assert.deepEqual(data.data.map(item => item.duration), [900, 500, 100]);
    }
  }

  const queued = await nativeFetch(`${baseUrl}/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 11 }),
  });
  assert.equal(queued.status, 201);
  assert.equal((await queued.json()).size, 1);
  const history = await nativeFetch(`${baseUrl}/history`).then(response => response.json());
  assert.equal(history.size, 1);
  assert.equal(history.history[0].action, 'ADD');

  const processed = await nativeFetch(`${baseUrl}/watchlist/process`, { method: 'DELETE' });
  assert.equal((await processed.json()).song.id, 11);
  const undone = await nativeFetch(`${baseUrl}/undo`, { method: 'POST' });
  assert.equal(undone.status, 200);
  const queue = await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json());
  assert.equal(queue.size, 1);
  assert.equal(queue.items[0].id, 11);

  const firstBatchResponse = await nativeFetch(`${baseUrl}/songs?mood=chill&catalogPage=0`);
  const firstBatch = await firstBatchResponse.json();
  assert.equal(firstBatchResponse.status, 200);
  assert.equal(firstBatch.hasMore, true);
  assert.deepEqual(firstBatch.data.map(item => item.apiId), [12, 13, 11]);

  const partialBatchResponse = await nativeFetch(`${baseUrl}/songs?mood=chill&catalogPage=1`);
  const partialBatch = await partialBatchResponse.json();
  assert.equal(partialBatchResponse.status, 200);
  assert.deepEqual(partialBatch.failedQueries, ['ambient music']);
  assert.equal(partialBatch.hasMore, true);
  assert.deepEqual(partialBatch.data.map(item => item.apiId).sort(), [11, 12, 13, 14, 15]);
  const failedCalls = upstreamCalls.filter(term => term === 'chill pop' || term === 'lofi beats').length;
  assert.equal(failedCalls, 2);

  const retriedBatchResponse = await nativeFetch(`${baseUrl}/songs?mood=chill&catalogPage=1`);
  const retriedBatch = await retriedBatchResponse.json();
  assert.equal(retriedBatchResponse.status, 200);
  assert.equal(retriedBatch.hasMore, true);
  assert.equal(new Set(retriedBatch.data.map(item => String(item.apiId))).size, retriedBatch.count);
  assert.deepEqual(retriedBatch.data.map(item => item.apiId).sort(), [11, 12, 13, 14, 15]);
  assert.equal(upstreamCalls.filter(term => term === 'chill pop' || term === 'lofi beats').length, 2);

  const invalidPage = await nativeFetch(`${baseUrl}/songs?mood=chill&catalogPage=not-a-page`);
  assert.equal(invalidPage.status, 400);

  const firstSearchResponse = await nativeFetch(`${baseUrl}/songs?search=${encodeURIComponent('เพลงไทย')}&searchPage=0`);
  const firstSearch = await firstSearchResponse.json();
  assert.equal(firstSearchResponse.status, 200);
  assert.equal(firstSearch.searchPage, 0);
  assert.equal(firstSearch.hasMore, true);
  assert.deepEqual(firstSearch.failedQueries, []);
  assert.deepEqual(firstSearch.data.map(item => item.apiId), [71]);

  const partialSearchResponse = await nativeFetch(`${baseUrl}/songs?search=${encodeURIComponent('เพลงไทย')}&searchPage=1`);
  const partialSearch = await partialSearchResponse.json();
  assert.equal(partialSearchResponse.status, 200);
  assert.deepEqual(partialSearch.failedQueries, ['artistTerm']);
  assert.equal(partialSearch.hasMore, true);
  assert.deepEqual(partialSearch.data.map(item => item.apiId).sort(), [71, 72, 74]);
  assert.equal(new Set(partialSearch.data.map(item => String(item.apiId))).size, partialSearch.count);

  const retriedSearchResponse = await nativeFetch(`${baseUrl}/songs?search=${encodeURIComponent('เพลงไทย')}&searchPage=1`);
  const retriedSearch = await retriedSearchResponse.json();
  assert.equal(retriedSearchResponse.status, 200);
  assert.deepEqual(retriedSearch.failedQueries, []);
  assert.equal(retriedSearch.hasMore, false);
  assert.deepEqual(retriedSearch.data.map(item => item.apiId).sort(), [71, 72, 73, 74]);
  assert.equal(new Set(retriedSearch.data.map(item => String(item.apiId))).size, retriedSearch.count);
  assert.deepEqual(searchCalls.map(call => call.attribute), [
    'general',
    'songTerm', 'artistTerm', 'albumTerm',
    'artistTerm',
  ]);
  assert.equal(searchCalls.every(call => call.limit === '200'), true);

  const invalidSearchPage = await nativeFetch(`${baseUrl}/songs?search=เพลงไทย&searchPage=invalid`);
  assert.equal(invalidSearchPage.status, 400);

  const upstreamFailureResponse = await nativeFetch(`${baseUrl}/songs?search=upstream-error&searchPage=0`);
  const upstreamFailure = await upstreamFailureResponse.json();
  assert.equal(upstreamFailureResponse.status, 500);
  assert.equal(upstreamFailure.error, 'ค้นหาเพลงไม่สำเร็จ กรุณาลองอีกครั้ง');
  assert.equal(JSON.stringify(upstreamFailure).includes('stack'), false);

  const moodFailureResponse = await nativeFetch(`${baseUrl}/songs?mood=happy&catalogPage=0`);
  const moodFailure = await moodFailureResponse.json();
  assert.equal(moodFailureResponse.status, 502);
  assert.equal(moodFailure.error, 'โหลดเพลงจาก iTunes ไม่สำเร็จ กรุณาลองอีกครั้ง');
  assert.deepEqual(moodFailure.failedQueries, ['feel good pop', 'upbeat music']);
});

test('song search returns unique real results, empty results, and page metadata', async t => {
  const searchResults = {
    'blue note': [
      { trackId: 61, trackName: 'Blue Note', artistName: 'Jazz Artist', trackTimeMillis: 120 },
      { trackId: '61', trackName: 'Blue Note duplicate', artistName: 'Jazz Artist', trackTimeMillis: 120 },
      { trackId: 62, trackName: 'Blue Note Two', artistName: 'Jazz Artist', trackTimeMillis: 240 },
    ],
    'no-such-song': [],
  };
  const baseUrl = await startApi(t, async url => {
    const params = new URL(url).searchParams;
    const term = params.get('term');
    return { ok: true, json: async () => ({ results: searchResults[term] || apiTracks }) };
  });

  const successResponse = await nativeFetch(`${baseUrl}/songs?search=blue%20note&searchPage=0`);
  const success = await successResponse.json();
  assert.equal(successResponse.status, 200);
  assert.equal(success.count, 2);
  assert.deepEqual(success.data.map(song => song.apiId), [62, 61]);
  assert.equal(success.searchPage, 0);
  assert.equal(success.hasMore, true);
  assert.deepEqual(success.failedQueries, []);

  const emptyResponse = await nativeFetch(`${baseUrl}/songs?search=no-such-song&searchPage=0`);
  const empty = await emptyResponse.json();
  assert.equal(emptyResponse.status, 200);
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.data, []);
  assert.equal(empty.searchPage, 0);
  assert.equal(empty.hasMore, true);

  const invalidPageResponse = await nativeFetch(`${baseUrl}/songs?search=blue&searchPage=invalid`);
  assert.equal(invalidPageResponse.status, 400);
  assert.equal((await invalidPageResponse.json()).error, 'ค่า searchPage หรือ search ไม่ถูกต้อง');

  const duplicateSearchParams = await nativeFetch(`${baseUrl}/songs?search=blue&search=note`);
  assert.equal(duplicateSearchParams.status, 400);
  assert.equal((await duplicateSearchParams.json()).error, 'ค่า search ต้องมีเพียงหนึ่งคำค้นหา');

  const legacyResponse = await nativeFetch(`${baseUrl}/songs?mood=chill`);
  const legacy = await legacyResponse.json();
  assert.equal(legacyResponse.status, 200);
  assert.deepEqual(Object.keys(legacy), ['mood', 'search', 'source', 'algorithm', 'count', 'apiMs', 'ms', 'data']);
  assert.equal(legacy.source, 'itunes');
  assert.equal(legacy.count, apiTracks.length);
});

test('song API reports upstream failures as safe retryable errors', async t => {
  const failedUrl = await startApi(t, async () => { throw new Error('simulated iTunes outage'); });
  const failureResponse = await nativeFetch(`${failedUrl}/songs?search=server-crash&searchPage=0`);
  const failure = await failureResponse.json();
  assert.equal(failureResponse.status, 500);
  assert.equal(failure.error, 'ค้นหาเพลงไม่สำเร็จ กรุณาลองอีกครั้ง');
  assert.equal(JSON.stringify(failure).includes('simulated iTunes outage'), false);
});

test('song API converts upstream timeouts into retryable failures', async t => {
  const timeoutUrl = await startApi(t, (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('simulated timeout')), { once: true });
  }), { requestTimeoutMs: 15 });
  const timeoutResponse = await nativeFetch(`${timeoutUrl}/songs?mood=chill&catalogPage=0`);
  const timeout = await timeoutResponse.json();
  assert.equal(timeoutResponse.status, 502);
  assert.equal(timeout.error, 'โหลดเพลงจาก iTunes ไม่สำเร็จ กรุณาลองอีกครั้ง');
  assert.equal(timeout.failedQueries.length, 2);
});

test('moods and missing preview routes return their documented response shapes', async t => {
  const baseUrl = await startApi(t, async () => ({ ok: true, json: async () => ({ results: apiTracks }) }));
  const moodsResponse = await nativeFetch(`${baseUrl}/moods`);
  const moods = await moodsResponse.json();
  assert.equal(moodsResponse.status, 200);
  assert.deepEqual(moods.moods.map(mood => mood.key), ['chill', 'happy', 'sad', 'focus', 'energy']);

  const previewResponse = await nativeFetch(`${baseUrl}/preview/unknown-track`);
  assert.equal(previewResponse.status, 404);
  assert.equal((await previewResponse.json()).error, 'ไม่พบตัวอย่างเพลงนี้');
});

test('preview conversion serves complete MP3 and valid byte ranges with exact headers', async t => {
  const trackId = previewFixtureId('conversion');
  t.after(() => removePreviewCache(trackId));
  const wav = createPcmWav();
  const baseUrl = await startApi(t, async url => {
    if (url.startsWith('https://itunes.apple.com/search')) {
      return { ok: true, json: async () => ({ results: [previewSong(trackId)] }) };
    }
    return {
      ok: true,
      body: Readable.toWeb(Readable.from(wav)),
    };
  });
  await loadPreviewFixtures(baseUrl);

  const fullResponse = await nativeFetch(`${baseUrl}/preview/${trackId}`);
  const fullAudio = Buffer.from(await fullResponse.arrayBuffer());
  assert.equal(fullResponse.status, 200);
  assert.equal(fullResponse.headers.get('content-type'), 'audio/mpeg');
  assert.equal(fullResponse.headers.get('accept-ranges'), 'bytes');
  assert.equal(Number(fullResponse.headers.get('content-length')), fullAudio.length);
  assert.ok(fullAudio.length > 100);
  assert.notDeepEqual(fullAudio, wav);

  const rangeResponse = await nativeFetch(`${baseUrl}/preview/${trackId}`, {
    headers: { Range: 'bytes=0-9' },
  });
  const rangeAudio = Buffer.from(await rangeResponse.arrayBuffer());
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-range'), `bytes 0-9/${fullAudio.length}`);
  assert.equal(rangeResponse.headers.get('content-length'), '10');
  assert.deepEqual(rangeAudio, fullAudio.subarray(0, 10));

  const suffixResponse = await nativeFetch(`${baseUrl}/preview/${trackId}`, {
    headers: { Range: 'bytes=-8' },
  });
  const suffixAudio = Buffer.from(await suffixResponse.arrayBuffer());
  assert.equal(suffixResponse.status, 206);
  assert.equal(suffixResponse.headers.get('content-range'), `bytes ${fullAudio.length - 8}-${fullAudio.length - 1}/${fullAudio.length}`);
  assert.equal(suffixResponse.headers.get('content-length'), '8');
  assert.deepEqual(suffixAudio, fullAudio.subarray(-8));

  for (const range of ['items=0-1', 'bytes=invalid', `bytes=${fullAudio.length}-`]) {
    const invalidRange = await nativeFetch(`${baseUrl}/preview/${trackId}`, { headers: { Range: range } });
    assert.equal(invalidRange.status, 416);
    assert.equal(invalidRange.headers.get('content-range'), `bytes */${fullAudio.length}`);
  }
});

test('preview route distinguishes unknown IDs and songs without preview URLs', async t => {
  const noPreviewId = previewFixtureId('missing-preview');
  const baseUrl = await startApi(t, async () => ({
    ok: true,
    json: async () => ({ results: [previewSong(noPreviewId, '')] }),
  }));
  await loadPreviewFixtures(baseUrl);

  for (const id of ['unknown-track', noPreviewId]) {
    const response = await nativeFetch(`${baseUrl}/preview/${id}`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'ไม่พบตัวอย่างเพลงนี้');
  }
});

test('preview route safely reports upstream HTTP and stream failures', async t => {
  const httpFailureId = previewFixtureId('http-failure');
  const streamFailureId = previewFixtureId('stream-failure');
  t.after(() => Promise.all([removePreviewCache(httpFailureId), removePreviewCache(streamFailureId)]));
  const baseUrl = await startApi(t, async (url) => {
    if (url.startsWith('https://itunes.apple.com/search')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            previewSong(httpFailureId, `https://preview.test/${httpFailureId}`),
            previewSong(streamFailureId, `https://preview.test/${streamFailureId}`),
          ],
        }),
      };
    }
    if (url.includes(String(httpFailureId))) return { ok: false, status: 503, body: null };
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0x52, 0x49, 0x46, 0x46]));
          controller.error(new Error('simulated upstream stream failure'));
        },
      }),
    };
  });
  await loadPreviewFixtures(baseUrl);

  for (const id of [httpFailureId, streamFailureId]) {
    const response = await nativeFetch(`${baseUrl}/preview/${id}`);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'ไม่สามารถโหลดตัวอย่างเพลงได้');
  }
});

test('preview upstream timeout returns a safe gateway error', async t => {
  const trackId = previewFixtureId('timeout');
  t.after(() => removePreviewCache(trackId));
  let observedAbort = false;
  const baseUrl = await startApi(t, async (url, options) => {
    if (url.startsWith('https://itunes.apple.com/search')) {
      return { ok: true, json: async () => ({ results: [previewSong(trackId)] }) };
    }
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        observedAbort = true;
        reject(new Error('simulated preview timeout'));
      }, { once: true });
    });
  }, { previewTimeoutMs: 20 });
  await loadPreviewFixtures(baseUrl);

  const response = await nativeFetch(`${baseUrl}/preview/${trackId}`);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'ไม่สามารถโหลดตัวอย่างเพลงได้');
  assert.equal(observedAbort, true);
});

test('oversized JSON body returns HTTP 413 with a safe message', async t => {
  const baseUrl = await startApi(t, async () => ({ ok: true, json: async () => ({ results: apiTracks }) }));
  const response = await nativeFetch(`${baseUrl}/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 11, padding: 'x'.repeat(1024 * 120) }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'ข้อมูลในคำขอมีขนาดใหญ่เกินไป');
});

test('watchlist supports add, peek, remove, dequeue, clear, empty state, and duplicates', async t => {
  const baseUrl = await startApi(t, async () => ({ ok: true, json: async () => ({ results: apiTracks }) }));
  await nativeFetch(`${baseUrl}/songs?mood=chill`);

  const empty = await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json());
  assert.equal(empty.size, 0);
  assert.equal(empty.next, null);
  assert.deepEqual(empty.items, []);

  const emptyDequeue = await nativeFetch(`${baseUrl}/watchlist/process`, { method: 'DELETE' });
  assert.equal(emptyDequeue.status, 400);
  assert.equal((await emptyDequeue.json()).error, 'คิวว่าง');
  const emptyClear = await nativeFetch(`${baseUrl}/watchlist`, { method: 'DELETE' });
  assert.equal(emptyClear.status, 400);
  assert.equal((await emptyClear.json()).error, 'คิวว่าง');

  for (const id of [11, 12, 11]) {
    const response = await nativeFetch(`${baseUrl}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    assert.equal(response.status, 201);
  }
  const queued = await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json());
  assert.equal(queued.size, 3);
  assert.deepEqual(queued.items.map(song => song.id), [11, 12, 11]);
  assert.equal(queued.next.id, 11);

  const removedResponse = await nativeFetch(`${baseUrl}/watchlist/items/1`, { method: 'DELETE' });
  assert.equal(removedResponse.status, 200);
  assert.equal((await removedResponse.json()).size, 2);
  const removedQueue = await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json());
  assert.deepEqual(removedQueue.items.map(song => song.id), [11, 11]);

  const dequeuedResponse = await nativeFetch(`${baseUrl}/watchlist/process`, { method: 'DELETE' });
  const dequeued = await dequeuedResponse.json();
  assert.equal(dequeuedResponse.status, 200);
  assert.equal(dequeued.song.id, 11);
  assert.equal(dequeued.size, 1);
  const afterDequeue = await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json());
  assert.deepEqual(afterDequeue.items.map(song => song.id), [11]);

  const clearResponse = await nativeFetch(`${baseUrl}/watchlist`, { method: 'DELETE' });
  assert.equal(clearResponse.status, 200);
  assert.equal((await clearResponse.json()).size, 0);
  assert.equal((await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json())).size, 0);
});

test('history orders actions and multiple Undo calls restore queue state consistently', async t => {
  const baseUrl = await startApi(t, async () => ({ ok: true, json: async () => ({ results: apiTracks }) }));
  await nativeFetch(`${baseUrl}/songs?mood=chill`);

  const emptyUndo = await nativeFetch(`${baseUrl}/undo`, { method: 'POST' });
  assert.equal(emptyUndo.status, 400);
  assert.equal((await emptyUndo.json()).error, 'ไม่มีอะไรให้ย้อนกลับ');

  for (const id of [11, 12, 11]) {
    await nativeFetch(`${baseUrl}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }
  await nativeFetch(`${baseUrl}/watchlist/items/1`, { method: 'DELETE' });
  await nativeFetch(`${baseUrl}/watchlist/process`, { method: 'DELETE' });

  const recorded = await nativeFetch(`${baseUrl}/history`).then(response => response.json());
  assert.deepEqual(recorded.history.map(action => action.action), ['WATCH', 'REMOVE', 'ADD', 'ADD', 'ADD']);
  assert.deepEqual(recorded.history.map(action => action.song.id), [11, 12, 11, 12, 11]);
  assert.ok(recorded.history.every(action => Number.isFinite(Date.parse(action.timestamp))));

  for (const expectedIds of [[11, 11], [11, 12, 11], [11, 12], [11], []]) {
    const response = await nativeFetch(`${baseUrl}/undo`, { method: 'POST' });
    assert.equal(response.status, 200);
    const current = await nativeFetch(`${baseUrl}/watchlist`).then(result => result.json());
    assert.deepEqual(current.items.map(song => song.id), expectedIds);
    assert.equal(current.size, expectedIds.length);
  }
  const exhaustedUndo = await nativeFetch(`${baseUrl}/undo`, { method: 'POST' });
  assert.equal(exhaustedUndo.status, 400);
  assert.equal((await exhaustedUndo.json()).error, 'ไม่มีอะไรให้ย้อนกลับ');

  for (const id of [11, 12]) {
    await nativeFetch(`${baseUrl}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }
  await nativeFetch(`${baseUrl}/watchlist`, { method: 'DELETE' });
  assert.equal((await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json())).size, 0);
  const undoClear = await nativeFetch(`${baseUrl}/undo`, { method: 'POST' });
  assert.equal(undoClear.status, 200);
  const restored = await nativeFetch(`${baseUrl}/watchlist`).then(response => response.json());
  assert.deepEqual(restored.items.map(song => song.id), [11, 12]);
  assert.equal(restored.next.id, 11);
});

test('watchlist validates request bodies and song identifiers with JSON errors', async t => {
  const baseUrl = await startApi(t, async () => ({ ok: true, json: async () => ({ results: apiTracks }) }));
  await nativeFetch(`${baseUrl}/songs?mood=chill`);

  const invalidBody = await nativeFetch(`${baseUrl}/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(invalidBody.status, 400);
  assert.equal((await invalidBody.json()).error, 'รูปแบบ JSON ในคำขอไม่ถูกต้อง');

  const missingBody = await nativeFetch(`${baseUrl}/watchlist`, { method: 'POST' });
  assert.equal(missingBody.status, 400);
  assert.equal((await missingBody.json()).error, 'กรุณาระบุ id เพลง');

  const missingId = await nativeFetch(`${baseUrl}/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(missingId.status, 400);
  assert.equal((await missingId.json()).error, 'กรุณาระบุ id เพลง');

  for (const id of ['', '  ', {}, Infinity]) {
    const response = await nativeFetch(`${baseUrl}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'id เพลงไม่ถูกต้อง');
  }

  const unknownId = await nativeFetch(`${baseUrl}/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 99999 }),
  });
  assert.equal(unknownId.status, 404);
  assert.equal((await unknownId.json()).error, 'ไม่พบเพลงที่เลือก');

  const invalidIndex = await nativeFetch(`${baseUrl}/watchlist/items/not-an-index`, { method: 'DELETE' });
  assert.equal(invalidIndex.status, 404);
  assert.equal((await invalidIndex.json()).error, 'ไม่พบรายการนี้ในคิว');
});
