const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const ffmpegPath = require('ffmpeg-static');
const {
  Queue,
  Stack,
  selectionSort,
  insertionSort,
  bubbleSort,
  indexSongsById,
  undoQueueAction,
} = require('./dsa');
const { CatalogBatchError, createCatalog } = require('./catalog');
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use('/legacy', express.static(path.join(__dirname, 'public', 'legacy')));
app.use('/app', express.static(path.join(__dirname, 'public', 'app')));
app.use(express.static(path.join(__dirname, 'public', 'app')));

const API_URL = 'https://itunes.apple.com/search';
let songs = [];
const songCatalog = new Map();
let catalog = createCatalog();
const previewJobs = new Map();
const previewCacheDirectory = path.join(os.tmpdir(), 'music-mood-explorer-previews');
let previewRequestTimeoutMs = 15_000;

const fallbackSongs = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fallbackSongs.json'), 'utf8')
);
function normalizeSong(song, mood = 'chill', fallbackIndex = 0) {
  return {
    id: song.trackId || `${song.artistId || 'song'}-${fallbackIndex}`,
    apiId: song.trackId || null,
    title: song.trackName || 'Untitled Track',
    artist: song.artistName || 'Unknown Artist',
    album: song.collectionName || 'Unknown Album',
    genre: song.primaryGenreName || 'Music',
    apiGenre: song.primaryGenreName || '',
    image: song.artworkUrl100 || 'https://placehold.co/100x100/0f172a/ffffff?text=Music',
    preview: song.previewUrl || '',
    url: song.trackViewUrl || '#',
    duration: song.trackTimeMillis || 0,
    price: song.trackPrice || 0,
    mood,
  };
}

async function loadSongs(mood = 'chill') {
  const query = encodeURIComponent(mood || 'chill');
  const url = `${API_URL}?term=${query}&media=music&entity=song&limit=20`;
  const apiStart = performance.now();
  let apiMs;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('API ตอบ status ' + res.status);

    const data = await res.json();
    apiMs = (performance.now() - apiStart).toFixed(3);
    const results = Array.isArray(data.results) ? data.results : [];

    songs = results.map((song, index) => normalizeSong(song, mood, index));
    indexSongsById(songCatalog, songs);

    if (songs.length === 0) {
      throw new Error('ไม่มีรายการเพลงสำหรับ mood นี้');
    }

    console.log(`✅ โหลดเพลงจาก iTunes สำเร็จ: ${songs.length} เพลง (${mood})`);
    return { success: true, apiMs };
  } catch (error) {
    apiMs ??= (performance.now() - apiStart).toFixed(3);
    songs = fallbackSongs.map((song, index) => ({
      id: song.id || index + 1,
      title: song.title || 'Untitled Track',
      artist: song.artist || 'Unknown Artist',
      album: song.album || 'Unknown Album',
      genre: song.genre || 'Music',
      image: song.image || 'https://placehold.co/100x100/0f172a/ffffff?text=Music',
      preview: song.preview || '',
      url: song.url || '#',
      duration: song.duration || 180000,
      price: song.price || 0,
      mood: song.mood || mood,
    }));
    indexSongsById(songCatalog, songs);

    console.log(`⚠️ ใช้ข้อมูลสำรองแทน (${error.message})`);
    return { success: false, apiMs };
  }
}

app.get('/moods', (req, res) => {
  res.json({
    moods: [
      { key: 'chill', label: 'Chill' },
      { key: 'happy', label: 'Happy' },
      { key: 'sad', label: 'Sad' },
      { key: 'focus', label: 'Focus' },
      { key: 'energy', label: 'Energy' },
    ]
  });
});

app.get('/songs', async (req, res) => {
  if (req.query.search !== undefined && typeof req.query.search !== 'string') {
    return res.status(400).json({ error: 'ค่า search ต้องมีเพียงหนึ่งคำค้นหา' });
  }
  const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const mood = req.query.mood || 'chill';
  const algo = req.query.sort || 'selection';
  let resultSongs;
  let source = 'itunes';
  let apiMs;
  if (searchTerm && req.query.searchPage !== undefined) {
    const pageValue = String(req.query.searchPage);
    const page = /^\d+$/.test(pageValue) ? Number(pageValue) : NaN;
    let searchResult;
    try {
      searchResult = await catalog.loadSearchBatch(searchTerm, page, normalizeSong);
    } catch (error) {
      if (error instanceof RangeError) {
        return res.status(400).json({ error: 'ค่า searchPage หรือ search ไม่ถูกต้อง' });
      }
      console.error(`⚠️ ค้นหาเพลงแบบหลายชุดไม่สำเร็จ (${searchTerm}, ${page}): ${error.message}`);
      return res.status(500).json({ error: 'ค้นหาเพลงไม่สำเร็จ กรุณาลองอีกครั้ง' });
    }

    apiMs = searchResult.apiMs;
    resultSongs = searchResult.data;
    indexSongsById(songCatalog, resultSongs);
    const sortStart = performance.now();
    let sorted;
    if (algo === 'insertion') sorted = insertionSort(resultSongs);
    else if (algo === 'bubble') sorted = bubbleSort(resultSongs);
    else sorted = selectionSort(resultSongs);
    const ms = (performance.now() - sortStart).toFixed(3);
    return res.json({
      mood,
      search: searchTerm,
      source,
      algorithm: algo,
      count: sorted.length,
      apiMs,
      ms,
      data: sorted,
      searchPage: searchResult.searchPage,
      hasMore: searchResult.hasMore,
      failedQueries: searchResult.failedQueries,
    });
  } else if (!searchTerm && req.query.catalogPage !== undefined) {
    const pageValue = String(req.query.catalogPage);
    const page = /^\d+$/.test(pageValue) ? Number(pageValue) : NaN;
    let catalogResult;
    try {
      catalogResult = await catalog.loadMoodBatch(mood, page, normalizeSong);
    } catch (error) {
      if (error instanceof CatalogBatchError) {
        console.error(`⚠️ โหลด catalog batch ไม่สำเร็จ (${mood}, ${page}): ${error.message}`);
        return res.status(502).json({
          error: page === 0
            ? 'โหลดเพลงจาก iTunes ไม่สำเร็จ กรุณาลองอีกครั้ง'
            : 'โหลดเพลงเพิ่มเติมไม่สำเร็จ กรุณาลองอีกครั้ง',
          catalogPage: page,
          failedQueries: error.failedQueries,
        });
      }
      if (error instanceof RangeError) {
        return res.status(400).json({ error: 'ค่า catalogPage หรือ mood ไม่ถูกต้อง' });
      }
      console.error(`⚠️ โหลด Music Library ไม่สำเร็จ: ${error.message}`);
      return res.status(500).json({ error: 'โหลด Music Library ไม่สำเร็จ กรุณาลองอีกครั้ง' });
    }
    apiMs = catalogResult.apiMs;
    resultSongs = catalogResult.data;
    indexSongsById(songCatalog, resultSongs);

    const sortStart = performance.now();
    let sorted;
    if (algo === 'insertion') sorted = insertionSort(resultSongs);
    else if (algo === 'bubble') sorted = bubbleSort(resultSongs);
    else sorted = selectionSort(resultSongs);
    const ms = (performance.now() - sortStart).toFixed(3);
    return res.json({
      mood,
      search: null,
      source,
      algorithm: algo,
      count: sorted.length,
      apiMs,
      ms,
      data: sorted,
      catalogPage: catalogResult.catalogPage,
      hasMore: catalogResult.hasMore,
      failedQueries: catalogResult.failedQueries,
    });
  } else if (searchTerm) {
    const apiStart = performance.now();
    try {
      const url = `${API_URL}?term=${encodeURIComponent(searchTerm)}&media=music&entity=song&limit=20`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('API ตอบ status ' + response.status);

      const data = await response.json();
      apiMs = (performance.now() - apiStart).toFixed(3);
      const term = searchTerm.toLowerCase();
      resultSongs = (Array.isArray(data.results) ? data.results : [])
        .filter(song => [song.trackName, song.artistName, song.collectionName, song.primaryGenreName]
          .some(value => typeof value === 'string' && value.toLowerCase().includes(term)))
        .map((song, index) => normalizeSong(song, mood, index));
      indexSongsById(songCatalog, resultSongs);
    } catch (error) {
      console.error(`⚠️ ค้นหาเพลงไม่สำเร็จ (${searchTerm}): ${error.message}`);
      return res.status(502).json({ error: 'ค้นหาเพลงไม่สำเร็จ กรุณาลองอีกครั้ง' });
    }
  } else {
    const loadResult = await loadSongs(mood);
    apiMs = loadResult.apiMs;
    if (!loadResult.success) source = 'fallback';
    resultSongs = songs;
  }

  const sortStart = performance.now();
  let sorted;
  if (algo === 'insertion') sorted = insertionSort(resultSongs);
  else if (algo === 'bubble') sorted = bubbleSort(resultSongs);
  else sorted = selectionSort(resultSongs);

  const ms = (performance.now() - sortStart).toFixed(3);
  res.json({ mood, search: searchTerm || null, source, algorithm: algo, count: sorted.length, apiMs, ms, data: sorted });
});

async function getMp3Preview(song) {
  const cachePath = path.join(previewCacheDirectory, `${encodeURIComponent(String(song.id))}.mp3`);
  try {
    await fs.promises.access(cachePath);
    return cachePath;
  } catch {}

  if (previewJobs.has(song.id)) return previewJobs.get(song.id);

  const job = (async () => {
    if (!ffmpegPath) throw new Error('ไม่พบ FFmpeg สำหรับแปลงเสียง');
    await fs.promises.mkdir(previewCacheDirectory, { recursive: true });
    const tempPath = `${cachePath}.${process.pid}.tmp`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), previewRequestTimeoutMs);
    let ffmpeg;
    let conversion;
    let inputStream;
    try {
      const upstream = await fetch(song.preview, { signal: controller.signal });
      if (!upstream.ok || !upstream.body) throw new Error('ดาวน์โหลดตัวอย่างเพลงไม่สำเร็จ');

      ffmpeg = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn',
        '-codec:a', 'libmp3lame', '-q:a', '5', '-f', 'mp3', tempPath,
      ], { stdio: ['pipe', 'ignore', 'pipe'] });
      let ffmpegError = '';
      ffmpeg.stderr.on('data', chunk => { ffmpegError += chunk.toString(); });
      conversion = new Promise((resolve, reject) => {
        ffmpeg.once('error', reject);
        ffmpeg.once('close', code => {
          if (code === 0) resolve();
          else reject(new Error(ffmpegError || `FFmpeg exited with code ${code}`));
        });
      });

      inputStream = pipeline(Readable.fromWeb(upstream.body), ffmpeg.stdin);
      await Promise.all([inputStream, conversion]);
      await fs.promises.rename(tempPath, cachePath);
      return cachePath;
    } catch (error) {
      if (ffmpeg && ffmpeg.exitCode === null && !ffmpeg.killed) ffmpeg.kill();
      await Promise.allSettled([inputStream, conversion].filter(Boolean));
      await fs.promises.rm(tempPath, { force: true });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();

  previewJobs.set(song.id, job);
  try {
    return await job;
  } finally {
    previewJobs.delete(song.id);
  }
}

app.get('/preview/:id', async (req, res) => {
  const song = songCatalog.get(req.params.id) || songs.find(item => String(item.id) === req.params.id);
  if (!song || !song.preview) return res.status(404).json({ error: 'ไม่พบตัวอย่างเพลงนี้' });

  try {
    const filePath = await getMp3Preview(song);
    const { size } = await fs.promises.stat(filePath);
    let start = 0;
    let end = size - 1;
    let status = 200;

    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      if (match[1] === '') {
        const suffixLength = Number(match[2]);
        start = Math.max(0, size - suffixLength);
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (start >= size || start > end) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      status = 206;
    }

    res.status(status);
    res.set({
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    });
    if (status === 206) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);

    const audio = fs.createReadStream(filePath, { start, end });
    audio.on('error', error => {
      if (!res.destroyed) res.destroy(error);
    });
    audio.pipe(res);
  } catch (error) {
    console.error(`⚠️ แปลงตัวอย่างเพลงไม่สำเร็จ (${song.title}): ${error.message}`);
    if (!res.headersSent) res.status(502).json({ error: 'ไม่สามารถโหลดตัวอย่างเพลงได้' });
    else res.destroy(error);
  }
});

const watchlist = new Queue();

function timestampedAction(action) {
  const now = new Date();
  return {
    ...action,
    time: now.toLocaleTimeString('th-TH'),
    timestamp: now.toISOString(),
  };
}

app.get('/watchlist', (req, res) => {
  res.json({ items: watchlist.items, size: watchlist.size(), next: watchlist.peek() || null });
});

app.post('/watchlist', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'กรุณาส่งข้อมูลเพลงในรูปแบบ JSON object' });
  }
  if (!Object.hasOwn(req.body, 'id')) {
    return res.status(400).json({ error: 'กรุณาระบุ id เพลง' });
  }
  if ((typeof req.body.id !== 'string' && typeof req.body.id !== 'number')
    || String(req.body.id).trim() === ''
    || (typeof req.body.id === 'number' && !Number.isFinite(req.body.id))) {
    return res.status(400).json({ error: 'id เพลงไม่ถูกต้อง' });
  }
  const song = songCatalog.get(String(req.body.id)) || songs.find(item => String(item.id) === String(req.body.id));
  if (!song) return res.status(404).json({ error: 'ไม่พบเพลงที่เลือก' });

  const index = watchlist.size();
  watchlist.enqueue(song);
  history.push(timestampedAction({ action: 'ADD', song, index }));

  res.status(201).json({ message: `เพิ่ม ${song.title} เข้าคิวแล้ว`, size: watchlist.size() });
});

app.delete('/watchlist/process', (req, res) => {
  if (watchlist.size() === 0) return res.status(400).json({ error: 'คิวว่าง' });

  const song = watchlist.dequeue();
  history.push(timestampedAction({ action: 'WATCH', song }));

  res.json({ message: `กำลังฟัง ${song.title} แล้ว`, song, size: watchlist.size() });
});

app.delete('/watchlist/items/:index', (req, res) => {
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= watchlist.size()) {
    return res.status(404).json({ error: 'ไม่พบรายการนี้ในคิว' });
  }

  const song = watchlist.removeAt(index);
  history.push(timestampedAction({ action: 'REMOVE', song, index }));
  res.json({ message: `นำ ${song.title} ออกจากคิวแล้ว`, size: watchlist.size() });
});

app.delete('/watchlist', (req, res) => {
  if (watchlist.isEmpty()) return res.status(400).json({ error: 'คิวว่าง' });

  const songs = watchlist.clear();
  history.push(timestampedAction({
    action: 'CLEAR',
    song: songs[songs.length - 1],
    songs,
    count: songs.length,
  }));
  res.json({ message: `ล้างคิว ${songs.length} เพลงแล้ว`, size: watchlist.size() });
});

const history = new Stack();

app.get('/history', (req, res) => {
  res.json({ history: history.display(), size: history.size() });
});

app.post('/undo', (req, res) => {
  if (history.isEmpty()) return res.status(400).json({ error: 'ไม่มีอะไรให้ย้อนกลับ' });

  const last = history.pop();
  if (!undoQueueAction(watchlist, last)) {
    history.push(last);
    return res.status(409).json({ error: 'ไม่สามารถย้อนการกระทำล่าสุดได้ เนื่องจากคิวเปลี่ยนแปลงแล้ว' });
  }

  const description = last.action === 'CLEAR'
    ? `ล้างคิว ${last.count} เพลง`
    : `${last.action} ของ ${last.song.title}`;
  res.json({ message: `ย้อน ${description} แล้ว`, size: watchlist.size() });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'รูปแบบ JSON ในคำขอไม่ถูกต้อง' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'ข้อมูลในคำขอมีขนาดใหญ่เกินไป' });
  }
  console.error(`⚠️ คำขอ API ผิดพลาด: ${error.message}`);
  return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ กรุณาลองอีกครั้ง' });
});

function resetForTests({ requestTimeoutMs, previewTimeoutMs } = {}) {
  songs = [];
  songCatalog.clear();
  watchlist.clear();
  history.items.length = 0;
  catalog = createCatalog(requestTimeoutMs === undefined ? {} : { requestTimeoutMs });
  previewRequestTimeoutMs = previewTimeoutMs === undefined ? 15_000 : previewTimeoutMs;
}

if (require.main === module) {
  loadSongs();
  const startServer = (port) => {
    const server = app.listen(port, () => {
      console.log(`🚀 http://localhost:${port}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        console.log(`⚠️ Port ${port} ถูกใช้งานอยู่ กำลังลอง ${nextPort}`);
        startServer(nextPort);
      } else {
        throw error;
      }
    });
  };

  startServer(PORT);
}

app.resetForTests = resetForTests;
module.exports = app;
