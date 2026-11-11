/**
 * PDF Tools - Modern SaaS Cursor Spotlight Tracking
 * Ultra-smooth Raycast-style dynamic lighting coordinates.
 * Updates --mouse-x and --mouse-y CSS properties using passive pointermove listeners
 * batched via requestAnimationFrame, skipping touch/coarse pointers for performance & battery.
 */

export const SPOTLIGHT_SELECTOR = '.home-tool-card, .saas-spotlight-card, .dropzone';

let isTrackingInitialized = false;
let rafId = null;
const pendingCardUpdates = new Map();

/**
 * Checks whether the current environment / primary input is a coarse pointer / touch-only device.
 * @returns {boolean}
 */
export function isTouchOrCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const hasFine = window.matchMedia('(pointer: fine)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    return Boolean(isCoarse && !hasFine) || Boolean(noHover && !hasFine);
  } catch (e) {
    return false;
  }
}

/**
 * Immediately calculates and schedules mouse coordinate updates on the target card.
 * @param {HTMLElement} card 
 * @param {number} clientX 
 * @param {number} clientY 
 */
export function updateSpotlight(card, clientX, clientY) {
  if (!card || typeof card.getBoundingClientRect !== 'function') return;

  const rect = card.getBoundingClientRect();
  const x = Math.round(clientX - rect.left);
  const y = Math.round(clientY - rect.top);

  pendingCardUpdates.set(card, { x, y });

  if (!rafId) {
    const rAF = (typeof window !== 'undefined' && window.requestAnimationFrame)
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 16);

    rafId = rAF(() => {
      rafId = null;
      for (const [target, coords] of pendingCardUpdates.entries()) {
        try {
          target.style.setProperty('--mouse-x', `${coords.x}px`);
          target.style.setProperty('--mouse-y', `${coords.y}px`);
        } catch (e) {
          // Guard against unmounted or detached elements
        }
      }
      pendingCardUpdates.clear();
    });
  }
}

/**
 * Handles pointermove events passively, filtering out touch pointers.
 * @param {PointerEvent} e 
 * @param {HTMLElement} [explicitCard]
 */
function handlePointerMove(e, explicitCard) {
  // Skip touch pointers to preserve battery and prevent mobile scroll stutter
  if (e.pointerType === 'touch') {
    return;
  }

  const card = explicitCard || (e.target && e.target.closest ? e.target.closest(SPOTLIGHT_SELECTOR) : null);
  if (!card) return;

  updateSpotlight(card, e.clientX, e.clientY);
}

/**
 * Binds pointermove listeners to a single card element.
 * @param {HTMLElement} card 
 */
export function bindSpotlightCard(card) {
  if (!card || card._spotlightBound) return;
  card._spotlightBound = true;

  card.addEventListener('pointermove', (e) => handlePointerMove(e, card), { passive: true });
}

/**
 * Initializes cursor spotlight tracking across .home-tool-card, .saas-spotlight-card, and .dropzone.
 * Safely skips setup on pure touch / coarse-pointer devices to maximize battery efficiency.
 * @param {object} [options]
 * @param {boolean} [options.force=false] Force activation even on touch/coarse devices
 * @returns {boolean} Whether spotlight tracking is active
 */
export function initSpotlightTracking(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  // Preserve battery and responsiveness by skipping pure coarse/touch-only devices
  if (!options.force && isTouchOrCoarsePointer()) {
    return false;
  }

  if (isTrackingInitialized) {
    // Re-scan DOM for newly added elements in case of dynamic tab view hydration
    document.querySelectorAll(SPOTLIGHT_SELECTOR).forEach(bindSpotlightCard);
    return true;
  }

  isTrackingInitialized = true;

  // Bind delegated document-level passive pointermove listener
  document.addEventListener('pointermove', (e) => handlePointerMove(e), { passive: true });

  // Pre-bind all matching elements currently present in the DOM
  document.querySelectorAll(SPOTLIGHT_SELECTOR).forEach(bindSpotlightCard);

  // Observe DOM additions to automatically bind dynamically created cards or dropzones
  const root = document.body || document.documentElement;
  if (typeof MutationObserver !== 'undefined' && root) {
    try {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (node.matches && node.matches(SPOTLIGHT_SELECTOR)) {
                bindSpotlightCard(node);
              }
              if (node.querySelectorAll) {
                node.querySelectorAll(SPOTLIGHT_SELECTOR).forEach(bindSpotlightCard);
              }
            }
          }
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    } catch (e) {
      // MutationObserver fallback
    }
  }

  return true;
}

// Expose globally for legacy scripts, tests, and debugging
if (typeof window !== 'undefined') {
  window.initSpotlightTracking = initSpotlightTracking;
  window.updateSpotlight = updateSpotlight;
  window.bindSpotlightCard = bindSpotlightCard;
  window.isTouchOrCoarsePointer = isTouchOrCoarsePointer;
}
