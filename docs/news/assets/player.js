// The Villager News viewer: plays one edition full screen. Each edition's page (news/<slug>/index.html,
// written by tools/build_news.py) loads this with <body data-slug="...">.
// The editor's preview (news/editor/preview.html) uses it too, with <body data-source="preview">.
// Arrow keys, space, click (left third goes back) or swipe to move; F for full screen; #slide-3 links to a page.
import {
  renderPage,
  renderTicker,
  startTicker,
  layoutSlide,
  fontsReady,
  fit,
  loadEdition,
} from './news.js?v=4af17cf6';

const BASE = '../';
const body = document.body;
const stage = document.getElementById('stage');
const counter = document.getElementById('count');

async function main() {
  let edition;
  try {
    // The editor's Play button hands its draft over in localStorage (news/editor/preview.html).
    edition =
      body.dataset.source === 'preview'
        ? JSON.parse(localStorage.getItem('vn-editor:preview'))
        : await loadEdition(body.dataset.slug, BASE);
    if (!edition || !Array.isArray(edition.pages)) throw new Error('empty');
  } catch (e) {
    stage.innerHTML = `<p style="position:absolute;inset:0;display:grid;place-items:center;font:48px Rubik,sans-serif;color:#2e2a26">This edition couldn't be loaded.</p>`;
    fit(stage);
    return;
  }
  document.title = `${edition.title || 'Villager News'} · Villager News`;
  await fontsReady();

  const pages = edition.pages || [];
  const S = [];
  const F = [];
  for (const p of pages) {
    const { slide, front } = renderPage(p, edition, { base: BASE });
    stage.append(slide, front);
    S.push(slide);
    F.push(front);
  }
  const ticker = renderTicker(edition.ticker);
  stage.appendChild(ticker);
  addEventListener('resize', () => fit(stage));
  fit(stage);
  S.forEach(layoutSlide); // while every slide still shows, so the signs can be measured
  stage.classList.add('vn-play');
  startTicker(ticker);
  const TON = pages.map((p) => p.layout !== 'cover' && p.ticker !== false);

  let i = Math.max(0, Math.min(S.length - 1, (parseInt(location.hash.slice(7)) || 1) - 1));
  let busy = false;

  const upd = () => {
    counter.textContent = `${i + 1} / ${S.length}`;
    history.replaceState(null, '', '#slide-' + (i + 1));
    ticker.classList.toggle('off', !TON[i]);
  };

  function show(n, anim = true) {
    n = Math.max(0, Math.min(S.length - 1, n));
    if (busy || (n === i && S[n].classList.contains('on'))) return;
    const out = S[i];
    const inn = S[n];
    const fo = F[i];
    const fi = F[n];
    if (!anim || out === inn || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      S.forEach((s) => s.classList.remove('on'));
      F.forEach((f) => f.classList.remove('on'));
      inn.classList.add('on');
      fi.classList.add('on');
      i = n;
      upd();
      return;
    }
    const dir = n > i ? 1 : -1;
    const t = out.dataset.transition || 'fade';
    busy = true;
    inn.style.zIndex = 2;
    out.style.zIndex = 1;
    inn.classList.add('on');
    fi.classList.add('on');
    const o =
      t === 'push'
        ? [{ transform: 'translateX(0)' }, { transform: `translateX(${-100 * dir}%)` }]
        : [{ opacity: 1 }, { opacity: 0 }];
    const ii =
      t === 'push'
        ? [{ transform: `translateX(${100 * dir}%)` }, { transform: 'translateX(0)' }]
        : [{ opacity: 0 }, { opacity: 1 }];
    const opt = { duration: t === 'push' ? 520 : 420, easing: 'cubic-bezier(.65,0,.35,1)' };
    out.animate(o, opt);
    fo.animate(o, opt);
    fi.animate(ii, opt);
    inn.animate(ii, opt).onfinish = () => {
      out.classList.remove('on');
      fo.classList.remove('on');
      out.style.zIndex = '';
      inn.style.zIndex = '';
      busy = false;
    };
    i = n;
    upd();
  }

  show(i, false);

  addEventListener('keydown', (e) => {
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
      show(i + 1);
      e.preventDefault();
    }
    if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
      show(i - 1);
      e.preventDefault();
    }
    if (e.key === 'Home') show(0, false);
    if (e.key === 'End') show(S.length - 1, false);
    if (e.key === 'f') document.getElementById('fs').click();
  });
  document.getElementById('prev').onclick = (e) => {
    e.stopPropagation();
    show(i - 1);
  };
  document.getElementById('next').onclick = (e) => {
    e.stopPropagation();
    show(i + 1);
  };
  document.getElementById('fs').onclick = (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };
  addEventListener('click', (e) => {
    if (e.target.closest('#ui, #tune, a')) return;
    show(e.clientX < innerWidth / 3 ? i - 1 : i + 1);
  });
  let tx = null;
  addEventListener('touchstart', (e) => (tx = e.touches[0].clientX), { passive: true });
  addEventListener('touchend', (e) => {
    if (tx === null) return;
    const d = e.changedTouches[0].clientX - tx;
    if (Math.abs(d) > 40) show(d < 0 ? i + 1 : i - 1);
    tx = null;
  });
  setTimeout(() => (document.getElementById('hint').style.opacity = 0), 4000);

  // The intro jingle plays once; browsers may hold sound back until the first click or key.
  if (edition.intro !== false) {
    const au = document.getElementById('intro');
    const tune = document.getElementById('tune');
    let played = false;
    const playIntro = () => {
      if (played) return;
      played = true;
      au.currentTime = 0;
      au.play().catch(() => {});
      tune.classList.remove('show');
    };
    au.play()
      .then(() => (played = true))
      .catch(() => {
        au.pause();
        tune.classList.add('show');
      });
    tune.addEventListener(
      'click',
      (e) => {
        e.stopPropagation();
        playIntro();
      },
      true,
    );
    addEventListener('keydown', () => tune.classList.contains('show') && playIntro(), true);
  }
}

main();
