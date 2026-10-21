// 정적 사이트 생성기: content/의 사진·영상·공연 상태를 검증하고 src/index.html 템플릿에 채워 dist/를 만든다.
// 사용법: node scripts/build.mjs [--content <dir>] [--out <dir>]   (SITE_URL 환경 변수로 최종 주소 전달)
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : fallback;
};
const CONTENT = argValue('--content', path.join(ROOT, 'content'));
const OUT = argValue('--out', path.join(ROOT, 'dist'));
const TMP = `${OUT}.tmp`;
const SRC = path.join(ROOT, 'src');

const errors = [];
const warnings = [];
const fail = (where, msg, fix) => errors.push(`${where}: ${msg}${fix ? `\n    → ${fix}` : ''}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ── 공통 상수 ────────────────────────────────────────────────

const EVENT = {
  name: '이재용 클라리넷 독주회',
  nameEn: 'JAEYONG LEE CLARINET RECITAL',
  subtitle: 'Circle of Friends',
  start: '2026-11-11T19:30:00+09:00',
  startUtc: '20261111T103000Z',
  venue: '거암아트홀',
};
const WORK_IDS = ['bozza-aria', 'mozart-k498', 'babin-hillandale', 'schumann-op94', 'mangani-tre-danze'];
const VIDEO_CATEGORIES = {
  full: '전체 실황',
  piece: '곡별 연주',
  rehearsal: '연습·리허설',
  behind: '무대 뒤',
};
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const PAGE_SIZE = 12;

// ── 도구 ────────────────────────────────────────────────────

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const isHidden = (name) => name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini';
const isInt = (n) => Number.isInteger(n) && n >= 0;

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function formatDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

async function readJson(file, fallbackMissing) {
  const where = rel(file);
  if (!existsSync(file)) {
    if (fallbackMissing !== undefined) return fallbackMissing;
    fail(where, '파일이 없습니다.', '저장소에서 파일을 다시 만들어 주세요.');
    return undefined;
  }
  const text = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(where, `JSON 형식 오류 (${e.message})`, '쉼표·따옴표·괄호를 확인하세요. 마지막 항목 뒤에는 쉼표를 쓰지 않습니다.');
    return undefined;
  }
}

const shortHash = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 10);

// ── 공연 상태·사이트 정보 ──────────────────────────────────

async function loadEvent() {
  const file = path.join(CONTENT, 'event.json');
  const data = await readJson(file);
  if (data === undefined) return 'upcoming';
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail(rel(file), '객체 형식이어야 합니다.', '{ "status": "upcoming" } 형식으로 작성하세요.');
    return 'upcoming';
  }
  if (data.status !== 'upcoming' && data.status !== 'archived') {
    fail(rel(file), `status 값 "${data.status}"은(는) 허용되지 않습니다.`, '"upcoming"(공연 전) 또는 "archived"(공연 후)만 사용하세요.');
    return 'upcoming';
  }
  return data.status;
}

async function loadSite() {
  const file = path.join(SRC, 'site.json');
  const data = (await readJson(file)) ?? {};
  const site = {};
  for (const key of ['venueAddress', 'admission', 'contact']) {
    const v = data[key];
    if (v === null || v === undefined || v === '') site[key] = null;
    else if (typeof v === 'string') site[key] = v.trim();
    else fail(rel(file), `${key}는 문자열 또는 null이어야 합니다.`);
  }
  const httpsUrl = (v, where) => {
    try {
      const u = new URL(v);
      if (u.protocol !== 'https:') throw new Error();
      return u.href;
    } catch {
      fail(rel(file), `${where}는 https:// 로 시작하는 주소여야 합니다.`);
      return null;
    }
  };
  site.ticketUrl = data.ticketUrl ? httpsUrl(data.ticketUrl, 'ticketUrl') : null;

  site.directions = [];
  if (data.directions != null) {
    if (!Array.isArray(data.directions) || data.directions.some((d) => typeof d !== 'string'))
      fail(rel(file), 'directions는 문자열 배열이어야 합니다.', '예: ["지하철 3호선 신사역 인근"]');
    else site.directions = data.directions.map((d) => d.trim()).filter(Boolean);
  }
  site.maps = [];
  if (data.maps != null) {
    if (!Array.isArray(data.maps)) fail(rel(file), 'maps는 배열이어야 합니다.', '예: [{ "label": "네이버 지도", "url": "https://…" }]');
    else
      data.maps.forEach((m, i) => {
        if (!m || typeof m.label !== 'string' || !m.label.trim()) return fail(rel(file), `maps ${i + 1}번째 항목에 label이 필요합니다.`);
        const url = httpsUrl(m.url, `maps ${i + 1}번째 항목의 url`);
        if (url) site.maps.push({ label: m.label.trim(), url });
      });
  }
  return site;
}

// ── 유튜브 URL ─────────────────────────────────────────────

const YT_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYoutube(input) {
  let u;
  try {
    u = new URL(String(input).trim());
  } catch {
    return { error: '올바른 URL이 아닙니다.' };
  }
  if (u.protocol !== 'https:') return { error: 'https:// 로 시작해야 합니다.' };
  const host = u.hostname.toLowerCase();
  let id = null;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] ?? '';
  } else if (YT_HOSTS.has(host)) {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts[0] === 'shorts' || parts[0] === 'live') id = parts[1];
    else if (parts[0] === 'playlist') return { error: '재생목록 주소입니다. 개별 영상의 주소를 넣어 주세요.' };
    else return { error: '채널 또는 지원하지 않는 유튜브 주소입니다. 개별 영상의 주소를 넣어 주세요.' };
    if (!id && u.searchParams.get('list')) return { error: '재생목록 주소입니다. 개별 영상의 주소를 넣어 주세요.' };
  } else {
    return { error: `유튜브 주소가 아닙니다 (호스트: ${host}).` };
  }
  if (!id || !YT_ID.test(id)) return { error: '영상 ID(11자리)를 찾을 수 없습니다.' };
  const hadTime = u.searchParams.has('t') || u.searchParams.has('start');
  return { id, url: `https://www.youtube.com/watch?v=${id}`, hadTime };
}

// ── 영상 ──────────────────────────────────────────────────

const VIDEO_FIELDS = new Set(['id', 'title', 'youtubeUrl', 'category', 'date', 'description', 'poster', 'workId', 'order', 'featured', 'published']);

async function loadVideos() {
  const file = path.join(CONTENT, 'videos.json');
  const where = rel(file);
  const data = await readJson(file);
  if (data === undefined) return [];
  if (!Array.isArray(data)) {
    fail(where, '배열([ ... ]) 형식이어야 합니다.', '영상이 없으면 [] 로 두세요.');
    return [];
  }
  const ids = new Set();
  const out = [];
  data.forEach((v, i) => {
    const at = `${where} [${i + 1}번째 항목${v && typeof v.id === 'string' ? ` "${v.id}"` : ''}]`;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(at, '객체({ ... }) 형식이어야 합니다.');
    for (const k of Object.keys(v)) if (!VIDEO_FIELDS.has(k)) warn(at, `알 수 없는 필드 "${k}"는 무시합니다.`);

    if (typeof v.published !== 'boolean') fail(at, 'published는 true 또는 false여야 합니다 (따옴표 없이).');
    if (typeof v.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.id))
      fail(at, 'id는 소문자 영문·숫자·하이픈만 사용할 수 있습니다.', '예: "concert-full"');
    else if (ids.has(v.id)) fail(at, `id "${v.id}"가 중복되었습니다.`, '각 영상에 서로 다른 id를 지정하세요.');
    else ids.add(v.id);
    if (typeof v.title !== 'string' || !v.title.trim()) fail(at, 'title(영상 제목)이 필요합니다.');
    if (!Object.hasOwn(VIDEO_CATEGORIES, v.category))
      fail(at, `category "${v.category}"는 허용되지 않습니다.`, `${Object.keys(VIDEO_CATEGORIES).join(', ')} 중 하나를 사용하세요.`);
    if (v.date != null && !validDate(v.date)) fail(at, `date "${v.date}"가 올바른 날짜가 아닙니다.`, 'YYYY-MM-DD 형식 또는 null');
    if (v.description != null && typeof v.description !== 'string') fail(at, 'description은 문자열이어야 합니다.');
    if (v.workId != null && !WORK_IDS.includes(v.workId)) fail(at, `workId "${v.workId}"를 찾을 수 없습니다.`, `${WORK_IDS.join(', ')} 중 하나 또는 null`);
    if (v.order != null && !isInt(v.order)) fail(at, 'order는 0 이상의 정수여야 합니다.');
    if (v.featured != null && typeof v.featured !== 'boolean') fail(at, 'featured는 true 또는 false여야 합니다.');
    if (v.poster != null) {
      const p = String(v.poster).replaceAll('\\', '/');
      const posterDir = path.join(CONTENT, 'video-posters');
      const resolved = path.join(CONTENT, p.replace(/^content\//, ''));
      if (!p.startsWith('content/video-posters/') || p.split('/').includes('..') || !resolved.startsWith(posterDir + path.sep))
        fail(at, `poster 경로 "${p}"는 content/video-posters/ 안의 파일이어야 합니다.`);
      else if (!existsSync(resolved)) fail(at, `poster 파일 "${p}"가 없습니다.`, '파일 이름의 대소문자까지 확인하세요.');
      else v._posterFile = resolved;
    }

    if (v.published !== true) return;
    const yt = parseYoutube(v.youtubeUrl ?? '');
    if (yt.error) return fail(at, `youtubeUrl: ${yt.error}`, '예: https://www.youtube.com/watch?v=XXXXXXXXXXX 또는 https://youtu.be/XXXXXXXXXXX');
    if (yt.hadTime) warn(at, '시작 시각(t·start) 매개변수를 제거했습니다. 영상은 처음부터 재생됩니다.');
    out.push({
      id: v.id,
      title: v.title?.trim(),
      category: v.category,
      date: v.date ?? null,
      description: (v.description ?? '').trim(),
      workId: v.workId ?? null,
      order: v.order ?? 1000,
      featured: v.featured === true,
      youtubeId: yt.id,
      url: yt.url,
      posterFile: v._posterFile ?? null,
    });
  });

  const featured = out.filter((v) => v.featured);
  if (featured.length > 1) fail(where, `featured: true인 공개 영상이 ${featured.length}개입니다 (${featured.map((v) => v.id).join(', ')}).`, '대표 영상 1개만 true로 두세요.');
  const seen = new Map();
  for (const v of out) {
    if (seen.has(v.youtubeId)) warn(where, `"${seen.get(v.youtubeId)}"와 "${v.id}"가 같은 유튜브 영상입니다.`);
    else seen.set(v.youtubeId, v.id);
  }
  out.sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      a.order - b.order ||
      (a.date && b.date ? b.date.localeCompare(a.date) : a.date ? -1 : b.date ? 1 : 0) ||
      a.id.localeCompare(b.id),
  );
  return out;
}

// ── 사진 ──────────────────────────────────────────────────
// 사진은 분류 없이 content/photos/에 바로 넣고, 화면에는 설명 없이 사진만 보여 준다.

const META_FIELDS = new Set(['alt', 'order', 'published', 'focalPoint']);
const IGNORED_FIELDS = new Set(['title', 'caption', 'date']);
const FOCAL = /^(\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/;
const byName = (a, b) => a.localeCompare(b, 'en', { numeric: true });

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function scanPhotos() {
  const dir = path.join(CONTENT, 'photos');
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (isHidden(entry.name) || entry.name === 'metadata.json') continue;
    const where = `content/photos/${entry.name}`;
    if (entry.isDirectory()) {
      warn(`${where}/`, '하위 폴더의 사진은 사용하지 않습니다. 사진을 content/photos/에 바로 넣어 주세요.');
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!PHOTO_EXT.has(ext)) {
      fail(where, `지원하지 않는 파일 형식(${ext || '확장자 없음'})입니다.`, 'JPG·PNG·WebP로 변환해 다시 올리세요. HEIC·RAW·동영상은 사용할 수 없습니다.');
      continue;
    }
    files.push({ name: entry.name, key: entry.name, file: path.join(dir, entry.name) });
  }
  return files.sort((a, b) => byName(a.key, b.key));
}

async function loadPhotos() {
  const metaFile = path.join(CONTENT, 'photos', 'metadata.json');
  const where = rel(metaFile);
  const meta = (await readJson(metaFile, { items: {} })) ?? { items: {} };
  let items = {};
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || typeof meta.items !== 'object' || meta.items === null || Array.isArray(meta.items))
    fail(where, '{ "items": { ... } } 형식이어야 합니다.');
  else items = meta.items;

  const files = await scanPhotos();
  const byKey = new Map(files.map((f) => [f.key, f]));
  // 대소문자만 다른 키를 안내하기 위한 색인
  const lowerKeys = new Map(files.map((f) => [f.key.toLowerCase(), f.key]));

  for (const [key, m] of Object.entries(items)) {
    const at = `${where} "${key}"`;
    if (key.includes('..') || key.includes('/') || key.includes('\\') || path.isAbsolute(key)) {
      fail(at, '키에는 폴더 경로 없이 사진 파일 이름만 씁니다.', '예: "20261111-001.jpg"');
      continue;
    }
    if (!byKey.has(key)) {
      const hint = lowerKeys.get(key.toLowerCase());
      fail(at, '이 이름의 사진 파일이 없습니다.', hint ? `대소문자를 확인하세요. 실제 파일: "${hint}"` : '사진을 지웠다면 이 메타데이터 항목도 함께 지우세요.');
      continue;
    }
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      fail(at, '객체({ ... }) 형식이어야 합니다.');
      continue;
    }
    for (const k of Object.keys(m)) {
      if (IGNORED_FIELDS.has(k)) warn(at, `"${k}"는 사진 갤러리에 표시하지 않으므로 무시합니다.`);
      else if (!META_FIELDS.has(k)) warn(at, `알 수 없는 필드 "${k}"는 무시합니다.`);
    }
    if (m.alt != null && typeof m.alt !== 'string') fail(at, 'alt는 문자열이어야 합니다.');
    if (m.order != null && !isInt(m.order)) fail(at, 'order는 0 이상의 정수여야 합니다.');
    if (m.published != null && typeof m.published !== 'boolean') fail(at, 'published는 true 또는 false여야 합니다 (따옴표 없이).');
    if (m.focalPoint != null) {
      const fm = FOCAL.exec(String(m.focalPoint));
      if (!fm || Number(fm[1]) > 100 || Number(fm[2]) > 100) fail(at, `focalPoint "${m.focalPoint}"가 올바르지 않습니다.`, '"50% 40%"처럼 0~100% 값 두 개를 쓰세요.');
    }
  }

  const usedIds = new Set();
  const photos = [];
  files.forEach((f, i) => {
    const m = items[f.key] && typeof items[f.key] === 'object' ? items[f.key] : {};
    if (m.published === false) return;
    const alt = typeof m.alt === 'string' && m.alt.trim() ? m.alt.trim() : null;
    if (!alt) warn(`content/photos/${f.key}`, '대체 텍스트(alt)가 없어 ‘공연 사진 번호’로 읽힙니다. 화면 낭독기 사용자를 위해 사진 내용을 metadata.json의 alt에 적어 주세요.');
    const base = `photo-${slugify(path.parse(f.name).name) || shortHash(Buffer.from(f.name))}`;
    let id = base;
    for (let k = 2; usedIds.has(id); k++) id = `${base}-${k}`;
    usedIds.add(id);
    photos.push({
      ...f,
      id,
      alt: alt ?? `공연 사진 ${String(i + 1).padStart(2, '0')}`,
      order: m.order ?? 1000,
      focal: FOCAL.test(String(m.focalPoint ?? '')) ? m.focalPoint : '50% 50%',
    });
  });
  photos.sort((a, b) => a.order - b.order || byName(a.key, b.key));
  return photos;
}

// EXIF 버퍼에 GPS IFD 포인터(태그 0x8825)가 있는지 확인한다.
function hasGps(exif) {
  if (!exif || exif.length < 14) return false;
  const tiff = exif.indexOf('Exif\0\0') === 0 ? 6 : 0;
  const le = exif.toString('ascii', tiff, tiff + 2) === 'II';
  const r16 = (o) => (le ? exif.readUInt16LE(o) : exif.readUInt16BE(o));
  const r32 = (o) => (le ? exif.readUInt32LE(o) : exif.readUInt32BE(o));
  try {
    const ifd = tiff + r32(tiff + 4);
    const n = r16(ifd);
    for (let i = 0; i < n; i++) if (r16(ifd + 2 + i * 12) === 0x8825) return true;
  } catch {
    return false;
  }
  return false;
}

async function processPhoto(p, outDir) {
  const where = `content/photos/${p.key}`;
  const buf = await readFile(p.file);
  let meta;
  try {
    meta = await sharp(buf).metadata();
    await sharp(buf).rotate().resize(16).toBuffer(); // 실제 디코딩 검사
  } catch (e) {
    fail(where, `이미지를 읽을 수 없습니다 (${e.message}).`, '파일이 손상되었거나 확장자와 실제 형식이 다릅니다. 다시 저장해 올리세요.');
    return null;
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  const w = rotated ? meta.height : meta.width;
  const h = rotated ? meta.width : meta.height;
  const long = Math.max(w, h);
  if (buf.length > 10 * 1024 * 1024 || long > 3000) warn(where, `원본이 큽니다 (${(buf.length / 1048576).toFixed(1)}MB, ${w}×${h}px). 긴 변 약 3000px·10MB 이하로 줄여 올리는 것을 권장합니다.`);
  if (long < 960) warn(where, `해상도가 낮습니다 (${w}×${h}px). 확대 화면에서 작게 보일 수 있습니다.`);
  if (hasGps(meta.exif)) warn(where, '원본에 촬영 위치(GPS) 정보가 있습니다. 공개 저장소에서 누구나 내려받을 수 있으니 위치 정보를 지운 파일로 교체하세요.');

  const hash = shortHash(buf);
  const stem = `${p.id}-${hash}`;
  const thumbs = [];
  for (const tw of [480, 960]) {
    if (tw > w && thumbs.length) break;
    const width = Math.min(tw, w);
    const name = `${stem}-${width}.webp`;
    const info = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(outDir, name));
    thumbs.push({ name, width: info.width, height: info.height });
    if (width < tw) break;
  }
  const largeName = `${stem}-large.webp`;
  const large = await sharp(buf)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(outDir, largeName));
  return { ...p, thumbs, large: { name: largeName, width: large.width, height: large.height } };
}

async function processPoster(v, outDir) {
  try {
    const buf = await readFile(v.posterFile);
    const name = `poster-${v.id}-${shortHash(buf)}.webp`;
    await sharp(buf).rotate().resize({ width: 960, height: 540, fit: 'cover', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(outDir, name));
    return name;
  } catch (e) {
    fail(`content/video-posters/${path.basename(v.posterFile)}`, `대표 이미지를 읽을 수 없습니다 (${e.message}).`);
    return null;
  }
}

// ── HTML 조각 ─────────────────────────────────────────────

function filterButtons(kind, cats, labels) {
  if (cats.length < 2) return '';
  const btn = (value, label, pressed) =>
    `<li><button type="button" class="filter__btn" data-filter="${value}" aria-pressed="${pressed}">${esc(label)}</button></li>`;
  return `<ul class="filter" data-filter-group="${kind}" role="list" aria-label="${kind === 'photo' ? '사진' : '영상'} 분류" hidden data-js-only>
          ${btn('all', '전체', true)}
          ${cats.map((c) => btn(c, labels[c], false)).join('\n          ')}
        </ul>`;
}

function renderVideos(videos) {
  return videos
    .map((v) => {
      const meta = [VIDEO_CATEGORIES[v.category], v.date ? `<time datetime="${v.date}">${formatDate(v.date)} 촬영</time>` : '']
        .filter(Boolean)
        .join(' · ');
      const poster = v.poster
        ? `<img src="assets/gallery/${v.poster}" alt="" width="960" height="540" loading="lazy" decoding="async">`
        : `<span class="video-card__panel" aria-hidden="true"><span>${esc(v.title)}</span></span>`;
      return `<li class="video-card${v.featured ? ' video-card--featured' : ''}" id="video-${v.id}" data-category="${v.category}">
            <div class="video-card__poster">${poster}</div>
            <div class="video-card__body">
              <h3 class="video-card__title">${esc(v.title)}</h3>
              <p class="video-card__meta">${meta}</p>
              ${v.description ? `<p class="video-card__desc">${esc(v.description)}</p>` : ''}
              <div class="video-card__actions">
                <button type="button" class="btn btn--primary" data-video-open data-youtube-id="${v.youtubeId}" data-title="${esc(v.title)}" hidden data-js-only>영상 열기<span class="sr-only">: ${esc(v.title)}</span></button>
                <a class="link" href="${esc(v.url)}" target="_blank" rel="noopener">YouTube에서 보기<span class="sr-only">: ${esc(v.title)} (새 창)</span></a>
              </div>
            </div>
          </li>`;
    })
    .join('\n          ');
}

function renderPhotos(photos) {
  return photos
    .map((p, i) => {
      const t = p.thumbs;
      const first = t[0];
      const srcset = t.map((x) => `assets/gallery/${x.name} ${x.width}w`).join(', ');
      return `<li class="photo-card" id="${p.id}"${i >= PAGE_SIZE ? ' data-page-hidden' : ''}>
            <a class="photo-card__link" href="assets/gallery/${p.large.name}" data-photo
              data-alt="${esc(p.alt)}" data-width="${p.large.width}" data-height="${p.large.height}">
              <img src="assets/gallery/${first.name}" srcset="${srcset}" sizes="(min-width: 1024px) 340px, (min-width: 480px) 46vw, 92vw"
                width="${first.width}" height="${first.height}" alt="${esc(p.alt)}" loading="lazy" decoding="async" style="object-position: ${p.focal}">
              <span class="sr-only"> (크게 보기)</span>
            </a>
          </li>`;
    })
    .join('\n          ');
}

function renderWorkVideos(videos, workId) {
  const list = videos.filter((v) => v.workId === workId);
  if (!list.length) return '';
  const many = list.length > 1;
  return `<p class="work__videos">${list
    .map((v) => `<a class="link" href="#video-${v.id}">연주 영상 보기${many ? `: ${esc(v.title)}` : ''}</a>`)
    .join(' ')}</p>`;
}

function renderMeta({ siteUrl, status, site }) {
  const description =
    status === 'archived'
      ? '2026년 11월 11일 거암아트홀에서 열린 이재용 클라리넷 독주회 Circle of Friends의 프로그램, 연주자 소개와 공연 사진·영상 기록입니다.'
      : '2026년 11월 11일 오후 7시 30분, 거암아트홀. 이재용과 김태희·류성진·채승엽이 함께하는 Circle of Friends의 프로그램과 연주자 소개를 만나보세요.';
  const lines = [
    `<meta name="description" content="${esc(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta property="og:site_name" content="Circle of Friends">`,
    `<meta property="og:title" content="이재용 클라리넷 독주회 | Circle of Friends">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: `${EVENT.name} — ${EVENT.subtitle}`,
    startDate: EVENT.start,
    location: {
      '@type': 'Place',
      name: EVENT.venue,
      ...(site.venueAddress && { address: { '@type': 'PostalAddress', streetAddress: site.venueAddress, addressLocality: '서울특별시', addressCountry: 'KR' } }),
    },
    performer: [
      { '@type': 'Person', name: '이재용' },
      { '@type': 'Person', name: '김태희' },
      { '@type': 'Person', name: '류성진' },
      { '@type': 'Person', name: '채승엽' },
    ],
  };
  if (siteUrl) {
    const og = new URL('assets/images/og-image.jpg', siteUrl).href;
    lines.push(
      `<link rel="canonical" href="${esc(siteUrl)}">`,
      `<meta property="og:url" content="${esc(siteUrl)}">`,
      `<meta property="og:image" content="${esc(og)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="이재용 클라리넷 독주회 Circle of Friends, 2026년 11월 11일 거암아트홀">`,
    );
    ld.url = siteUrl;
    ld.image = og;
  }
  lines.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return lines.join('\n    ');
}

// RFC 5545: 한 줄이 75바이트를 넘으면 CRLF + 공백으로 접는다 (UTF-8 문자를 자르지 않음).
function foldIcsLine(line) {
  const parts = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length ? 74 : 75;
    if (Buffer.byteLength(current + ch) > limit) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function renderIcs(site) {
  const location = site.venueAddress ? `${EVENT.venue}, ${site.venueAddress}` : EVENT.venue;
  const icsText = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Circle of Friends//Recital//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:circle-of-friends-20261111@jaeyong-lee-recital',
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${EVENT.startUtc}`,
    `SUMMARY:${icsText(`${EVENT.name} — ${EVENT.subtitle}`)}`,
    `LOCATION:${icsText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(foldIcsLine)
    .join('\r\n')
    .concat('\r\n');
}

// 템플릿 처리: <!--if:name--> … <!--/if:name--> 블록과 <!--slot:name--> 자리 표시자
function applyTemplate(html, flags, slots) {
  let out = html;
  let prev;
  do {
    prev = out;
    out = out.replace(/<!--if:([a-z0-9-]+)-->([\s\S]*?)<!--\/if:\1-->/g, (_, name, body) => {
      if (!Object.hasOwn(flags, name)) throw new Error(`템플릿 조건 "${name}"이 정의되지 않았습니다.`);
      return flags[name] ? body : '';
    });
  } while (out !== prev);
  out = out.replace(/<!--slot:([a-z0-9:-]+)-->/g, (_, name) => {
    if (!Object.hasOwn(slots, name)) throw new Error(`템플릿 자리 "${name}"이 정의되지 않았습니다.`);
    return slots[name];
  });
  return out;
}

// ── 폰트 ──────────────────────────────────────────────────

async function buildFonts(outDir) {
  // 제목용 명조만 자체 호스팅한다. 본문은 성능 예산을 위해 시스템 고딕(맑은 고딕·Apple SD 산돌고딕 Neo 등)을 쓴다.
  // unicode-range로 나뉜 파일이라 페이지에 쓰인 글자 범위의 파일만 내려받고, 없는 글자는 폴백 글꼴로 표시된다.
  const sources = [['noto-serif-kr', '600']];
  await mkdir(outDir, { recursive: true });
  const css = [];
  for (const [pkg, weight] of sources) {
    const dir = path.join(ROOT, 'node_modules', '@fontsource', pkg);
    const text = await readFile(path.join(dir, `${weight}.css`), 'utf8');
    const rewritten = text.replace(/src: url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\), url\([^)]+\) format\('woff'\);/g, (_, f) => `src: url(./${f}) format('woff2');`);
    for (const m of rewritten.matchAll(/url\(\.\/([^)]+\.woff2)\)/g)) await cp(path.join(dir, 'files', m[1]), path.join(outDir, m[1]));
    css.push(rewritten);
    await cp(path.join(dir, 'LICENSE'), path.join(outDir, `LICENSE-${pkg}.txt`));
  }
  const minified = css
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{};:,])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  await writeFile(path.join(outDir, 'fonts.css'), minified);
}

// ── 실행 ──────────────────────────────────────────────────

async function main() {
  const started = Date.now();
  let siteUrl = process.env.SITE_URL?.trim() || null;
  if (siteUrl) {
    try {
      const u = new URL(siteUrl);
      if (!u.pathname.endsWith('/')) u.pathname += '/';
      siteUrl = u.href;
    } catch {
      fail('SITE_URL', `"${siteUrl}"가 올바른 주소가 아닙니다.`);
    }
  }

  const status = await loadEvent();
  const site = await loadSite();
  const videos = await loadVideos();
  const photos = await loadPhotos();
  if (errors.length) return report(false);

  await rm(TMP, { recursive: true, force: true });
  const galleryDir = path.join(TMP, 'assets', 'gallery');
  await mkdir(galleryDir, { recursive: true });

  const builtPhotos = [];
  for (const p of photos) {
    const r = await processPhoto(p, galleryDir);
    if (r) builtPhotos.push(r);
  }
  for (const v of videos) v.poster = v.posterFile ? await processPoster(v, galleryDir) : null;
  if (errors.length) {
    await rm(TMP, { recursive: true, force: true });
    return report(false);
  }

  const template = await readFile(path.join(SRC, 'index.html'), 'utf8');
  const archived = status === 'archived';
  const hasVideos = videos.length > 0;
  const hasPhotos = builtPhotos.length > 0;
  const videoCats = Object.keys(VIDEO_CATEGORIES).filter((c) => videos.some((v) => v.category === c));
  const flags = {
    upcoming: !archived,
    archived,
    videos: hasVideos,
    'no-videos': !hasVideos,
    photos: hasPhotos,
    'no-photos': !hasPhotos,
    'archived-videos': archived && hasVideos,
    'not-archived-videos': !(archived && hasVideos),
    address: Boolean(site.venueAddress),
    directions: (site.directions.length > 0 || site.maps.length > 0) && !archived,
    ticket: Boolean(site.ticketUrl) && !archived,
    admission: Boolean(site.admission) && !archived,
    contact: Boolean(site.contact) && !archived,
    'photo-more': builtPhotos.length > PAGE_SIZE,
  };
  const slots = {
    meta: renderMeta({ siteUrl, status, site }),
    address: esc(site.venueAddress),
    directions: [
      site.directions.length ? `<ul class="visit__directions" role="list">${site.directions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '',
      site.maps.length
        ? `<p class="visit__maps">지도: ${site.maps.map((m) => `<a class="link link--inverse" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.label)}<span class="sr-only"> 지도 (새 창)</span></a>`).join(', ')}</p>`
        : '',
    ].join(''),
    'ticket-url': esc(site.ticketUrl),
    admission: esc(site.admission),
    contact: esc(site.contact),
    'video-filters': filterButtons('video', videoCats, VIDEO_CATEGORIES),
    'video-list': renderVideos(videos),
    'photo-list': renderPhotos(builtPhotos),
    'photo-total': String(builtPhotos.length),
  };
  for (const id of WORK_IDS) slots[`work-videos:${id}`] = renderWorkVideos(videos, id);

  const html = applyTemplate(template, flags, slots);
  await writeFile(path.join(TMP, 'index.html'), html);

  const homeHref = siteUrl ? new URL(siteUrl).pathname : '/';
  const notFound = (await readFile(path.join(SRC, '404.html'), 'utf8')).replaceAll('<!--slot:home-->', esc(homeHref));
  await writeFile(path.join(TMP, '404.html'), notFound);

  for (const sub of ['css', 'js', 'images', 'downloads'])
    await cp(path.join(SRC, 'assets', sub), path.join(TMP, 'assets', sub), { recursive: true, filter: (s) => !isHidden(path.basename(s)) });
  if (!archived) await writeFile(path.join(TMP, 'assets', 'downloads', 'concert.ics'), renderIcs(site));
  await buildFonts(path.join(TMP, 'assets', 'fonts'));
  await writeFile(path.join(TMP, '.nojekyll'), '');

  await rm(OUT, { recursive: true, force: true });
  await rename(TMP, OUT);
  console.log(`상태: ${archived ? 'archived (공연 후)' : 'upcoming (공연 전)'} · 영상 ${videos.length}개 · 사진 ${builtPhotos.length}장`);
  console.log(`사이트 주소: ${siteUrl ?? '(미지정 — canonical·OG 주소 생략)'}`);
  console.log(`${rel(OUT)}/ 생성 완료 (${((Date.now() - started) / 1000).toFixed(1)}초)`);
  return report(true);
}

function report(ok) {
  if (warnings.length) {
    console.warn(`\n경고 ${warnings.length}건 (배포는 계속됩니다)`);
    for (const w of warnings) console.warn(`  ! ${w}`);
  }
  if (!ok) {
    console.error(`\n오류 ${errors.length}건 — 새 버전을 만들지 않았습니다. 공개 사이트는 이전 버전이 유지됩니다.`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch(async (e) => {
    console.error(e);
    await rm(TMP, { recursive: true, force: true });
    process.exitCode = 1;
  });
}
