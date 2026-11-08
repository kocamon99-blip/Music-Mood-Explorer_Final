# Music Mood Explorer

Music Mood Explorer เป็นเว็บแอปค้นพบเพลงจริงตามอารมณ์และคำค้นหา ใช้ React + Vite สำหรับ frontend, Express สำหรับ backend/API และ iTunes Search API เดิมเป็นผู้ให้ข้อมูลเพลง ไม่มีการเพิ่มผู้ให้บริการ API ภายนอก

### Features
- ค้นหาเพลง ศิลปิน อัลบั้ม และแนวเพลงด้วย iTunes Search API พร้อมประวัติคำค้นหา
- สำรวจเพลงจาก 5 moods; แสดง loading, empty, error, retry และผลลัพธ์จริง
- กรอง genre, เลือก sorting algorithm, เปิดรายละเอียด และเล่น preview เมื่อ iTunes มี preview URL
- Queue แบบ FIFO รองรับเพลงซ้ำ, History และ Undo
- มีหน้า legacy เดิมที่ `/legacy/`; React Discover UI ให้บริการที่ `/`

### Technology Stack
- Frontend: React 19, Vite 6, JavaScript และ CSS
- Backend: Node.js 18+, Express 4
- Data source: iTunes Search API (`https://itunes.apple.com/search`)
- Tests: Node.js built-in `node:test`; ไม่ต้องเรียก network จริงใน integration tests

## Project Structure
```text
.
├── server.js                 # Express routes, iTunes access, Queue/History/Undo
├── catalog.js                # iTunes search/catalog batches, cache, limits, retries
├── dsa.js                    # Queue, Stack, Map helpers, sorting algorithms
├── fallbackSongs.json        # Legacy mood-route fallback only
├── client/
│   └── src/
│       ├── App.jsx            # App state, API calls, playback and actions
│       ├── dsa.mjs            # Frontend API-result deduplication and genre helpers
│       ├── styles.css         # Luxury Purple Discover UI and responsive styles
│       └── components/        # Discover, library, queue, history and song views
├── public/                    # Legacy frontend; served at /legacy/
├── tests/
│   ├── api.test.js            # Express API integration tests
│   ├── catalog.test.js        # iTunes catalog unit tests with mocked fetch
│   ├── dsa.test.js            # DSA and sorting unit tests
│   └── sorting.benchmark.js   # Repeatable local sorting benchmark
├── vite.config.js             # Vite root, dev proxy and production output
└── package.json               # Scripts and dependencies
```

## เริ่มต้น
```bash
npm install
node server.js
```
แล้วเปิด:
```text
http://localhost:3000
```

ทดสอบ DSA และวัด sorting algorithms:
```bash
npm test
npm run benchmark
```

## React + Vite Frontend
รัน backend และ frontend แยกกันใน 2 terminal:
```bash
npm start
npm run dev
```
Vite เปิดที่ `http://localhost:5173` และ proxy API เดิมไปยัง Express ที่ port 3000

Build React สำหรับให้ Express เสิร์ฟใน production:
```bash
npm run build
npm start
```
React build จะให้บริการที่ `/`; หน้าเดิมยังคงอยู่ที่ `/legacy/` และไฟล์ใน `public/` ไม่ถูกลบ

## React Component Tree
```text
App
├── Navbar
├── DiscoverPage
│   ├── HeroSection
│   ├── SearchBar
│   ├── MoodSelector
│   └── TrackSection
│       ├── LoadingSkeleton / EmptyState / ErrorState
│       └── SongCard
├── MusicLibrary
│   ├── GenreFilter
│   ├── LoadingSkeleton / EmptyState / ErrorState
│   └── SongCard
├── QueuePanel
├── HistoryPanel
├── SongModal
└── Now-playing audio player (when a preview is active)
```

## System Architecture
```text
Browser
  React UI (Vite dev server :5173; production build under client/dist)
      │ same-origin requests; Vite proxies API paths during development
      ▼
  Express server (:3000)
      ├── /songs ── catalog batches / legacy search ──► iTunes Search API
      ├── /moods
      ├── /watchlist, /history, /undo ── in-memory Queue + Stack
      └── /preview/:id ── iTunes preview URL, converted/cached as MP3
```
In production Express serves the Vite build at `/`. The prior static frontend stays under `/legacy/`. The batch catalog uses only iTunes Search API queries, caches successful responses and reports partial failures; it does not invent tracks or preview URLs. The no-page legacy mood route may use `fallbackSongs.json` on upstream failure for backwards compatibility; the React catalog/search routes show API errors instead of presenting fallback data as live results.

## API Endpoints
All JSON request bodies require `Content-Type: application/json`. Error responses use `{ "error": "ข้อความที่อ่านได้" }`; stack traces are not part of the public response.

| Method and path | Parameters / body | Success response | Errors and notes |
|---|---|---|---|
| `GET /moods` | None | `{ moods: [{ key, label }] }` | `200` |
| `GET /songs` | Optional `mood` (default `chill`), `sort` (`selection`, `insertion`, `bubble`; default `selection`) | Legacy shape: `{ mood, search, source, algorithm, count, apiMs, ms, data }` | `200`; without paging parameters it preserves the legacy contract. Legacy mood route can return `source: "fallback"` when iTunes fails. |
| `GET /songs?search=...` | `search` query; optional `sort` | Same legacy fields; real matching results only | `200` including empty results; iTunes failure `502`; repeated `search` parameter `400`. This legacy search requests up to 20 results. |
| `GET /songs?search=...&searchPage=N` | Required non-empty `search`; integer `searchPage >= 0`; optional `sort` | Legacy fields plus `searchPage`, `hasMore`, `failedQueries` | `400` invalid query/page; `500` if all upstream queries fail; partial successful results remain in response with failed-query metadata. |
| `GET /songs?mood=...&catalogPage=N` | Supported mood (`chill`, `happy`, `sad`, `focus`, `energy`); integer `catalogPage >= 0`; optional `sort` | Legacy fields plus `catalogPage`, `hasMore`, `failedQueries` | `400` invalid mood/page; `502` if all upstream queries fail; partial successful results remain in response. |
| `GET /watchlist` | None | `{ items: Song[], size, next: Song \| null }` | `200`; `next` peeks at the FIFO front without removing it. |
| `POST /watchlist` | `{ "id": number \| string }` referencing a loaded song | `201 { message, size }` | `400` invalid JSON, missing/invalid `id`; `404` unknown song. Duplicate IDs are allowed. |
| `DELETE /watchlist/process` | None | `{ message, song, size }` | `400` if queue empty; dequeues the FIFO front and records `WATCH`. |
| `DELETE /watchlist/items/:index` | Zero-based queue index in path | `{ message, size }` | `404` invalid/out-of-range index; removes only that occurrence and records `REMOVE`. |
| `DELETE /watchlist` | None | `{ message, size }` | `400` if queue empty; clears and records the queue snapshot. |
| `GET /history` | None | `{ history: Action[], size }` | `200`; newest action first. Each action includes `time` and ISO `timestamp`. |
| `POST /undo` | None | `{ message, size }` | `400` if there is no action; `409` if the latest action cannot be undone. |
| `GET /preview/:id` | Optional HTTP `Range: bytes=start-end` | `200` MP3 or `206` partial MP3 with range headers | `404` missing song/preview; `416` invalid/unsatisfiable range; `502` upstream/conversion failure. |

`Song` objects contain normalized fields including `id`, `apiId`, `title`, `artist`, `album`, `genre`, `apiGenre`, `image`, `preview`, `url`, `duration`, `price`, and `mood`. iTunes identifiers and preview URLs are retained from provider responses; missing previews remain empty and are not fabricated. `apiMs` measures upstream work and `ms` measures sorting in milliseconds.

Example requests:
```bash
curl "http://localhost:3000/songs?mood=chill&catalogPage=0&sort=selection"
curl "http://localhost:3000/songs?search=blue%20note&searchPage=0"
curl -X POST "http://localhost:3000/watchlist" -H "Content-Type: application/json" -d "{\"id\":11}"
curl -X DELETE "http://localhost:3000/watchlist/process"
curl -X POST "http://localhost:3000/undo"
```

## Queue, History และ Undo
- `dsa.js` เป็น implementation ที่ Backend ใช้จริง: `Queue` เก็บเพลงด้วย Array; `enqueue()` เพิ่มท้ายคิวและ `dequeue()` นำหัวคิวออกตาม FIFO; `peek()`, `isEmpty()`, `size()`, `removeAt()`, `clear()` และ `restore()` ใช้แสดง/จัดการ/Undo คิว
- Queue อนุญาตเพลงซ้ำ การนำออกระบุ index จึงลบ occurrence ที่เลือกได้โดยไม่กำกวม; การประมวลผลหัวคิวบันทึก action และประวัติ
- `Stack` ใน `dsa.js` เก็บ ADD, WATCH, REMOVE และ CLEAR; `push()` บันทึก action, `pop()` ย้อน action ล่าสุดตาม LIFO, `peek()`, `isEmpty()`, `size()` ตรวจสถานะ และ `display()` คืนรายการใหม่สุดก่อนโดยไม่แก้ Stack
- Undo ใช้ `undoQueueAction()` คืนตำแหน่ง/รายการเดิม และคืน snapshot ทั้งคิวหลัง CLEAR; action ที่ใช้ไม่ได้ถูกปฏิเสธโดยไม่ทิ้งรายการบน Stack
- ประวัติคงฟิลด์ `time` เดิมและเพิ่ม `timestamp` แบบ ISO 8601; API เดิมยังคงอยู่

## Data Structures และ Big-O
| โครงสร้าง/เมธอด | Best | Average | Worst | การใช้งานจริง |
|---|---:|---:|---:|---|
| Queue `enqueue()` (`Array.push`) | O(1) | amortized O(1) | O(n)* | เพิ่มเพลงท้ายคิว |
| Queue `dequeue()` (`Array.shift`) | O(n) | O(n) | O(n) | ประมวลผลเพลงแรก; ต้องเลื่อนสมาชิกที่เหลือ |
| Queue `peek()`, `isEmpty()`, `size()` | O(1) | O(1) | O(1) | แสดงเพลงถัดไปและจำนวนรายการ |
| Queue `removeAt()`, `clear()`, `restore()` | O(n) | O(n) | O(n) | ลบตามตำแหน่ง, snapshot และคืนคิว |
| Stack `push()` / `pop()` (`Array.push/pop`) | O(1) | amortized O(1) | O(n)* | บันทึกและ Undo action ล่าสุด |
| Stack `peek()`, `isEmpty()`, `size()` | O(1) | O(1) | O(1) | ตรวจ action ล่าสุด/สถานะประวัติ |
| Stack `display()` | O(h) | O(h) | O(h) | ทำสำเนาและกลับลำดับประวัติ |
| Map `get()` / `set()` | O(1)** | O(1)** | O(n)** | `songCatalog` หาเพลงด้วย ID และ index API items |
| Set `has()` / `add()` | O(1)** | O(1)** | O(n)** | กรองค่า genre ซ้ำ |

`n` คือจำนวนรายการใน Queue/Map/Set และ `h` คือจำนวน action ใน Stack; `*` Array อาจต้องขยายพื้นที่และคัดลอกข้อมูล; `**` เป็น complexity ตามแบบจำลอง hash ทั่วไป—JavaScript ไม่รับประกัน O(1) เฉพาะ implementation และข้อกำหนดอนุญาตให้ Map/Set มีเวลาเฉลี่ย sublinear; worst case เชิงทฤษฎีเป็น O(n).

ผลต่อ UX: Queue ทำให้เล่นเพลงตามลำดับที่เพิ่ม; Stack ทำให้ Undo ย้อนรายการล่าสุดและแสดง History ใหม่สุดก่อน; Map ลดการค้นหาเพลงด้วยการไล่ Array ทั้งชุด; Set กำจัด genre ซ้ำก่อนแสดงตัวกรอง

## Sorting Algorithms
- `selectionSort`, `insertionSort`, `bubbleSort` อยู่ใน `dsa.js`; ทั้งหมดเรียง `duration` จากมากไปน้อย, คืน Array สำเนา และถูกเลือกจาก sort control ผ่าน `GET /songs?...&sort=...` โดยไม่ใช้ `Array.sort()` เพื่อเรียงเพลง
- Bubble Sort หยุดก่อนครบ pass เมื่อไม่มีการสลับ จึง best-case เป็น O(n); Insertion Sort เลื่อนเฉพาะสมาชิกที่เรียงผิดตำแหน่ง; Selection Sort เลือก duration สูงสุดที่เหลือในแต่ละรอบ

| Algorithm | Best | Average | Worst | Stable เมื่อค่า duration เท่ากัน? | Extra space |
|---|---:|---:|---:|---|---:|
| Selection Sort | O(n²) | O(n²) | O(n²) | ไม่ stable | O(n) สำหรับสำเนา input |
| Insertion Sort | O(n) | O(n²) | O(n²) | stable | O(n) สำหรับสำเนา input |
| Bubble Sort (early exit) | O(n) | O(n²) | O(n²) | stable | O(n) สำหรับสำเนา input |

ค่าที่เท่ากันยังอยู่ในกลุ่มลำดับเดียวกันทุก algorithm; Selection Sort อาจสลับลำดับของรายการที่มี duration เท่ากัน จึงไม่รับประกัน stable ordering

## Sorting Benchmark และการทดสอบ
- `npm test` ใช้ `node:test` ทดสอบ Queue FIFO, Stack LIFO, Undo, Map/Set uniqueness, ทุก sort, catalog merge/cache/concurrency/retry, API compatibility, mood/search ทุก sort และการคง Queue/History/Undo contracts
- `npm run benchmark` ใช้ dataset เดียวกัน 500 ค่า duration ที่สร้างซ้ำได้, warm-up แต่ละ algorithm 5 รอบ แล้วจับเวลา 30 รอบด้วย `performance.now()` เฉพาะการเรียง; ไม่เรียก API/รวม network; checksum ช่วยให้ผลลัพธ์ถูกใช้งานจริง
- `/songs` คง field `ms` เดิมไว้เป็นเวลาจัดเรียงเท่านั้น (มิลลิวินาที, ทศนิยม 3 ตำแหน่ง) และเพิ่ม `apiMs` สำหรับเวลาที่ใช้เรียก iTunes และอ่าน/แปลง response body ทั้งสองค่าไม่รวมเวลาของอีกส่วน; `apiMs` ไม่รวม filtering, normalization หรือการส่ง response ถึง browser
- `ms` เริ่มจับเวลาก่อนเรียก sort และหยุดหลัง sort จึงไม่รวม iTunes network, filtering หรือ normalization; benchmark ยังคงจับเวลาเฉพาะ sorting ไม่รวม upstream latency
- ผล benchmark ที่วัดในรอบพัฒนานี้ (Node v24.21.0, 500 รายการ, 30 รอบ): Selection 8.224 ms รวม / 0.274 ms ต่อรอบ; Insertion 5.590 / 0.186; Bubble 70.659 / 2.355; ทั้งสาม checksum เท่ากับ 149610
- ตัวเลขเป็นผลครั้งเดียวบนเครื่อง/runtime ขณะนั้น ไม่ใช่การรับประกันประสิทธิภาพ: JIT/การ warm-up, ลำดับรัน, CPU และโหลดระบบทำให้ต่างกัน; dataset benchmark ไม่ใช่ข้อมูลเพลงที่แสดงใน Library
- ก่อนปรับการแสดงผล frontend แสดง `ms` ข้างผลค้นหาโดยไม่ระบุว่าเป็นเวลา sort; หลังปรับ `ms` ยังเป็น sort-only ตามเดิม, response เพิ่ม `apiMs` สำหรับเวลา iTunes แยกต่างหาก และ frontend ระบุชื่อเวลาแต่ละค่าอย่างชัดเจน โดย benchmark ยังคงไม่รวม upstream latency; Bubble มี early-exit และ best-case O(n), asymptotic complexity ของ Selection/Insertion ไม่เปลี่ยน

## หมายเหตุ
เพื่อคง backwards compatibility เส้นทาง `GET /songs` แบบ mood เดิมที่ไม่ส่ง `catalogPage` อาจส่งข้อมูลใน `fallbackSongs.json` เมื่อ iTunes ไม่พร้อม (`source: "fallback"`). React catalog/search ใช้ batch routes และแสดง error/retry แทนการนำ fallback ไปแสดงเป็นผล iTunes.

## Advanced Search
- ค้นหาแบบไม่สนตัวพิมพ์เล็ก/ใหญ่และรองรับข้อความบางส่วนจากชื่อเพลง ศิลปิน อัลบั้ม และแนวเพลง
- รอ 300 ms หลังพิมพ์ก่อนส่งคำค้นหา; กด Enter เพื่อค้นหาทันที และปุ่มล้างจะกลับไปยังเพลงตาม mood
- แสดงจำนวนผลลัพธ์, สถานะกำลังค้นหา/ข้อผิดพลาด, empty state และบันทึก 8 คำค้นหาล่าสุดไว้ใน browser
- ผลค้นหาใช้ข้อมูลจริงที่ API ส่งกลับเท่านั้น และไม่แสดง fallback เมื่อ API ค้นหาไม่สำเร็จหรือไม่มีผลลัพธ์
- Universal Search เพิ่มชุดคำค้นหาจาก iTunes ด้วย query ทั่วไป ตามด้วย attribute `songTerm`, `artistTerm`, `albumTerm`; แต่ละ query ขอได้ถึง 200 รายการตามขีดจำกัด Search API และ Load More เรียกชุดถัดไปโดยไม่ใช้ offset pagination
- การค้นหา Unicode รองรับคำไทย/อังกฤษ; ผลที่กลับมาจะตรวจ token แบบ partial และ case-insensitive ในชื่อเพลง ศิลปิน อัลบั้ม และ genre
- `searchPage` เป็นพารามิเตอร์ opt-in: `/songs?search=...` ที่ไม่มี `searchPage` ยังคงเส้นทางเดิม limit 20 และ response fields เดิม; โหมด batch เพิ่ม `searchPage`, `hasMore`, `failedQueries` โดยไม่ลบ fields เดิม
- ผล batch ที่สำเร็จจะยังแสดงเมื่อ query อื่นล้มเหลว; Retry ใช้ cache ของ query ที่สำเร็จและเรียกซ้ำเฉพาะ query ที่ยังไม่สำเร็จ; รายการสะสมถูก deduplicate ด้วย Map keyed by `trackId`
- คำค้นหาใช้ response cache และ in-flight request coalescing ร่วมกับ rate/concurrency limits ของ catalog backend; cache คำค้นหาที่สำเร็จ 10 นาที และสูงสุด 2 upstream requests พร้อมกัน/18 ต่อนาที
- การกรองผลใช้ Array มีต้นทุน `O(r·k)` (r คือจำนวนผลก่อน dedupe; สูงสุดเชิงทฤษฎีรวมทุก batch คือ `200(d + 4)` เมื่อ d คือจำนวนคำค้นย่อยที่ไม่ซ้ำ และแต่ละ query คืนได้ถึง 200 รายการ; k คือจำนวน token × 4 ฟิลด์); Map รวมผลใช้เวลาเฉลี่ย `O(r)` และ memory `O(u)` สำหรับ u track IDs ที่ไม่ซ้ำ; backend Map lookup เฉลี่ย `O(1)` และ worst-case เชิงทฤษฎี `O(n)`; ประวัติคำค้นหาใช้ Array เพราะจำกัด 8 รายการ

## Music Library
- แสดงเฉพาะรายการที่ได้รับจาก iTunes Search API ใน Grid; กรองตาม genre ที่ API ส่งจริง และใช้ร่วมกับ Search/Mood
- ใช้ cache ในหน่วยความจำ 60 วินาทีและรวม request ที่กำลังทำงานของ URL เดียวกัน; Retry ข้าม cache
- โหมด Mood เริ่มด้วย query batch แรก และใช้ Load More เพื่อค้นหาด้วย query terms ต่างกัน (mood, genre, music category, artist); ไม่ใช้ `offset` เพราะ iTunes Search API ไม่รองรับการแบ่งหน้าที่เชื่อถือได้
- แต่ละ batch มีสอง query พร้อมกันสูงสุดและจำกัดไม่เกิน 18 upstream requests ต่อนาทีตามเพดานประมาณ 20 calls/minute ที่ Apple ระบุ; backend cache คำค้นหาที่สำเร็จ 10 นาทีและรวม request ที่กำลังทำงานของ term เดียวกัน; คำค้นหาที่ล้มเหลวไม่ถูก cache เพื่อให้ Retry เรียกซ้ำได้
- `GET /songs` ที่ไม่ส่ง `catalogPage` คงเส้นทางและ response แบบเดิม; โหมดเพิ่ม catalog ใช้ `catalogPage=0,1,...` และเพิ่ม metadata `catalogPage`/`hasMore` โดยคง fields เดิม
- ใน catalog mode `apiMs` เป็นเวลารวมที่ใช้ดึง/อ่านผล query ที่สะสม (รวม cache hits; ไม่รวมเวลาส่ง response); `ms` ยังคงวัดเฉพาะ sorting และไม่รวม upstream latency
- `Map` ช่วย index/lookup เพลงจาก ID โดยเฉลี่ย `O(1)` ต่อ get/set (worst-case เชิงทฤษฎี `O(n)`); React Library ใช้ Map เก็บ ID จริงไม่ซ้ำโดยคงรายการแรกและตัดเพลงไม่มี `trackId`; Backend `songCatalog` เก็บหนึ่งค่าต่อ ID และค่าใหม่แทนค่าก่อนหน้า
- Catalog backend รวมผล query ด้วย Map keyed by `trackId` จึงตัดเพลงซ้ำข้าม query และข้ามการ Retry; React deduplicates accumulated response ด้วย Map keyed by API ID ก่อน render
- `Set` สร้าง genre filter ที่ไม่ซ้ำจาก `primaryGenreName` โดย build `O(n)` average; เรียงตัวเลือกแสดงผลด้วยการ sort รายชื่อ genre (`g` genres) เพิ่ม `O(g log g)`
- เมื่อ API ของ mood ใช้งานไม่ได้ endpoint เดิมยังส่งข้อมูลสำรองให้พฤติกรรมเดิม แต่ Music Library จะแสดง Error/Retry แทนการนำข้อมูลสำรองมาแสดงเป็นเพลงจาก API

## เหตุผลที่เลือกใช้ Sorting
- **Selection Sort**: ทำให้เห็นแนวคิดเลือกค่าสูงสุดจากส่วนที่ยังไม่เรียงในแต่ละรอบได้ชัด และมีจำนวนการสลับไม่มาก; ใช้เป็น default ที่ตรงกับโจทย์ DSA แต่ไม่เหมาะกับข้อมูลขนาดใหญ่เพราะ `O(n²)` ทุกกรณี
- **Insertion Sort**: โค้ดตรงไปตรงมาและทำงานได้ดีเมื่อข้อมูลเกือบเรียงแล้ว (`O(n)` best case); ใช้เปรียบเทียบการเลื่อนรายการกับ Selection Sort
- **Bubble Sort**: สาธิตการเปรียบเทียบสมาชิกติดกันได้ชัด และ early-exit หยุดได้เมื่อเรียงแล้ว (`O(n)` best case); โดยทั่วไปยังมีต้นทุน `O(n²)` จึงเหมาะกับ dataset ขนาดเล็ก/การเรียนรู้มากกว่าข้อมูลใหญ่
- ทั้งสาม algorithm คืนสำเนาเพื่อไม่เปลี่ยนลำดับ input เดิม; การเลือกใน UI ใช้ `sort` query parameter และเรียง `duration` มากไปน้อย

## Latest Test Evidence
หลักฐานล่าสุดที่บันทึกในรอบงานก่อนหน้า:
- `npm test`: **28 tests passed, 0 failed** (Node `node:test`; รวม DSA, catalog, API integration)
- `npm run build`: **ผ่าน** (Vite production build)
- Integration tests mock `global.fetch` ของ iTunes, ใช้ Express บน ephemeral port, reset in-memory Queue/History/song catalog ก่อนแต่ละกรณี และคืนค่า fetch ปกติเมื่อ test cleanup
- ไม่มีรายงานหรือเครื่องมือเก็บ coverage percentage; จึงไม่อ้าง coverage 100%

### Integration Test Coverage
ทดสอบผ่าน HTTP routes จริงของ Express:
- `/songs`: mood/search compatibility, successful และ empty search, duplicate track removal, sorting response, paging metadata, partial batch result, invalid/repeated parameters, upstream rejection/timeout และ error message ที่ไม่เผย stack
- `/watchlist`: GET/peek, add, duplicate IDs, remove by index, dequeue front, clear, empty behavior และ validation สำหรับ malformed/missing/invalid IDs
- `/history` + `/undo`: action order/timestamps, Undo ต่อเนื่องเพื่อคืน state, clear/restore และ empty history
- `/moods` และ `/preview/:id` สำหรับ moods success และ missing preview
- Unit tests ยังครอบคลุมการทำงานภายใน Queue/Stack/Map/Set/sorting/catalog ที่แยกจาก HTTP

**Coverage gaps ที่ทราบ:** ยังไม่มี integration test สำหรับ successful preview conversion และ byte-range streaming, HTTP 413 request body, unexpected internal-error middleware response, Undo conflict (`409`), หรือ conversion/upstream failure ของ preview. ไม่มีการทดสอบกับ live iTunes เพื่อหลีกเลี่ยง network dependency และความไม่แน่นอนของ service.

## Before → After: Feedback จากงานแรก
ยังไม่มี feedback/ใบตรวจงานแรกที่ยืนยันได้ในข้อมูลที่ให้มา จึงไม่สรุป feedback หรืออ้างว่ารายการต่อไปนี้เป็นข้อเสนอแนะจากผู้สอน/สมาชิก:

| Feedback งานแรก (ข้อมูลจริงเท่านั้น) | สิ่งที่ปรับปรุง | หลักฐาน | ไฟล์ที่เกี่ยวข้อง |
|---|---|---|---|
| **ผู้ใช้ต้องเติม:** คัดลอก feedback จริงจากใบตรวจ/ผู้สอน/สมาชิก หรือระบุว่าไม่มี feedback | **ผู้ใช้ต้องเติม:** ระบุการแก้ไขที่ตอบ feedback นั้น | **ผู้ใช้ต้องเติม:** ข้อความ feedback, screenshot/ลิงก์/ผลตรวจเดิมและหลังแก้ | **ผู้ใช้ต้องเติม:** ไฟล์/commit ที่เกี่ยวข้อง |

## ตารางแบ่งงานสมาชิก
กรอกข้อมูลจากสมาชิกและ Git จริงก่อนส่งงาน; ไม่ได้อนุมานชื่อ, รหัส, commit หรือช่วงนำเสนอจาก repository:

| ชื่อสมาชิก | รหัสนักศึกษา | งานที่ทำ | Git Commit (hash/message) | ช่วงเวลานำเสนอ |
|---|---|---|---|---|
| **ผู้ใช้ต้องกรอก** | **ผู้ใช้ต้องกรอก** | **ผู้ใช้ต้องกรอก** | **ผู้ใช้ต้องกรอก** | **ผู้ใช้ต้องกรอก** |
| เพิ่มแถวตามจำนวนสมาชิกจริง |  |  |  |  |

## ตรวจ Rubric (15 คะแนน)
สถานะนี้เป็นการตรวจหลักฐานที่มี ไม่ใช่การทำนายคะแนนผู้ประเมิน:

| หัวข้อ rubric | คะแนนเต็ม | สถานะหลักฐาน | สิ่งที่ยืนยันได้ / สิ่งที่ยังขาด |
|---|---:|---|---|
| การต่อยอดงานแรก | 3 | PARTIAL | มี code/docs ของ Music Mood Explorer แต่ไม่มีงานแรก/feedback ที่ยืนยันได้สำหรับเทียบ Before → After; ผู้ใช้เติมหลักฐาน |
| UX | 4 | PARTIAL | มี loading/empty/error/retry และ responsive UI; มี browser checks ที่บันทึกไว้สำหรับ 390/768/1440 px, search, empty/clear, error/retry, queue/Undo; ยังไม่มีรายงานทดสอบ usability/accessibility เต็มรูปแบบหรือผลตรวจจากผู้ใช้จริง |
| React + Vite + Express | 3 | PASS | โครงสร้าง app, Vite proxy/build, Express API และ test/build commands อยู่ใน repository; production build ผ่านตามหลักฐานล่าสุด |
| DSA | 2 | PASS | Queue/Stack/Map/Set/sorting implementations และ automated tests อยู่ใน repository; Queue/History/Undo API integration tested |
| คลิปนำเสนอ | 3 | FAIL — หลักฐานยังไม่มี | ไม่มีไฟล์หรือลิงก์วิดีโอในข้อมูลที่ตรวจ; ต้องแนบคลิปและระบุช่วงเวลานำเสนอ |

## Final Submission Audit

| รายการตรวจ | สถานะ | หมายเหตุ |
|---|---|---|
| iTunes API และข้อห้ามเพิ่ม external API | PASS | ใช้ iTunes Search API เดิม; ไม่มี API provider ใหม่ |
| Source code คงเดิมในรอบเอกสารนี้ | PASS | รอบนี้แก้ README เท่านั้น; source/frontend/backend/DSA ไม่ได้แก้ |
| เอกสารภาพรวม, features, stack, install, architecture, component tree, API, DSA, Big-O, sorting และคำสั่งทดสอบ | PASS | รายละเอียดอยู่ใน README นี้ |
| automated tests / production build | PASS | ล่าสุดที่บันทึก: 28/28 tests และ Vite build ผ่าน |
| feedback งานแรกและ Before → After evidence | PARTIAL | ไม่มี feedback จริง/ใบตรวจที่ให้มา; เติมตารางด้วยข้อมูลจริงหรือระบุว่าไม่มี |
| ข้อมูลสมาชิก, รหัส, งาน, commits, เวลานำเสนอ | PARTIAL | ช่องกรอกยังว่าง; เติมตามสมาชิกจริงและ Git history |
| คลิป/ลิงก์การนำเสนอ | FAIL | ยังไม่มีหลักฐานให้ตรวจ ต้องสร้าง/แนบก่อนส่ง |
| coverage ทุก route และ coverage percentage | PARTIAL | integration ครอบคลุม routes ที่ระบุด้านบน แต่ยังมีช่องว่าง; ไม่อ้าง coverage 100% |

### สิ่งที่ต้องทำก่อนส่ง (ตามลำดับ)
1. เติม feedback งานแรกและหลักฐาน Before → After จากแหล่งจริง; ถ้าไม่มี ให้เขียนว่าไม่มีอย่างชัดเจน
2. เติมชื่อ/รหัส/งาน/commit ของสมาชิกและช่วงเวลานำเสนอ; ตรวจ hash กับ Git จริง
3. อัดและแนบคลิปนำเสนอ พร้อมลิงก์หรือ path ที่ผู้ประเมินเปิดได้
4. ถ้า rubric ต้องการหลักฐานครบทุก endpoint ให้เพิ่ม integration tests ที่ยังขาดใน Latest Test Evidence แล้วรัน `npm test` และ `npm run build` อีกครั้ง
5. ตรวจการส่งมอบไฟล์/ลิงก์และสิทธิ์เข้าถึงก่อนกำหนดส่ง

**ความเสี่ยงคงเหลือ:** คะแนนด้านการต่อยอดงานแรกและ UX ขึ้นกับหลักฐานเปรียบเทียบ/การตรวจจริง; คลิปนำเสนอและข้อมูลสมาชิกยังไม่ได้ระบุ; preview streaming และ error edge cases บางส่วนยังไม่มี automated integration coverage; iTunes อาจไม่พร้อมใช้งานแม้แอปจะรองรับ error/retry.
