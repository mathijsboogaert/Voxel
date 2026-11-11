// The Villager News archive (news/): the newest edition large with its cover, the rest as a grid.
// The list comes from news/editions.json (tools/build_news.py); each cover is drawn live from its edition.
import { renderPage, layoutSlide, fontsReady, fit, loadEdition, loadIndex } from './news.js?v=4af17cf6';

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

async function main() {
  const list = await loadIndex();
  await fontsReady();
  if (!list.length) {
    document.getElementById('none').hidden = false;
    return;
  }
  const [first, ...rest] = list;
  const latest = document.getElementById('latest');
  latest.innerHTML = `<article class="nw-latest">
    <a href="${esc(first.slug)}/" aria-label="Play ${esc(first.title)}"><div class="nw-cover">${`<span class="nw-play">${PLAY}</span>`}</div></a>
    <div class="nw-latest__text">
      <p class="nw-meta">Latest · ${esc(when(first.date))}${first.edition ? ' · ' + esc(first.edition) : ''}</p>
      <h2>${esc(first.title)}</h2>
      ${first.summary ? `<p>${esc(first.summary)}</p>` : ''}
      <a class="btn btn--primary" href="${esc(first.slug)}/">Watch the news</a>
    </div>
  </article>`;
  drawCover(latest.querySelector('.nw-cover'), first.slug);

  if (rest.length) {
    document.getElementById('older-title').hidden = false;
    const ul = document.getElementById('older');
    for (const e of rest) {
      const li = document.createElement('li');
      li.innerHTML = `<a href="${esc(e.slug)}/"><div class="nw-cover"><span class="nw-play">${PLAY}</span></div>
        <h3>${esc(e.title)}</h3><p>${esc(when(e.date))}${e.edition ? ' · ' + esc(e.edition) : ''}</p></a>`;
      ul.appendChild(li);
      drawCover(li.querySelector('.nw-cover'), e.slug);
    }
  }
}

main();
