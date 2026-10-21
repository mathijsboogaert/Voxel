// The site menu. On a phone it folds out from the menu button (each page as its icon and name);
// on wider screens the icons are always in the header and the button is hidden (site.css).
const header = document.querySelector('.site-header');
const toggle = header && header.querySelector('.nav-toggle');

if (toggle) {
  const setOpen = (open) => {
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
  };
  const isOpen = () => header.classList.contains('nav-open');

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  // Close with Escape, by tapping anywhere outside the header, or when the screen grows past phone size.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !header.contains(e.target)) setOpen(false);
  });
  matchMedia('(min-width: 640px)').addEventListener('change', () => setOpen(false));
}
