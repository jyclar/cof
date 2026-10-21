# 이재용 클라리넷 독주회 — Circle of Friends

2026년 11월 11일(수) 오후 7시 30분, 거암아트홀에서 열리는 공연의 안내·기록 사이트입니다.
공연 전에는 초대장과 디지털 프로그램북으로, 공연 후에는 사진·영상 기록으로 쓰입니다.

요구사항 문서: [Circle_of_Friends_Web_PRD.md](Circle_of_Friends_Web_PRD.md)

- 사진은 GitHub의 `content/photos/` 폴더에 올리고, 영상은 유튜브에 올린 뒤 `content/videos.json`에 링크만 적습니다.
- 파일을 커밋하면 GitHub Actions가 자료를 검사하고 사이트를 새로 만들어 배포합니다. **HTML·CSS를 고칠 필요가 없습니다.**
- 자료에 오류가 있으면 배포하지 않고, 공개 사이트는 마지막 정상 버전 그대로 유지됩니다.

---

## 1. 처음 한 번만: 저장소와 GitHub Pages 설정

1. GitHub에 저장소를 만들고 이 폴더의 파일을 올립니다(`node_modules/`, `dist/`는 올리지 않습니다).
2. 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
3. **Actions** 탭에서 `Build and deploy`가 초록색 체크로 끝나면, Settings → Pages에 표시된 주소로 사이트가 열립니다.
4. 주소가 정해지면 카카오톡 대화방에 링크를 붙여 미리보기(제목·사진)를 확인합니다.
   미리보기가 예전 상태로 보이면 [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing)에서 주소를 넣고 캐시를 초기화합니다.

> 저장소가 공개 상태면 올린 사진 원본도 누구나 내려받을 수 있습니다. 게시해도 되는 자료만 올리세요.

## 2. 공연 후 해야 할 일

공연이 끝난 뒤 아래 1~3을 원하는 순서로 하면 됩니다. 한꺼번에 하지 않아도 됩니다.

1. **공연 후 화면으로 바꾸기** — `content/event.json`을 열고 연필(Edit) 버튼을 누른 뒤
   `"upcoming"`을 `"archived"`로 바꾸고 **Commit changes**를 누릅니다.
   ```json
   { "status": "archived" }
   ```
   바뀌는 것: 첫 화면에 “공연의 기록입니다” 문구, 영상이 있으면 ‘공연 영상 보기’ 버튼,
   ‘공연 안내’ → ‘공연 정보’(찾아오는 길·지도·일정 추가 숨김, 주소는 유지), 검색·공유 설명 문구.
   초대의 글·프로필·프로그램은 그대로 남습니다. 되돌리려면 다시 `"upcoming"`으로 바꿉니다.
2. **공연 사진 올리기** — 아래 3장.
3. **영상 등록하기** — 아래 4장.
4. **확인** — Actions가 초록색으로 끝난 뒤 사이트를 새로고침해 확인합니다. 반영까지 보통 몇 분이 걸리지만 시간이 정해져 있지는 않습니다.

## 3. 사진 올리기

사진은 분류 없이 한 폴더에 넣고, 사이트에는 제목·설명 없이 사진만 보입니다.

### 올리기 전에

- **사진 속 사람의 게시 동의**를 확인합니다. 관객이 알아볼 수 있게 찍힌 사진, 미성년자나 공개를 원하지 않는 사람이 나온 사진은 동의 없이 올리지 않습니다.
- **위치 정보(GPS)를 지웁니다.** 휴대전화에서 공유할 때 ‘위치 정보 포함’을 끄거나, 사진 정보 편집에서 위치를 삭제합니다.
  사이트에 보이는 사진에서는 자동으로 지워지지만, 저장소에 올린 원본에는 남습니다.
- **크기를 줄입니다.** 긴 변 약 3000px, 10MB 이하를 권장합니다(웹 업로드는 파일당 25MB까지).
- 형식은 **JPG·PNG·WebP**만 됩니다. 아이폰 HEIC는 JPG로 바꿔 올립니다.

### 올리는 방법

1. GitHub에서 `content/photos/` 폴더를 엽니다.
2. **Add file → Upload files**로 사진을 끌어 놓고 **Commit changes**를 누릅니다.
3. 끝입니다. 사진은 **파일 이름 순서**로 보입니다.

순서를 맞추려면 파일 이름을 `001.jpg`, `002.jpg`…처럼 번호로 지으면 됩니다.
`content/photos/` 안에 폴더를 만들어 넣은 사진은 사용하지 않습니다.

### 대체 텍스트·순서 적기 (선택)

화면에는 보이지 않지만, 화면 낭독기를 쓰는 분을 위해 사진 내용을 적어 두면 좋습니다.
`content/photos/metadata.json`에 **파일 이름**을 키로 적습니다.

```json
{
  "items": {
    "001.jpg": {
      "alt": "무대 위에서 네 연주자가 나란히 서서 관객에게 인사하는 모습",
      "order": 1,
      "focalPoint": "50% 35%"
    },
    "014.jpg": {
      "published": false
    }
  }
}
```

| 항목 | 뜻 | 적지 않으면 |
|---|---|---|
| `alt` | 화면 낭독기용 설명. **사진에 실제로 보이는 내용**을 구체적으로 | ‘공연 사진 01’처럼 번호로 읽힘(빌드 경고) |
| `order` | 작은 숫자가 먼저 (0 이상 정수) | 1000 (그다음은 파일 이름 순) |
| `published` | `false`면 사이트에서 숨김 | 표시함 |
| `focalPoint` | 목록 썸네일에서 중심으로 둘 위치 `"가로% 세로%"` | `"50% 50%"` |

### 고치기·숨기기·지우기

| 하고 싶은 일 | 방법 |
|---|---|
| 사진 교체 | 같은 이름으로 다시 업로드 |
| 순서 변경 | 파일 이름을 바꾸거나 `metadata.json`의 `order` 수정 |
| 잠시 숨김 | `metadata.json`에 `"published": false` (저장소에서는 여전히 보입니다) |
| 완전히 삭제 | 사진 파일을 지우고, `metadata.json`에 그 사진 항목이 있으면 **같이** 지웁니다 |
| 파일 이름 변경 | 새 사진으로 취급됩니다. `metadata.json`의 키도 새 이름으로 바꿉니다 |

## 4. 영상 등록하기

1. 영상을 유튜브에 올리고, 공개 범위를 ‘공개’ 또는 ‘일부 공개’로, **퍼가기 허용**을 켭니다.
   말소리(인사말·해설)가 있으면 유튜브에 한국어 자막을 등록해 주세요.
2. `content/videos.json`을 열고 항목을 추가합니다. 처음 상태는 `[]`입니다.

```json
[
  {
    "id": "concert-full",
    "title": "Circle of Friends — 공연 전체 실황",
    "youtubeUrl": "https://www.youtube.com/watch?v=영상ID11자리",
    "category": "full",
    "date": "2026-11-11",
    "description": "",
    "poster": null,
    "workId": null,
    "order": 10,
    "featured": true,
    "published": true
  },
  {
    "id": "mozart-kegelstatt",
    "title": "Mozart — Kegelstatt Trio",
    "youtubeUrl": "https://youtu.be/영상ID11자리",
    "category": "piece",
    "date": "2026-11-11",
    "workId": "mozart-k498",
    "order": 20,
    "published": true
  }
]
```

| 항목 | 규칙 |
|---|---|
| `id` | **필수.** 영문 소문자·숫자·하이픈. 다른 영상과 겹치지 않게, 한 번 정하면 바꾸지 않기 |
| `title` | **필수.** 사이트에 보일 제목 |
| `youtubeUrl` | 공개할 때 **필수.** `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`, `youtube.com/live/…` |
| `category` | **필수.** `full` 전체 실황 · `piece` 곡별 연주 · `rehearsal` 연습·리허설 · `behind` 무대 뒤 |
| `published` | **필수.** `true`여야 사이트에 보임. 따옴표 없이 `true`/`false` |
| `date` | 실제 촬영일 `"YYYY-MM-DD"`, 모르면 `null` |
| `description` | 짧은 설명 |
| `poster` | 카드 대표 이미지. `content/video-posters/`에 올린 뒤 `"content/video-posters/파일명.jpg"`. 없으면 글자 카드 |
| `workId` | 곡별 영상이면 프로그램에 ‘연주 영상 보기’ 링크가 생김 (아래 표) |
| `order` | 작은 숫자가 먼저 |
| `featured` | 대표 영상 1개만 `true` (목록 맨 위 큰 카드) |

| 곡 | `workId` |
|---|---|
| Bozza — Aria | `bozza-aria` |
| Mozart — Kegelstatt | `mozart-k498` |
| Babin — Hillandale Waltzes | `babin-hillandale` |
| Schumann — Drei Romanzen | `schumann-op94` |
| Mangani — Tre Danze Latine | `mangani-tre-danze` |

- 링크의 시작 시각(`&t=90s`)과 재생목록 정보는 자동으로 지워지고, 영상은 처음부터 재생됩니다.
- 숨기려면 `"published": false`, 지우려면 배열에서 그 항목을 통째로 지웁니다.
- 배포 후 사이트에서 ‘영상 열기’로 실제 재생되는지 확인합니다. 재생이 안 되면 유튜브의 퍼가기 설정을 확인하세요. ‘YouTube에서 보기’ 링크는 항상 함께 표시됩니다.

## 5. 오류가 났을 때

Actions 탭에 빨간 X가 보이면 실패한 실행 → `build` → `Validate content and build site`를 열어 봅니다.
`✗`로 시작하는 줄이 오류이고, `→` 다음 줄이 고치는 방법입니다. 고친 뒤 다시 커밋하면 됩니다.
그 사이 공개 사이트는 마지막 정상 버전 그대로입니다. 잘못 올린 커밋은 되돌려도(Revert) 됩니다.

자주 나는 오류:

- **JSON 쉼표** — 항목 사이에는 쉼표가 필요하고, 마지막 항목 뒤에는 쉼표가 없어야 합니다.
  ```json
  [ { "id": "a", … }, { "id": "b", … } ]
  ```
- **따옴표** — `true`/`false`/`null`/숫자에는 따옴표를 붙이지 않습니다. `"published": "true"`는 오류입니다.
- **대소문자** — `Photo-01.JPG`와 `photo-01.jpg`는 다른 파일입니다. `metadata.json`의 키를 실제 파일 이름과 똑같이 적습니다.
- **지운 사진의 메타데이터** — 사진을 지웠는데 `metadata.json`에 항목이 남아 있으면 오류입니다.
- **지원하지 않는 형식** — HEIC·RAW·동영상 파일은 사진 폴더에 넣을 수 없습니다.

`!`로 시작하는 줄은 경고입니다(배포는 됩니다). alt 설명 누락, 큰 원본, 위치 정보 포함 등을 알려 줍니다.

## 6. 본문 내용 고치기

| 고칠 내용 | 위치 |
|---|---|
| 초대의 글·프로필·프로그램·해설·게스트·크레딧 | `src/index.html` (해당 섹션의 한국어 문장을 찾아 수정) |
| 공연 후 안내 문구 | `src/index.html`에서 `if:archived` 표시 안쪽 |
| 공연 후 검색·공유 설명 | `scripts/build.mjs`의 `renderMeta` |
| 공연장 주소·찾아오는 길·지도·예매·입장료·문의처 | `src/site.json` (값을 넣으면 공연 안내에 나타남, `null`이나 빈 목록이면 숨김) |
| 색상·글꼴·간격 | `src/assets/css/style.css` 맨 위 토큰 |
| 인물 사진 | `src/assets/images/` (현재는 브로셔에서 잘라 낸 이미지. 원본 사진을 받으면 같은 이름·크기로 교체) |

`src/site.json` 현재 값:

```json
{
  "venueAddress": "서울특별시 강남구 강남대로 652 (신사동) 신사스퀘어 4층",
  "directions": ["지하철 3호선·신분당선 신사역 인근", "한남대교 남단, 더 리버사이드호텔 맞은편 신사스퀘어 건물"],
  "maps": [
    { "label": "네이버 지도", "url": "https://map.naver.com/p/search/거암아트홀" },
    { "label": "카카오맵", "url": "https://map.kakao.com/?q=거암아트홀" }
  ],
  "ticketUrl": null,
  "admission": null,
  "contact": null
}
```

주소 출처: 공연 예매 페이지의 장소 정보(강남대로 652, 신사동)와 언론 보도(신사역 인근 신사스퀘어 4층). 지하철 출구 번호·도보 시간처럼 확인되지 않은 정보는 넣지 않았습니다. 공연장에서 공식 안내를 받으면 `directions`에 덧붙이세요.
주소와 지도 링크는 공연장 공식 안내와 대조한 뒤에 넣습니다. 확인되지 않은 정보는 넣지 않습니다.

## 7. 개발자용

Node.js 22 이상이 필요합니다.

```bash
npm ci
```

```bash
npm run build
```

```bash
npm run serve
```

`npm run serve`는 `dist/`를 실제 Pages와 같은 하위 경로(`http://localhost:4173/cof/`)로 보여 줍니다.
canonical·OG 주소까지 확인하려면 `SITE_URL=http://localhost:4173/cof/ npm run build`로 빌드합니다.

```bash
npm test
```

`npm test`는 임시 테스트 사진·영상으로 빈 상태, 사진 25장, 영상, 찾아오는 길, 공연 후 전환, 잘못된 자료 등 시나리오(PRD 14.10)를 검사합니다. 테스트 자료는 `.test-tmp/`에만 만들어지고 배포에 포함되지 않습니다.

| 경로 | 역할 |
|---|---|
| `src/index.html` | 본문 템플릿 |
| `src/assets/` | CSS·JS·이미지·다운로드 |
| `src/site.json` | 주소·지도 등 선택 정보 |
| `content/` | 공연 상태·사진·영상 (운영자가 수정) |
| `scripts/build.mjs` | 검증·이미지 변환·HTML 생성 |
| `scripts/prepare-brochure-assets.mjs` | 브로셔 PNG에서 인물 사진·레터링·공유 이미지를 만드는 1회용 스크립트 |
| `.github/workflows/deploy.yml` | 빌드·배포 |
| `dist/` | 생성 결과물 (직접 수정·커밋하지 않음) |

글꼴: 제목은 Noto Serif KR(SIL Open Font License, `@fontsource/noto-serif-kr`)을 자체 호스팅하고, 본문은 시스템 고딕을 사용합니다. 라이선스 파일은 `dist/assets/fonts/`에 함께 배포됩니다.
