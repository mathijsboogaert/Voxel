// The cover host: Angela's head (her Minecraft skin, drawn as a 3D cube) peeking over the big cover sign,
// with her two hands holding it. Taken as-is from the first edition of Villager News.
const D = {
  p: [
    '#8f5e43',
    '#ffffff',
    '#cffff9',
    '#6dac5f',
    '#548549',
    '#66a159',
    '#649e57',
    '#88c283',
    '#67a35a',
    '#8ac484',
    '#8fcc8a',
    '#8dc988',
    '#a3fff6',
    '#9c6649',
    '#966346',
    '#a16a4c',
    '#8c5c42',
    '#784f39',
    '#946146',
    '#91cf8b',
    '#9adb94',
  ],
  h: {
    front: '00000000111222221333333224455442344664437885468799:;;;:9<<<<<<<<',
    right: '0000000022222111233333312388883233866663788888377::;;999<<<<<<<<',
    left: '0000000022222111233333312386663236666663788888377:7;;::7<<<<<<<<',
    top: '000000000======00>????=00>?@A?=00>?B@?=00>????=00>>>>>>000000000',
    back: '0000000011122222133333322336683233866683788668377:7;;:77<<<<<<<<',
    bottom: '<<<<<<<<<9CCC99<<9CCDC9<<9CDDC9<<9DDDD9<<9DDDD9<<999999<<<<<<<<<',
  },
  a: {
    front: '........11122222........2......22......22......<2......<........',
    right: '........22222111........2......22......2<......2<......2........',
    left: '........22222111........2......22......2<......2<......2........',
    top: '................................................................',
    back: '........11122222........2......22......22......<2......<........',
    bottom: '................................................................',
  },
};
const T = {
  front: 'translateZ(H)',
  back: 'rotateY(180deg) translateZ(H)',
  right: 'rotateY(-90deg) translateZ(H)',
  left: 'rotateY(90deg) translateZ(H)',
  top: 'rotateX(90deg) translateZ(H)',
  bottom: 'rotateX(-90deg) translateZ(H)',
};
const L = { front: 1, back: 0.7, right: 0.8, left: 0.8, top: 1.1, bottom: 0.6 };
const HANDS = [
  '<svg class="vn-hand" aria-label="Angela’s hand" width="120" height="124" viewBox="0 0 120 124"><polygon points="0,28 24,28 24,52 0,52" fill="#fbf7f5"/><polygon points="24,28 48,28 48,52 24,52" fill="#fbf7f5"/><polygon points="48,28 72,28 72,52 48,52" fill="#dfc8c4"/><polygon points="72,28 96,28 96,52 72,52" fill="#dfc8c4"/><polygon points="0,52 24,52 24,76 0,76" fill="#eedfdb"/><polygon points="24,52 48,52 48,76 24,76" fill="#eedfdb"/><polygon points="48,52 72,52 72,76 48,76" fill="#dfc8c4"/><polygon points="72,52 96,52 96,76 72,76" fill="#dfc8c4"/><polygon points="0,76 24,76 24,100 0,100" fill="#fbf7f5"/><polygon points="24,76 48,76 48,100 24,100" fill="#fbf7f5"/><polygon points="48,76 72,76 72,100 48,100" fill="#f6eeeb"/><polygon points="72,76 96,76 96,100 72,100" fill="#f6eeeb"/><polygon points="0,100 24,100 24,124 0,124" fill="#5a8f4f"/><polygon points="24,100 48,100 48,124 24,124" fill="#5a8f4f"/><polygon points="48,100 72,100 72,124 48,124" fill="#5a8f4f"/><polygon points="72,100 96,100 96,124 72,124" fill="#5a8f4f"/><polygon points="24,4 48,4 42,10 18,10" fill="#ffffff"/><polygon points="48,4 72,4 66,10 42,10" fill="#ffffff"/><polygon points="72,4 96,4 90,10 66,10" fill="#ffffff"/><polygon points="96,4 120,4 114,10 90,10" fill="#ffffff"/><polygon points="18,10 42,10 36,16 12,16" fill="#ffffff"/><polygon points="42,10 66,10 60,16 36,16" fill="#f9e0db"/><polygon points="66,10 90,10 84,16 60,16" fill="#f9e0db"/><polygon points="90,10 114,10 108,16 84,16" fill="#f9e0db"/><polygon points="12,16 36,16 30,22 6,22" fill="#ffffff"/><polygon points="36,16 60,16 54,22 30,22" fill="#ffffff"/><polygon points="60,16 84,16 78,22 54,22" fill="#ffffff"/><polygon points="84,16 108,16 102,22 78,22" fill="#ffffff"/><polygon points="6,22 30,22 24,28 0,28" fill="#ffffff"/><polygon points="30,22 54,22 48,28 24,28" fill="#ffffff"/><polygon points="54,22 78,22 72,28 48,28" fill="#fff9f5"/><polygon points="78,22 102,22 96,28 72,28" fill="#fff9f5"/><polygon points="96,28 102,22 102,46 96,52" fill="#a0908d"/><polygon points="102,22 108,16 108,40 102,46" fill="#a0908d"/><polygon points="108,16 114,10 114,34 108,40" fill="#a0908d"/><polygon points="114,10 120,4 120,28 114,34" fill="#a0908d"/><polygon points="96,52 102,46 102,70 96,76" fill="#a0908d"/><polygon points="102,46 108,40 108,64 102,70" fill="#a0908d"/><polygon points="108,40 114,34 114,58 108,64" fill="#a0908d"/><polygon points="114,34 120,28 120,52 114,58" fill="#a0908d"/><polygon points="96,76 102,70 102,94 96,100" fill="#b1aba9"/><polygon points="102,70 108,64 108,88 102,94" fill="#b1aba9"/><polygon points="108,64 114,58 114,82 108,88" fill="#b1aba9"/><polygon points="114,58 120,52 120,76 114,82" fill="#b1aba9"/><polygon points="96,100 102,94 102,118 96,124" fill="#406638"/><polygon points="102,94 108,88 108,112 102,118" fill="#406638"/><polygon points="108,88 114,82 114,106 108,112" fill="#406638"/><polygon points="114,82 120,76 120,100 114,106" fill="#406638"/></svg>',
  '<svg class="vn-hand" aria-label="Angela’s hand" width="120" height="124" viewBox="0 0 120 124"><polygon points="120,28 96,28 96,52 120,52" fill="#fbf7f5"/><polygon points="96,28 72,28 72,52 96,52" fill="#fbf7f5"/><polygon points="72,28 48,28 48,52 72,52" fill="#fbf7f5"/><polygon points="48,28 24,28 24,52 48,52" fill="#dfc8c4"/><polygon points="120,52 96,52 96,76 120,76" fill="#eedfdb"/><polygon points="96,52 72,52 72,76 96,76" fill="#eedfdb"/><polygon points="72,52 48,52 48,76 72,76" fill="#eedfdb"/><polygon points="48,52 24,52 24,76 48,76" fill="#dfc8c4"/><polygon points="120,76 96,76 96,100 120,100" fill="#fbf7f5"/><polygon points="96,76 72,76 72,100 96,100" fill="#fbf7f5"/><polygon points="72,76 48,76 48,100 72,100" fill="#fbf7f5"/><polygon points="48,76 24,76 24,100 48,100" fill="#f6eeeb"/><polygon points="120,100 96,100 96,124 120,124" fill="#5a8f4f"/><polygon points="96,100 72,100 72,124 96,124" fill="#5a8f4f"/><polygon points="72,100 48,100 48,124 72,124" fill="#5a8f4f"/><polygon points="48,100 24,100 24,124 48,124" fill="#5a8f4f"/><polygon points="96,4 72,4 78,10 102,10" fill="#ffffff"/><polygon points="72,4 48,4 54,10 78,10" fill="#ffffff"/><polygon points="48,4 24,4 30,10 54,10" fill="#ffffff"/><polygon points="24,4 0,4 6,10 30,10" fill="#ffffff"/><polygon points="102,10 78,10 84,16 108,16" fill="#ffffff"/><polygon points="78,10 54,10 60,16 84,16" fill="#ffffff"/><polygon points="54,10 30,10 36,16 60,16" fill="#f9e0db"/><polygon points="30,10 6,10 12,16 36,16" fill="#f9e0db"/><polygon points="108,16 84,16 90,22 114,22" fill="#ffffff"/><polygon points="84,16 60,16 66,22 90,22" fill="#ffffff"/><polygon points="60,16 36,16 42,22 66,22" fill="#ffffff"/><polygon points="36,16 12,16 18,22 42,22" fill="#ffffff"/><polygon points="114,22 90,22 96,28 120,28" fill="#ffffff"/><polygon points="90,22 66,22 72,28 96,28" fill="#ffffff"/><polygon points="66,22 42,22 48,28 72,28" fill="#ffffff"/><polygon points="42,22 18,22 24,28 48,28" fill="#fff9f5"/><polygon points="24,28 18,22 18,46 24,52" fill="#a0908d"/><polygon points="18,22 12,16 12,40 18,46" fill="#a0908d"/><polygon points="12,16 6,10 6,34 12,40" fill="#a0908d"/><polygon points="6,10 0,4 0,28 6,34" fill="#a0908d"/><polygon points="24,52 18,46 18,70 24,76" fill="#a0908d"/><polygon points="18,46 12,40 12,64 18,70" fill="#a0908d"/><polygon points="12,40 6,34 6,58 12,64" fill="#a0908d"/><polygon points="6,34 0,28 0,52 6,58" fill="#a0908d"/><polygon points="24,76 18,70 18,94 24,100" fill="#b1aba9"/><polygon points="18,70 12,64 12,88 18,94" fill="#b1aba9"/><polygon points="12,64 6,58 6,82 12,88" fill="#b1aba9"/><polygon points="6,58 0,52 0,76 6,82" fill="#b1aba9"/><polygon points="24,100 18,94 18,118 24,124" fill="#406638"/><polygon points="18,94 12,88 12,112 18,118" fill="#406638"/><polygon points="12,88 6,82 6,106 12,112" fill="#406638"/><polygon points="6,82 0,76 0,100 6,106" fill="#406638"/></svg>',
];

function cube(root, set, size) {
  for (const k in T) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 8;
    const x = cv.getContext('2d');
    const face = set[k];
    for (let i = 0; i < 64; i++) {
      const ch = face[i];
      if (ch === '.') continue;
      x.fillStyle = D.p[ch.charCodeAt(0) - 48];
      x.fillRect(i % 8, (i / 8) | 0, 1, 1);
    }
    cv.style.width = cv.style.height = size + 'px';
    cv.style.left = cv.style.top = -size / 2 + 'px';
    cv.style.filter = 'brightness(' + L[k] + ')';
    cv.style.transform = T[k].replace('H', size / 2 + 'px');
    root.appendChild(cv);
  }
}

/** The host as DOM: the head (left 750, top 30 on the 1920x1080 slide) and both hands. */
export function coverHost() {
  const frag = document.createDocumentFragment();
  const head = document.createElement('div');
  head.className = 'vn-host';
  head.innerHTML = '<div class="as"><div class="ab"><div class="ac"></div></div></div>';
  const ac = head.querySelector('.ac');
  cube(ac, D.h, 210);
  cube(ac, D.a, 226);
  frag.appendChild(head);
  HANDS.forEach((svg, i) => {
    const w = document.createElement('div');
    w.className = 'vn-hand-wrap vn-hand-wrap--' + (i ? 'r' : 'l');
    w.innerHTML = svg;
    frag.appendChild(w);
  });
  return frag;
}
