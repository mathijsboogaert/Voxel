// Dedicated worker for tile rendering: each worker loads its own copy of
// the cubiomes WASM module and seeds it independently, so heavy tile
// computation (up to ~1s for a supersampled, zoomed-out tile) runs off
// the main thread and can be parallelized across a small pool of these.
importScripts('cubiomes.js');

let cubiomes = null;
let ready = false;
const pending = []; // {worldX0, worldZ0, w, h, bpp, id} queued before ready

function renderAndReply(req) {
  const { worldX0, worldZ0, w, h, bpp, id } = req;
  const bytes = w * h * 4;
  const ptr = cubiomes._malloc(bytes);
  try {
    cubiomes._render_tile(worldX0, worldZ0, w, h, bpp, ptr);
    // Copy out of the WASM heap into a buffer we can transfer -- the
    // heap buffer itself isn't safe to transfer (it can be detached/
    // resized by later WASM memory growth).
    const pixels = new Uint8ClampedArray(w * h * 4);
    pixels.set(new Uint8ClampedArray(cubiomes.HEAPU8.buffer, ptr, bytes));
    postMessage({ id, pixels }, [pixels.buffer]);
  } finally {
    cubiomes._free(ptr);
  }
}

onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    createCubiomesModule().then((mod) => {
      cubiomes = mod;
      cubiomes.ccall('seed_init', null, ['string'], [msg.seed]);
      ready = true;
      postMessage({ type: 'ready' });
      for (const req of pending) renderAndReply(req);
      pending.length = 0;
    });
  } else if (msg.type === 'render') {
    if (ready) renderAndReply(msg);
    else pending.push(msg);
  }
};
