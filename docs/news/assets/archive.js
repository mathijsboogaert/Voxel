// The Villager News archive (news/): the newest edition large with its cover, the rest as a grid.
// The list comes from news/editions.json (tools/build_news.py); each cover is drawn live from its edition.
import { renderPage, layoutSlide, fontsReady, fit, loadEdition, loadIndex } from './news.js?v=bf52e32f';

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l15 9-15 9z"/></svg>';
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const when = (d) => {
  const t = new Date(d + 'T12:00:00');
  return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Draws an edition's first page into a box, scaled to fit, and keeps it fitted. */
async function drawCover(box, slug) {
  try {
    const ed = await loadEdition(slug);
    const stage = document.createElement('div');
    stage.className = 'vn-stage';
    const { slide, front } = renderPage(ed.pages[0], ed);
    stage.append(slide, front);
    box.prepend(stage);
    fit(stage, box);
    layoutSlide(slide);
    new ResizeObserver(() => fit(stage, box)).observe(box);
  } catch {
    /* the cover stays empty */
  }
}

/** "15 November 2026 · 21 pages": the line under an edition's name. */
const meta = (e) => [when(e.date), e.pages ? `${e.pages} pages` : ''].filter(Boolean).join(' · ');

/** An edition's name: "Edition #2" or "Special Edition". The show's own name is already the page title. */
const name = (e) => e.edition || e.title;

async function main() {
  const list = await loadIndex();
  await fontsReady();
  if (!list.length) {
    document.getElementById('none').hidden = false;
    return;
  }
  const [first, ...rest] = list;
  document.getElementById('latest-section').hidden = false;
  const latest = document.getElementById('latest');
  latest.innerHTML = `<article class="nw-latest">
    <a class="nw-cover-link" href="${esc(first.slug)}/" aria-label="Play ${esc(name(first))}"><div class="nw-cover"><span class="nw-play">${PLAY}</span></div></a>
    <div class="nw-latest__text">
      <h3 class="nw-latest__name">${esc(name(first))}</h3>
      <p class="nw-latest__meta">${esc(meta(first))}</p>
      ${first.summary ? `<p class="nw-latest__summary">${esc(first.summary)}</p>` : ''}
      <a class="btn btn--primary" href="${esc(first.slug)}/">Watch ${esc(name(first))}</a>
    </div>
  </article>`;
  drawCover(latest.querySelector('.nw-cover'), first.slug);

  if (rest.length) {
    document.getElementById('older-section').hidden = false;
    const ul = document.getElementById('older');
    for (const e of rest) {
      const li = document.createElement('li');
      li.innerHTML = `<a class="nw-item" href="${esc(e.slug)}/"><div class="nw-cover"><span class="nw-play">${PLAY}</span></div>
        <h3 class="nw-item__name">${esc(name(e))}</h3>
        <p class="nw-item__meta">${esc(meta(e))}</p>
        ${e.summary ? `<p class="nw-item__summary">${esc(e.summary)}</p>` : ''}</a>`;
      ul.appendChild(li);
      drawCover(li.querySelector('.nw-cover'), e.slug);
    }
  }
}

main();
