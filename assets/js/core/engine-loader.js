/**
 * PDF Tools - Dynamic Engine Lazy Loader
 * Promise-cached, non-blocking asynchronous script loader for PDFLib and PDF.js engines.
 */

let pdfLibPromise = null;
let pdfJsPromise = null;

const PDF_LIB_PATH = 'assets/vendor/pdf-lib.min.js';
const PDF_JS_PATH = 'assets/vendor/pdf.min.js';
const PDF_WORKER_PATH = 'assets/vendor/pdf.worker.min.js';

/**
 * Dynamically loads and returns the PDFLib global object.
 * If already loaded (e.g. in test suite), resolves immediately.
 * Cached so concurrent or repeated calls share the same promise.
 *
 * @returns {Promise<any>}
 */
export function ensurePdfLibLoaded() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.PDFLib) {
    return Promise.resolve(window.PDFLib);
  }

  if (pdfLibPromise) {
    return pdfLibPromise;
  }

  pdfLibPromise = new Promise((resolve, reject) => {
    // Check if it became available synchronously
    if (window.PDFLib) {
      return resolve(window.PDFLib);
    }

    // Check if script tag is already in DOM
    const existingScript = document.querySelector('script[src*="pdf-lib.min.js"]');
    if (existingScript) {
      if (window.PDFLib) {
        return resolve(window.PDFLib);
      }
      existingScript.addEventListener('load', () => resolve(window.PDFLib), { once: true });
      existingScript.addEventListener('error', (err) => {
        pdfLibPromise = null;
        reject(new Error('Failed to load PDF-Lib engine: ' + (err?.message || 'Network error')));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = PDF_LIB_PATH;
    script.async = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      resolve(window.PDFLib);
    };

    script.onerror = (err) => {
      pdfLibPromise = null;
      script.remove();
      reject(new Error('Failed to load PDF-Lib engine: ' + (err?.message || 'Network error')));
    };

    (document.head || document.body || document.documentElement).appendChild(script);
  });

  return pdfLibPromise;
}

/**
 * Dynamically loads and returns the pdfjsLib global object.
 * Initializes GlobalWorkerOptions.workerSrc immediately on load.
 * Cached so concurrent or repeated calls share the same promise.
 *
 * @returns {Promise<any>}
 */
export function ensurePdfJsLoaded() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.pdfjsLib) {
    if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_PATH;
    }
    return Promise.resolve(window.pdfjsLib);
  }

  if (pdfJsPromise) {
    return pdfJsPromise;
  }

  pdfJsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_PATH;
      }
      return resolve(window.pdfjsLib);
    }

    const existingScript = document.querySelector('script[src*="pdf.min.js"], script[src*="pdf.js"]');
    if (existingScript) {
      if (window.pdfjsLib) {
        if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_PATH;
        }
        return resolve(window.pdfjsLib);
      }
      existingScript.addEventListener('load', () => {
        if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_PATH;
        }
        resolve(window.pdfjsLib);
      }, { once: true });
      existingScript.addEventListener('error', (err) => {
        pdfJsPromise = null;
        reject(new Error('Failed to load PDF.js engine: ' + (err?.message || 'Network error')));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = PDF_JS_PATH;
    script.async = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_PATH;
      }
      resolve(window.pdfjsLib);
    };

    script.onerror = (err) => {
      pdfJsPromise = null;
      script.remove();
      reject(new Error('Failed to load PDF.js engine: ' + (err?.message || 'Network error')));
    };

    (document.head || document.body || document.documentElement).appendChild(script);
  });

  return pdfJsPromise;
}

/**
 * Ensures both PDF-Lib and PDF.js engines are fully loaded and ready.
 *
 * @returns {Promise<[any, any]>}
 */
export function ensureAllPdfEngines() {
  return Promise.all([ensurePdfLibLoaded(), ensurePdfJsLoaded()]);
}

/**
 * Preload the appropriate engine for a given tool/tab.
 *
 * @param {string} toolName
 */
export function preloadEngineForTool(toolName) {
  switch (toolName) {
    case 'merge':
    case 'remove':
    case 'slides':
    case 'invert':
    case 'compress':
      ensureAllPdfEngines().catch(() => {});
      break;
    case 'images':
    case 'split':
      ensurePdfLibLoaded().catch(() => {});
      break;
    case 'pdftoimages':
      ensurePdfJsLoaded().catch(() => {});
      break;
    default:
      break;
  }
}

/**
 * Setup hover and idle preloading listeners across the page.
 */
export function initEnginePreloader() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // 1. Idle background preload after main content is interactive
  const scheduleIdlePreload = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        ensureAllPdfEngines().catch(() => {});
      }, { timeout: 3500 });
    } else {
      setTimeout(() => {
        ensureAllPdfEngines().catch(() => {});
      }, 1500);
    }
  };

  if (document.readyState === 'complete') {
    scheduleIdlePreload();
  } else {
    window.addEventListener('load', scheduleIdlePreload, { once: true });
  }

  // 2. Interactive hover/touch/focus listeners on tool cards & nav tabs
  const attachPreloadListeners = () => {
    // Nav tab buttons
    document.querySelectorAll('.nav-tab').forEach((tabEl) => {
      const tabName = tabEl.dataset.tab;
      if (!tabName || tabName === 'home') return;
      ['mouseenter', 'touchstart', 'focus'].forEach((evt) => {
        tabEl.addEventListener(evt, () => preloadEngineForTool(tabName), { once: true, passive: true });
      });
    });

    // Tool cards on Home hub
    document.querySelectorAll('[data-launch-tab]').forEach((cardEl) => {
      const tabName = cardEl.dataset.launchTab;
      if (!tabName) return;
      ['mouseenter', 'touchstart', 'focus'].forEach((evt) => {
        cardEl.addEventListener(evt, () => preloadEngineForTool(tabName), { once: true, passive: true });
      });
    });

    // Dropzones across the entire app
    document.querySelectorAll('.dropzone, .universal-dropzone').forEach((dropzoneEl) => {
      ['mouseenter', 'dragenter', 'touchstart'].forEach((evt) => {
        dropzoneEl.addEventListener(evt, () => ensureAllPdfEngines().catch(() => {}), { once: true, passive: true });
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachPreloadListeners, { once: true });
  } else {
    attachPreloadListeners();
  }
}

// Global exposure for debugging, testing, and legacy callers
if (typeof window !== 'undefined') {
  window.ensurePdfLibLoaded = ensurePdfLibLoaded;
  window.ensurePdfJsLoaded = ensurePdfJsLoaded;
  window.ensureAllPdfEngines = ensureAllPdfEngines;
  window.preloadEngineForTool = preloadEngineForTool;
  window.initEnginePreloader = initEnginePreloader;
}
