// 갤러리·공연 후 전환 수용 테스트 (PRD 14.10). 임시 자료는 .test-tmp/에만 만들고 지운다.
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

sharp.cache(false); // Windows에서 파일 잠금 방지
const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = path.join(ROOT, '.test-tmp');
const BUILD = path.join(ROOT, 'scripts', 'build.mjs');
const VID = (n) => `https://www.youtube.com/watch?v=${'abcdefghij'.slice(0, 10)}${n}`;

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

async function makeContent(name, { status = 'upcoming', videos = [], meta = {}, photos = [], posters = [], raw = {} } = {}) {
  const dir = path.join(TMP, name, 'content');
  await mkdir(path.join(dir, 'photos'), { recursive: true });
  await mkdir(path.join(dir, 'video-posters'), { recursive: true });
  await writeFile(path.join(dir, 'photos', '.gitkeep'), '');
  await writeFile(path.join(dir, 'event.json'), raw.event ?? JSON.stringify({ status }));
  await writeFile(path.join(dir, 'videos.json'), raw.videos ?? JSON.stringify(videos));
  await writeFile(path.join(dir, 'photos', 'metadata.json'), raw.meta ?? JSON.stringify({ items: meta }));
  for (const p of photos) {
    const file = path.join(dir, 'photos', p.path);
    if (p.bytes) await writeFile(file, p.bytes);
    else {
      let img = sharp({ create: { width: p.w ?? 1600, height: p.h ?? 1200, channels: 3, background: p.color ?? '#7a6a55' } });
      if (p.gps) img = img.withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 33/1 0/1' } });
      await img.jpeg().toFile(file);
    }
  }
  for (const p of posters) await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#333' } }).jpeg().toFile(path.join(dir, 'video-posters', p));
  return dir;
}

async function build(name, content, outName = 'dist') {
  const out = path.join(TMP, name, outName);
  try {
    const r = await run(process.execPath, [BUILD, '--content', content, '--out', out], { env: { ...process.env, SITE_URL: 'https://example.test/circle-of-friends/' } });
    return { ok: true, out, log: r.stdout + r.stderr, html: await readFile(path.join(out, 'index.html'), 'utf8') };
  } catch (e) {
    return { ok: false, out, log: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

const count = (s, re) => (s.match(re) ?? []).length;

await rm(TMP, { recursive: true, force: true });

// 1. 두 갤러리 모두 비어 있음
{
  const r = await build('empty', await makeContent('empty'));
  check('빈 자료: 빌드 성공', r.ok, r.log);
  check('빈 자료: 영상 준비 안내', r.html?.includes('공연 실황과 연습 영상을 준비되는 대로 소개합니다.'));
  check('빈 자료: 사진 준비 안내', r.html?.includes('연습과 공연의 순간을 사진으로 전할 예정입니다.'));
  check('빈 자료: 상단 영상·사진 메뉴 없음', !r.html?.includes('href="#videos">영상') && !r.html?.includes('href="#photos">사진'));
  check('빈 자료: 앵커 유지', r.html?.includes('id="videos"') && r.html?.includes('id="photos"'));
  check('빈 자료: iframe 없음', !r.html?.includes('<iframe'));
  check('빈 자료: 템플릿 표시 남지 않음', !/<!--(if|\/if|slot):/.test(r.html ?? ''));
  check('빈 자료: canonical 절대 주소', r.html?.includes('<link rel="canonical" href="https://example.test/circle-of-friends/">'));
  check('빈 자료: 일정 파일 생성', existsSync(path.join(r.out, 'assets/downloads/concert.ics')));
  const ics = r.ok ? await readFile(path.join(r.out, 'assets/downloads/concert.ics'), 'utf8') : '';
  check('일정 파일: 시작 시각 KST 19:30 = UTC 10:30, 종료 시각 없음', ics.includes('DTSTART:20261111T103000Z') && !ics.includes('DTEND'));
  check('찾아오는 길: 주소·안내·지도 링크', r.html?.includes('<dt>찾아오는 길</dt>') && r.html.includes('강남대로 652') && r.html.includes('신사역(3호선, 신분당선) 6번 출구 353m, 공연 관련 2시간 주차 가능') && !r.html.includes('리버사이드') && r.html.includes('href="https://map.naver.com/p/search/') && /<p class="visit__maps">지도: <a [^>]+>네이버<span class="sr-only"> 지도 \(새 창\)<\/span><\/a>, <a [^>]+>카카오</.test(r.html));
  check('구조화 데이터: 주소', r.html?.includes('"streetAddress":"서울특별시 강남구 강남대로 652'));
  check('일정 파일: 장소에 주소 포함', ics.replace(/\r\n /g, '').includes('LOCATION:거암아트홀\\, 서울특별시 강남구 강남대로 652'));
  check('일정 파일: 75바이트 이하로 줄 접기', ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
  check('404: 홈 링크가 프로젝트 경로', (await readFile(path.join(r.out, '404.html'), 'utf8').catch(() => '')).includes('href="/circle-of-friends/"'));
}

// 2. 사진 한 장만, 메타데이터 없음
{
  const r = await build('one', await makeContent('one', { photos: [{ path: 'photo-001.jpg' }] }));
  check('사진 1장: 빌드 성공', r.ok, r.log);
  check('사진 1장: 카드 생성', count(r.html ?? '', /class="photo-card"/g) === 1);
  check('사진 1장: 기본 대체 텍스트', r.html?.includes('alt="공연 사진 01"'));
  check('사진 1장: 제목·설명 표시 없음', !r.html?.includes('photo-card__title') && !r.html?.includes('photo-card__meta'));
  check('사진 1장: alt 경고', r.log.includes('대체 텍스트(alt)가 없어'));
  check('사진 1장: 사진 메뉴 표시', r.html?.includes('href="#photos">사진'));
  check('사진: 분류 필터 없음', !r.html?.includes('data-filter-group="photo"') && !r.html?.includes('data-category="performance"'));
  check('사진: 갤러리 소개 문구 없음', !r.html?.includes('함께 준비하고 무대에 오른 순간들을 기록합니다.'));
}

// 3. 사진 25장 + 세로·작은 사진 + 하위 폴더 + 무시되는 설명 필드 + GPS
{
  const photos = [];
  for (let i = 1; i <= 22; i++) photos.push({ path: `${String(i).padStart(3, '0')}.jpg` });
  photos.push({ path: 'tall.jpg', w: 900, h: 1600 });
  photos.push({ path: '20261110-small.jpg', w: 300, h: 200, gps: true });
  photos.push({ path: 'IMG 10.jpg' });
  const meta = {
    '022.jpg': { alt: '무대 <b>인사</b>', order: 1, focalPoint: '50% 30%' },
    '001.jpg': { title: '커튼콜', caption: '설명', date: '2026-11-11' },
  };
  const content = await makeContent('many', { photos, meta });
  await mkdir(path.join(content, 'photos', 'old-folder'));
  await sharp({ create: { width: 800, height: 600, channels: 3, background: '#999' } }).jpeg().toFile(path.join(content, 'photos', 'old-folder', 'x.jpg'));
  const r = await build('many', content);
  check('사진 25장: 빌드 성공', r.ok, r.log);
  const html = r.html ?? '';
  check('사진 25장: 카드 25개', count(html, /class="photo-card"/g) === 25);
  check('사진 25장: 13번째부터 처음에 숨김', count(html, /data-page-hidden/g) === 13);
  check('사진 25장: 더 보기 버튼', html.includes('data-photo-more'));
  check('order 1이 맨 앞', /<li class="photo-card" id="([^"]+)"/.exec(html)?.[1] === 'photo-022');
  check('파일 이름 숫자 순 정렬', html.indexOf('id="photo-002"') < html.indexOf('id="photo-010"'));
  check('alt HTML 이스케이프', html.includes('alt="무대 &lt;b&gt;인사&lt;/b&gt;"'));
  check('제목·설명·날짜 필드 무시', !html.includes('커튼콜') && !html.includes('datetime="2026-11-11"') && r.log.includes('"title"는 사진 갤러리에 표시하지 않으므로'));
  check('하위 폴더 경고·제외', r.log.includes('하위 폴더의 사진은 사용하지 않습니다') && !html.includes('photo-x"'));
  check('공백 있는 파일 이름 ID', html.includes('id="photo-img-10"'));
  check('focalPoint 적용', html.includes('object-position: 50% 30%'));
  check('GPS 경고', r.log.includes('촬영 위치(GPS)'));
  check('낮은 해상도 경고', r.log.includes('해상도가 낮습니다'));
  if (r.ok) {
    const files = await readdir(path.join(r.out, 'assets/gallery'));
    const smallLarge = files.find((f) => f.startsWith('photo-20261110-small') && f.endsWith('-large.webp'));
    const meta2 = smallLarge && (await sharp(path.join(r.out, 'assets/gallery', smallLarge)).metadata());
    check('작은 사진 업스케일 없음', meta2 && meta2.width === 300 && meta2.height === 200, JSON.stringify(meta2 && [meta2.width, meta2.height]));
    const tallLarge = files.find((f) => f.startsWith('photo-tall') && f.endsWith('-large.webp'));
    const meta3 = tallLarge && (await sharp(path.join(r.out, 'assets/gallery', tallLarge)).metadata());
    check('세로 사진 비율 유지', meta3 && meta3.width === 900 && meta3.height === 1600);
    check('파생 이미지 메타데이터 제거', !meta2?.exif);
    check('원본 파일 배포 안 함', !existsSync(path.join(r.out, 'content')) && !files.some((f) => f.endsWith('.jpg')));
  }

  // 사진 교체·삭제: 같은 출력 폴더에 다시 빌드하면 이전 파생 파일이 남지 않는다.
  await rm(path.join(content, 'photos', '021.jpg'));
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#224466' } }).jpeg().toFile(path.join(content, 'photos', '020.jpg'));
  const before = r.ok ? (await readdir(path.join(r.out, 'assets/gallery'))).filter((f) => f.startsWith('photo-020-')) : [];
  const r2 = await build('many', content);
  const after = r2.ok ? await readdir(path.join(r2.out, 'assets/gallery')) : [];
  check('사진 삭제: 카드·파생 파일 제거', r2.ok && !r2.html.includes('photo-021') && !after.some((f) => f.startsWith('photo-021-')));
  check('사진 교체: 새 해시 파일명', r2.ok && !after.includes(before[0]) && after.some((f) => f.startsWith('photo-020-')));
}

// 4. 영상
{
  const videos = [
    { id: 'concert-full', title: '전체 실황', youtubeUrl: `${VID(1)}&t=90s&si=abc`, category: 'full', featured: true, published: true, order: 10 },
    { id: 'k498', title: 'Kegelstatt <i>live</i>', youtubeUrl: 'https://youtu.be/abcdefghij2?si=x', category: 'piece', workId: 'mozart-k498', date: '2026-11-11', published: true, poster: 'content/video-posters/k498.jpg' },
    { id: 'k498-b', title: 'Kegelstatt 리허설', youtubeUrl: 'https://m.youtube.com/watch?v=abcdefghij3', category: 'rehearsal', workId: 'mozart-k498', published: true },
    { id: 'shorts', title: '쇼츠', youtubeUrl: 'https://www.youtube.com/shorts/abcdefghij4', category: 'behind', published: true, order: 5 },
    { id: 'draft', title: '초안', youtubeUrl: '', category: 'piece', published: false, poster: 'content/video-posters/draft.jpg' },
  ];
  const r = await build('videos', await makeContent('videos', { videos, posters: ['k498.jpg', 'draft.jpg'] }));
  const html = r.html ?? '';
  check('영상: 빌드 성공', r.ok, r.log);
  check('영상: 공개 4개만 카드', count(html, /<li class="video-card/g) === 4 && !html.includes('id="video-draft"'));
  check('영상: 페이지 진입 시 iframe 없음', !html.includes('<iframe'));
  check('영상: URL 정규화(t·si 제거)', html.includes('href="https://www.youtube.com/watch?v=abcdefghij1"') && !html.includes('si=abc'));
  check('영상: 시작 시각 제거 경고', r.log.includes('시작 시각(t·start)'));
  check('영상: shorts·youtu.be·m. 지원', ['abcdefghij2', 'abcdefghij3', 'abcdefghij4'].every((id) => html.includes(`data-youtube-id="${id}"`)));
  check('영상: featured가 먼저', html.indexOf('id="video-concert-full"') < html.indexOf('id="video-shorts"'));
  check('영상: 곡 연결 링크 2개에 제목 구분', html.includes('href="#video-k498">연주 영상 보기: Kegelstatt &lt;i&gt;live&lt;/i&gt;') && html.includes('href="#video-k498-b"'));
  check('영상: 연결 없는 곡에는 링크 없음', count(html, /연주 영상 보기/g) === 2);
  check('영상: 필터 표시', html.includes('data-filter-group="video"'));
  check('영상: 상단 메뉴 표시', html.includes('href="#videos">영상'));
  check('영상: 제목 이스케이프', !html.includes('<i>live</i>'));
  const gallery = r.ok ? await readdir(path.join(r.out, 'assets/gallery')) : [];
  check('영상: 공개 포스터만 생성', gallery.some((f) => f.startsWith('poster-k498-')) && !gallery.some((f) => f.startsWith('poster-draft-')));
  check('영상(공연 전): Hero 주요 버튼은 프로그램', /hero__actions">\s*<a class="btn btn--primary" href="#program">/.test(html));
}

// 5. 공연 후 전환
{
  const v = [{ id: 'full', title: '실황', youtubeUrl: VID(5), category: 'full', published: true }];
  const a = await build('arch-v', await makeContent('arch-v', { status: 'archived', videos: v }));
  check('archived+영상: 빌드 성공', a.ok, a.log);
  check('archived+영상: 공연 영상 보기 주요 버튼', a.html?.includes('<a class="btn btn--primary" href="#videos">공연 영상 보기</a>'));
  check('archived: 기록 문구', a.html?.includes('거암아트홀에서 열린 공연의 기록입니다.'));
  check('archived: 공연 정보 제목', a.html?.includes('id="visit-title">공연 정보</h2>'));
  check('archived: 일정 추가 숨김·ics 없음', !a.html?.includes('concert.ics') && !existsSync(path.join(a.out, 'assets/downloads/concert.ics')));
  check('archived: 설명 문구 기록형', a.html?.includes('열린 이재용 클라리넷 독주회 Circle of Friends의 프로그램, 연주자 소개와 공연 사진·영상 기록입니다.'));
  check('archived: 주소 유지·찾아오는 길 숨김', a.html?.includes('강남대로 652') && !a.html.includes('찾아오는 길') && !a.html.includes('map.naver.com'));
  check('archived: 초대의 글 유지', a.html?.includes('정성껏 준비한 무대에 여러분을 초대합니다.'));
  const b = await build('arch-0', await makeContent('arch-0', { status: 'archived' }));
  check('archived+영상 0개: 영상 버튼 없음', b.ok && !b.html.includes('공연 영상 보기') && b.html.includes('href="#program">프로그램 보기'));
}

// 6. 비공개 항목만
{
  const r = await build('private', await makeContent('private', {
    videos: [{ id: 'x', title: '초안', youtubeUrl: '', category: 'full', published: false }],
    photos: [{ path: 'hidden.jpg' }],
    meta: { 'hidden.jpg': { published: false } },
  }));
  const gallery = r.ok ? await readdir(path.join(r.out, 'assets/gallery')) : [];
  check('비공개만: 공개 0개로 처리', r.ok && r.html.includes('준비되는 대로') && r.html.includes('전할 예정입니다') && gallery.length === 0);
}

// 7. 잘못된 자료 → 실패, 이전 정상 결과 유지
{
  const name = 'invalid';
  const good = await build(name, await makeContent(`${name}-good`));
  const marker = good.ok ? await readFile(path.join(good.out, 'index.html'), 'utf8') : '';
  const cases = [
    ['잘못된 JSON', { raw: { videos: '[{"id": "a",}]' } }, 'JSON 형식 오류'],
    ['중복 ID', { videos: [{ id: 'a', title: 'A', youtubeUrl: VID(1), category: 'full', published: true }, { id: 'a', title: 'B', youtubeUrl: VID(2), category: 'full', published: true }] }, '중복'],
    ['다른 호스트', { videos: [{ id: 'a', title: 'A', youtubeUrl: 'https://youtube.com.evil.example/watch?v=abcdefghij1', category: 'full', published: true }] }, '유튜브 주소가 아닙니다'],
    ['재생목록', { videos: [{ id: 'a', title: 'A', youtubeUrl: 'https://www.youtube.com/playlist?list=PL123', category: 'full', published: true }] }, '재생목록'],
    ['문자열 "true"', { videos: [{ id: 'a', title: 'A', youtubeUrl: VID(1), category: 'full', published: 'true' }] }, 'published는 true 또는 false'],
    ['featured 2개', { videos: [{ id: 'a', title: 'A', youtubeUrl: VID(1), category: 'full', featured: true, published: true }, { id: 'b', title: 'B', youtubeUrl: VID(2), category: 'full', featured: true, published: true }] }, 'featured'],
    ['없는 사진의 메타데이터', { meta: { 'none.jpg': { alt: 'x' } } }, '사진 파일이 없습니다'],
    ['폴더 경로 키', { meta: { '../event.json': { alt: 'x' } } }, '파일 이름만'],
    ['HEIC 파일', { photos: [{ path: 'a.heic', bytes: Buffer.from('heic') }] }, '지원하지 않는 파일 형식'],
    ['깨진 사진', { photos: [{ path: 'broken.jpg', bytes: Buffer.from('not an image') }] }, '이미지를 읽을 수 없습니다'],
    ['잘못된 상태값', { raw: { event: '{"status":"done"}' } }, 'status 값'],
    ['잘못된 workId', { videos: [{ id: 'a', title: 'A', youtubeUrl: VID(1), category: 'piece', workId: 'brahms', published: true }] }, 'workId'],
    ['잘못된 날짜', { videos: [{ id: 'a', title: 'A', youtubeUrl: VID(1), category: 'piece', date: '2026-02-30', published: true }] }, '올바른 날짜가 아닙니다'],
  ];
  let i = 0;
  for (const [label, opts, expect] of cases) {
    const r = await build(name, await makeContent(`${name}-${i++}`, opts));
    check(`오류(${label}): 빌드 실패`, !r.ok);
    check(`오류(${label}): 원인 출력`, r.log.includes(expect), r.log.split('\n').filter((l) => l.includes('✗')).join(' | '));
    const kept = existsSync(path.join(r.out, 'index.html')) ? await readFile(path.join(r.out, 'index.html'), 'utf8') : '';
    check(`오류(${label}): 이전 결과 유지`, kept === marker && !existsSync(`${r.out}.tmp`));
  }
}

await rm(TMP, { recursive: true, force: true });
console.log(`\n통과 ${passed}건, 실패 ${failures.length}건`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
