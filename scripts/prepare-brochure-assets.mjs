// 브로셔 PNG에서 웹용 인물 사진·레터링·공유 이미지·다운로드 파일을 한 번 만들어 src/assets에 저장한다.
// 원본 인물 사진을 확보하면 이 스크립트 대신 해당 파일로 src/assets/images/의 같은 이름을 교체한다.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRONT = path.join(ROOT, '261111_이재용클라리넷연주회_리플렛_인쇄(548x258)_1.png');
const BACK = path.join(ROOT, '261111_이재용클라리넷연주회_리플렛_인쇄(548x258)_2.png');
const IMG = path.join(ROOT, 'src/assets/images');
const DL = path.join(ROOT, 'src/assets/downloads');

// 좌표는 2000px 폭 미리보기 기준이며 원본(4498px)에 맞게 확대한다.
const SCALE = 4498 / 2000;
const box = (x1, y1, x2, y2) => ({
  left: Math.round(x1 * SCALE),
  top: Math.round(y1 * SCALE),
  width: Math.round((x2 - x1) * SCALE),
  height: Math.round((y2 - y1) * SCALE),
});

async function variants(input, name, widths) {
  for (const w of widths) {
    const base = sharp(input).resize({ width: w, withoutEnlargement: true });
    await base.clone().avif({ quality: 55 }).toFile(path.join(IMG, `${name}-${w}.avif`));
    await base.clone().webp({ quality: 80 }).toFile(path.join(IMG, `${name}-${w}.webp`));
    await base.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(IMG, `${name}-${w}.jpg`));
  }
}

// 금색 레터링을 검정 배경에서 분리해 투명 PNG로 만든다.
async function lettering(file, area) {
  const { data, info } = await sharp(file).extract(area).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = 0x17;
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const a = Math.max(0, Math.min(1, (max - bg - 6) / (230 - bg)));
    out[j] = 0xe8;
    out[j + 1] = 0xac;
    out[j + 2] = 0x45;
    out[j + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
}

await mkdir(IMG, { recursive: true });
await mkdir(DL, { recursive: true });

const hero = await sharp(FRONT).extract(box(1320, 150, 1795, 752)).removeAlpha().toBuffer();
await variants(hero, 'hero', [540, 1068]);

const profile = await sharp(BACK).extract(box(100, 114, 355, 460)).removeAlpha().toBuffer();
await variants(profile, 'profile', [574]);

// 게스트 사진은 금색 테두리 안쪽만 사용한다.
const guests = { 'guest-kim': 576, 'guest-ryu': 694, 'guest-chae': 812 };
for (const [name, y] of Object.entries(guests)) {
  const g = await sharp(FRONT).extract(box(95.5, y, 169.5, y + 99)).removeAlpha().toBuffer();
  await variants(g, name, [166]);
}

const letter = await lettering(BACK, box(795, 132, 1205, 201));
await letter.toFile(path.join(IMG, 'circle-of-friends.png'));

// 공유 이미지 1200×630: 브로셔에 인쇄된 제목·일시·장소 글자를 그대로 배치한다.
const titleKo = await sharp(BACK).extract(box(795, 203, 1205, 226)).removeAlpha().resize({ width: 600 }).toBuffer();
const titleBig = await sharp(FRONT).extract(box(885, 448, 1112, 480)).removeAlpha().resize({ width: 540 }).toBuffer();
const letterOg = await (await lettering(BACK, box(795, 132, 1205, 201))).resize({ width: 600 }).toBuffer();
const heroOg = await sharp(hero).resize({ width: 500, height: 630, fit: 'cover', position: 'top' }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#161617' } })
  .composite([
    { input: heroOg, left: 700, top: 0 },
    { input: titleBig, left: 60, top: 170 },
    { input: letterOg, left: 50, top: 270 },
    { input: titleKo, left: 60, top: 420 },
  ])
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(path.join(IMG, 'og-image.jpg'));

await sharp(FRONT).removeAlpha().jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(DL, 'brochure-front.jpg'));
await sharp(BACK).removeAlpha().jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(DL, 'brochure-back.jpg'));

console.log('브로셔 자산을 src/assets에 생성했습니다.');
