// 필터·사진 확대·영상 열기·공유. 본문과 카드 목록은 HTML에 이미 있으므로 이 파일이 없어도 내용은 모두 보인다.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

for (const el of $$('[data-js-only]')) el.hidden = false;

// ── 분류 필터 ─────────────────────────────────────────────

function setupFilter(group, onChange) {
  if (!group) return { set() {} };
  const buttons = $$('[data-filter]', group);
  const set = (value) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.filter === value));
    onChange(value);
  };
  group.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (b) set(b.dataset.filter);
  });
  return { set };
}

// ── 영상 ──────────────────────────────────────────────────

const videoList = $('[data-video-list]');
if (videoList) {
  const cards = $$('.video-card', videoList);
  const player = $('[data-player]');
  const frame = $('[data-player-frame]');
  const titleEl = $('[data-player-title]');
  let opener = null;
  let filter = 'all';

  const videoFilter = setupFilter($('[data-filter-group="video"]'), (value) => {
    filter = value;
    for (const c of cards) c.hidden = value !== 'all' && c.dataset.category !== value;
  });

  const close = () => {
    frame.replaceChildren();
    player.hidden = true;
    if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus();
    opener = null;
  };

  const open = (button) => {
    const id = button.dataset.youtubeId;
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    frame.replaceChildren(); // 이전 영상을 제거해 소리가 겹치지 않게 한다
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=0&controls=1&playsinline=1&rel=0`;
    iframe.title = `YouTube 영상: ${button.dataset.title}`;
    iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.addEventListener('error', () => ($('[data-video-error]').hidden = false));
    frame.append(iframe);
    titleEl.textContent = button.dataset.title;
    player.hidden = false;
    opener = button;
    player.scrollIntoView({ block: 'start' });
    titleEl.focus({ preventScroll: true });
  };

  videoList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-video-open]');
    if (b) open(b);
  });
  $('[data-player-close]').addEventListener('click', close);

  // #video-<id> 주소로 들어오면 해당 카드가 필터에 가려지지 않게 한다 (자동 재생은 하지 않음)
  const revealHash = () => {
    const target = location.hash.startsWith('#video-') && document.getElementById(location.hash.slice(1));
    if (!target || !videoList.contains(target)) return;
    if (filter !== 'all' && target.hidden) videoFilter.set('all');
    target.scrollIntoView({ block: 'start' });
  };
  window.addEventListener('hashchange', revealHash);
  revealHash();
}

// ── 사진 ──────────────────────────────────────────────────

const photoList = $('[data-photo-list]');
if (photoList) {
  const PAGE = 12;
  const cards = $$('.photo-card', photoList);
  const more = $('[data-photo-more]');
  const status = $('[data-photo-status]');
  let visible = PAGE;

  const render = (announce) => {
    cards.forEach((c, i) => {
      c.hidden = i >= visible;
      c.removeAttribute('data-page-hidden');
    });
    if (more) more.hidden = cards.length <= visible;
    if (announce) status.textContent = `사진 ${cards.length}장 중 ${Math.min(visible, cards.length)}장을 표시합니다.`;
  };
  render(false);

  more?.addEventListener('click', () => {
    const first = visible;
    visible += PAGE;
    render(true);
    cards[first]?.querySelector('a')?.focus();
  });

  // 확대 보기
  const viewer = $('[data-viewer]');
  const img = $('[data-viewer-img]');
  const vCount = $('[data-viewer-count]');
  const prev = $('[data-viewer-prev]');
  const next = $('[data-viewer-next]');
  let index = 0;
  let opener = null;

  const show = (i) => {
    index = i;
    const a = cards[i].querySelector('a');
    img.src = a.getAttribute('href');
    img.width = Number(a.dataset.width);
    img.height = Number(a.dataset.height);
    img.alt = a.dataset.alt;
    vCount.textContent = `${i + 1} / ${cards.length}`;
    prev.disabled = i === 0;
    next.disabled = i === cards.length - 1;
    if (document.activeElement === prev && prev.disabled) next.focus();
    if (document.activeElement === next && next.disabled) prev.focus();
  };

  photoList.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-photo]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || typeof viewer.showModal !== 'function') return;
    e.preventDefault();
    opener = a;
    viewer.showModal();
    show(cards.indexOf(a.closest('.photo-card')));
    $('[data-viewer-close]').focus();
  });

  prev.addEventListener('click', () => index > 0 && show(index - 1));
  next.addEventListener('click', () => index < cards.length - 1 && show(index + 1));
  $('[data-viewer-close]').addEventListener('click', () => viewer.close());

  viewer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && index > 0) show(index - 1);
    else if (e.key === 'ArrowRight' && index < cards.length - 1) show(index + 1);
    else if (e.key === 'Tab') {
      const focusable = $$('button:not(:disabled)', viewer);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  viewer.addEventListener('close', () => {
    img.removeAttribute('src');
    opener?.focus();
  });

  const revealHash = () => {
    const target = location.hash.startsWith('#photo-') && document.getElementById(location.hash.slice(1));
    if (!target || !photoList.contains(target) || !target.hidden) return;
    const pos = cards.indexOf(target);
    if (pos >= visible) {
      visible = Math.ceil((pos + 1) / PAGE) * PAGE;
      render(false);
    }
    target.scrollIntoView({ block: 'start' });
  };
  window.addEventListener('hashchange', revealHash);
  revealHash();
}

// ── 공유 ──────────────────────────────────────────────────

const share = $('[data-share]');
if (share) {
  const status = $('[data-share-status]');
  const url = $('link[rel="canonical"]')?.href ?? location.href.split('#')[0];
  share.addEventListener('click', async () => {
    status.replaceChildren();
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = '링크를 복사했습니다.';
    } catch {
      const label = document.createElement('label');
      label.textContent = '링크를 복사하지 못했습니다. 아래 주소를 선택해 복사해 주세요.';
      const input = document.createElement('input');
      input.type = 'text';
      input.readOnly = true;
      input.value = url;
      label.append(input);
      status.append(label);
      input.select();
    }
  });
}
