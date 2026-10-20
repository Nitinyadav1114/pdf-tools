/**
 * PDF Tools - Thumbnail Fullscreen Lightbox & Interactive Zoom
 * Provides high-definition fullscreen modal inspection, smooth panning,
 * multi-level zoom (50% to 300%), rotation, and keyboard/touch navigation.
 */

let modalEl = null;
let contentWrapperEl = null;
let canvasEl = null;
let imageEl = null;
let pageBadgeEl = null;
let titleEl = null;
let zoomPercentEl = null;
let prevBtn = null;
let nextBtn = null;

let currentZoom = 1.0;
let currentRotation = 0;
let panX = 0;
let panY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

let currentConfig = null;
let previousFocusedEl = null;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.5;
const ZOOM_STEP = 0.25;

/**
 * Initializes the Lightbox engine and binds event listeners.
 */
export function initLightbox() {
  if (typeof document === 'undefined') return;

  modalEl = document.getElementById('thumbnailLightboxModal');
  if (!modalEl && document.body) {
    const div = document.createElement('div');
    div.id = 'thumbnailLightboxModal';
    div.className = 'fixed inset-0 z-50 flex flex-col items-center justify-between p-3 sm:p-6 bg-slate-950/85 backdrop-blur-xl hidden transition-all select-none';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Page preview lightbox');
    div.innerHTML = `
      <div class="w-full max-w-5xl flex items-center justify-between text-white py-2 px-3 z-10">
        <div class="flex items-center gap-3 min-w-0">
          <span id="lightboxPageBadge" class="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/20 text-white shrink-0">Page 1 of 1</span>
          <span id="lightboxTitle" class="text-xs sm:text-sm font-medium text-slate-300 truncate max-w-[200px] sm:max-w-md">Preview</span>
        </div>
        <div class="flex items-center gap-2">
          <button id="lightboxCloseBtn" type="button" class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer" aria-label="Close fullscreen preview" title="Close (Esc)">
            <svg class="w-4 h-4" aria-hidden="true"><use href="#lucide-x"></use></svg>
          </button>
        </div>
      </div>
      <div id="lightboxViewport" class="flex-1 w-full max-w-5xl flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing my-2">
        <div id="lightboxContentWrapper" class="transition-transform duration-100 ease-out flex items-center justify-center origin-center">
          <canvas id="lightboxCanvas" class="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl hidden"></canvas>
          <img id="lightboxImage" class="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl hidden" alt="Page preview">
        </div>
      </div>
      <div class="z-10 pb-2">
        <div class="lightbox-toolbar flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full bg-slate-900/90 border border-white/15 backdrop-blur-md shadow-2xl text-white text-xs">
          <button id="lightboxPrevBtn" type="button" class="lightbox-tool-btn" title="Previous Page (Left Arrow)" aria-label="Previous Page">
            <svg class="w-4 h-4 shrink-0" aria-hidden="true" style="transform: rotate(-90deg);"><use href="#lucide-chevron-up"></use></svg>
          </button>
          <div class="w-px h-4 bg-white/20 mx-0.5"></div>
          <button id="lightboxZoomOutBtn" type="button" class="lightbox-tool-btn" title="Zoom Out (-)" aria-label="Zoom Out">
            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-minus"></use></svg>
          </button>
          <span id="lightboxZoomPercent" class="font-mono text-xs px-2 min-w-[45px] text-center text-slate-300">100%</span>
          <button id="lightboxZoomInBtn" type="button" class="lightbox-tool-btn" title="Zoom In (+)" aria-label="Zoom In">
            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-plus"></use></svg>
          </button>
          <button id="lightboxResetZoomBtn" type="button" class="lightbox-tool-btn text-[11px] px-2 font-medium" title="Reset Zoom (Fit to Screen)" aria-label="Reset Zoom">Fit</button>
          <div class="w-px h-4 bg-white/20 mx-0.5"></div>
          <button id="lightboxRotateBtn" type="button" class="lightbox-tool-btn" title="Rotate 90° Clockwise (R)" aria-label="Rotate 90 degrees">
            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#lucide-rotate-cw"></use></svg>
          </button>
          <div class="w-px h-4 bg-white/20 mx-0.5"></div>
          <button id="lightboxNextBtn" type="button" class="lightbox-tool-btn" title="Next Page (Right Arrow)" aria-label="Next Page">
            <svg class="w-4 h-4 shrink-0" aria-hidden="true" style="transform: rotate(-90deg);"><use href="#lucide-chevron-down"></use></svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    modalEl = div;
  }
  if (!modalEl) return;

  contentWrapperEl = document.getElementById('lightboxContentWrapper');
  canvasEl = document.getElementById('lightboxCanvas');
  imageEl = document.getElementById('lightboxImage');
  pageBadgeEl = document.getElementById('lightboxPageBadge');
  titleEl = document.getElementById('lightboxTitle');
  zoomPercentEl = document.getElementById('lightboxZoomPercent');
  prevBtn = document.getElementById('lightboxPrevBtn');
  nextBtn = document.getElementById('lightboxNextBtn');

  // Close handlers
  const closeBtn = document.getElementById('lightboxCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl || e.target.id === 'lightboxViewport') {
      closeLightbox();
    }
  });

  // Zoom buttons
  const zoomInBtn = document.getElementById('lightboxZoomInBtn');
  const zoomOutBtn = document.getElementById('lightboxZoomOutBtn');
  const resetZoomBtn = document.getElementById('lightboxResetZoomBtn');
  const rotateBtn = document.getElementById('lightboxRotateBtn');

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomBy(ZOOM_STEP));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomBy(-ZOOM_STEP));
  if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);
  if (rotateBtn) rotateBtn.addEventListener('click', rotateCW);

  if (prevBtn) prevBtn.addEventListener('click', prevPage);
  if (nextBtn) nextBtn.addEventListener('click', nextPage);

  // Mouse wheel zoom on viewport
  const viewport = document.getElementById('lightboxViewport');
  if (viewport) {
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      zoomBy(delta);
    }, { passive: false });

    // Drag to pan
    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        if (viewport) viewport.style.cursor = 'grab';
      }
    });

    // Touch support for mobile panning
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - panX;
        startY = e.touches[0].clientY - panY;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        panX = e.touches[0].clientX - startX;
        panY = e.touches[0].clientY - startY;
        updateTransform();
      }
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (!modalEl || modalEl.classList.contains('hidden')) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeLightbox();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevPage();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextPage();
        break;
      case '+':
      case '=':
        e.preventDefault();
        zoomBy(ZOOM_STEP);
        break;
      case '-':
      case '_':
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
        break;
      case '0':
        e.preventDefault();
        resetZoom();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        rotateCW();
        break;
    }
  });

  // Global window exports
  window.openLightbox = openLightbox;
  window.closeLightbox = closeLightbox;
  window.zoomLightboxBy = zoomBy;
  window.resetLightboxZoom = resetZoom;
  window.rotateLightboxCW = rotateCW;
}

/**
 * Opens the fullscreen lightbox modal with the provided source.
 * @param {Object} cfg
 * @param {'canvas' | 'image'} cfg.type
 * @param {HTMLCanvasElement} [cfg.canvas]
 * @param {string} [cfg.src]
 * @param {string} [cfg.title]
 * @param {number} [cfg.pageNum]
 * @param {number} [cfg.totalPages]
 * @param {number} [cfg.rotation]
 * @param {Function} [cfg.onPrev]
 * @param {Function} [cfg.onNext]
 * @param {Function} [cfg.onRotate]
 */
export function openLightbox(cfg = {}) {
  if (!modalEl) initLightbox();
  if (!modalEl) return;

  currentConfig = cfg;
  previousFocusedEl = document.activeElement;

  currentZoom = 1.0;
  currentRotation = cfg.rotation || 0;
  panX = 0;
  panY = 0;

  if (titleEl) titleEl.textContent = cfg.title || 'Page Inspection';
  if (pageBadgeEl) {
    if (cfg.pageNum && cfg.totalPages) {
      pageBadgeEl.textContent = `Page ${cfg.pageNum} of ${cfg.totalPages}`;
      pageBadgeEl.classList.remove('hidden');
    } else {
      pageBadgeEl.classList.add('hidden');
    }
  }

  // Configure Prev/Next button states
  if (prevBtn) {
    const hasPrev = typeof cfg.onPrev === 'function' && (!cfg.pageNum || cfg.pageNum > 1);
    prevBtn.disabled = !hasPrev;
    prevBtn.style.opacity = hasPrev ? '1' : '0.3';
    prevBtn.style.cursor = hasPrev ? 'pointer' : 'default';
  }
  if (nextBtn) {
    const hasNext = typeof cfg.onNext === 'function' && (!cfg.pageNum || cfg.pageNum < cfg.totalPages);
    nextBtn.disabled = !hasNext;
    nextBtn.style.opacity = hasNext ? '1' : '0.3';
    nextBtn.style.cursor = hasNext ? 'pointer' : 'default';
  }

  // Display canvas or image
  if (cfg.type === 'canvas' && cfg.canvas) {
    if (imageEl) imageEl.classList.add('hidden');
    if (canvasEl) {
      canvasEl.width = cfg.canvas.width;
      canvasEl.height = cfg.canvas.height;
      const ctx = canvasEl.getContext('2d');
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      ctx.drawImage(cfg.canvas, 0, 0);
      canvasEl.classList.remove('hidden');
    }
  } else if (cfg.src) {
    if (canvasEl) canvasEl.classList.add('hidden');
    if (imageEl) {
      imageEl.src = cfg.src;
      imageEl.classList.remove('hidden');
    }
  }

  updateTransform();

  modalEl.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (typeof window.playAudioCue === 'function') window.playAudioCue('pop');
  if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
}

/**
 * Closes the lightbox modal and cleans up transform states.
 */
export function closeLightbox() {
  if (!modalEl || modalEl.classList.contains('hidden')) return;

  modalEl.classList.add('hidden');
  document.body.style.overflow = '';

  if (previousFocusedEl && typeof previousFocusedEl.focus === 'function') {
    try { previousFocusedEl.focus(); } catch (_) {}
  }

  if (typeof window.playAudioCue === 'function') window.playAudioCue('click');
}

/**
 * Changes zoom level by delta.
 */
export function zoomBy(delta) {
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + delta));
  if (newZoom !== currentZoom) {
    currentZoom = newZoom;
    updateTransform();
    if (typeof window.playAudioCue === 'function') window.playAudioCue('click');
  }
}

/**
 * Resets zoom and pan offsets back to fit-to-screen defaults.
 */
export function resetZoom() {
  currentZoom = 1.0;
  panX = 0;
  panY = 0;
  updateTransform();
  if (typeof window.playAudioCue === 'function') window.playAudioCue('click');
}

/**
 * Rotates the active view by 90 degrees clockwise.
 */
export function rotateCW() {
  currentRotation = (currentRotation + 90) % 360;
  updateTransform();
  if (currentConfig && typeof currentConfig.onRotate === 'function') {
    currentConfig.onRotate(currentRotation);
  }
  if (typeof window.playAudioCue === 'function') window.playAudioCue('toggle');
}

/**
 * Navigates to previous page if callback is provided.
 */
export function prevPage() {
  if (currentConfig && typeof currentConfig.onPrev === 'function') {
    resetZoom();
    currentConfig.onPrev();
    if (typeof window.playAudioCue === 'function') window.playAudioCue('toggle');
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
  }
}

/**
 * Navigates to next page if callback is provided.
 */
export function nextPage() {
  if (currentConfig && typeof currentConfig.onNext === 'function') {
    resetZoom();
    currentConfig.onNext();
    if (typeof window.playAudioCue === 'function') window.playAudioCue('toggle');
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
  }
}

/**
 * Updates the CSS transform matrix on the content wrapper and updates UI percentage.
 */
function updateTransform() {
  if (contentWrapperEl) {
    contentWrapperEl.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${currentZoom}) rotate(${currentRotation}deg)`;
  }
  if (zoomPercentEl) {
    zoomPercentEl.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}
