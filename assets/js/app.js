/**
 * PDF Tools - Main Orchestrator & Bootloader
 * 100% Client-Side, Secure, and Private ES Module Suite
 */

import { WorkerPoolManager, appWorkerPool } from './core/worker-pool.js';
import {
  mergeState,
  removeState,
  slidesState,
  invertState,
  compressState,
  imagesState,
  pdfToImagesState
} from './core/state.js';
import { elements } from './core/dom.js';
import {
  initTheme,
  trackToolUsage,
  formatBytes,
  formatTimestamp,
  escapeHtml,
  isPasswordProtectedError,
  handleSharePdf
} from './core/utils.js';
import { isValidPdfFile, isValidImageFile } from './core/validators.js';
import { createZipArchive } from './core/zip-builder.js';
import { initPWAInstallBanner } from './core/pwa.js';
import { initCounter, incrementProcessedCounter, getCounterStats } from './core/counter.js';

import { initMergeTab, setDefaultOutputFilename, handleMergeFilesAdded } from './tabs/tab-merge.js';
import { initRemoveTab, handleRemoveFileSelected } from './tabs/tab-remove.js';
import { initSlidesTab, handleSlidesFileSelected } from './tabs/tab-slides.js';
import { initInvertTab, handleInvertFileSelected } from './tabs/tab-invert.js';
import { initCompressTab, handleCompressFileSelected } from './tabs/tab-compress.js';
import { initImagesTab, handleImageFilesAdded } from './tabs/tab-images.js';
import { initPdfToImagesTab, handlePdfToImagesFileSelected } from './tabs/tab-pdftoimages.js';

// Configure PDF.js worker
if (typeof window !== 'undefined' && window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
}

// Global Backward-Compatibility Bindings for Unit Tests & Integrations
if (typeof window !== 'undefined') {
  window.WorkerPoolManager = WorkerPoolManager;
  window.PDF_TOOLS_WORKER_POOL = appWorkerPool;
  window.isValidPdfFile = isValidPdfFile;
  window.isValidImageFile = isValidImageFile;
  window.createZipArchive = createZipArchive;
  window.pdfToImagesState = pdfToImagesState;
  window.mergeState = mergeState;
  window.handleMergeFilesAdded = handleMergeFilesAdded;
  window.switchTab = switchTab;
  window.trackToolUsage = trackToolUsage;
  window.incrementProcessedCounter = incrementProcessedCounter;
  window.getCounterStats = getCounterStats;
}

/**
 * Tab Navigation Controller
 * Switches visible views, updates titles, manages active states, and updates URL hash.
 */
export function switchTab(tab) {
  const {
    tabMergeBtn,
    tabRemoveBtn,
    tabSlidesBtn,
    tabInvertBtn,
    tabCompressBtn,
    tabImagesBtn,
    tabPdfToImagesBtn,
    mergeTabView,
    removeTabView,
    slidesTabView,
    invertTabView,
    compressTabView,
    imagesTabView,
    pdfToImagesTabView,
    appMainSubtitle
  } = elements;

  [tabMergeBtn, tabRemoveBtn, tabSlidesBtn, tabInvertBtn, tabCompressBtn, tabImagesBtn, tabPdfToImagesBtn].forEach((btn) => {
    if (btn) btn.classList.remove('active');
  });

  [mergeTabView, removeTabView, slidesTabView, invertTabView, compressTabView, imagesTabView, pdfToImagesTabView].forEach((view) => {
    if (view) view.classList.add('hidden');
  });

  let activeBtn = null;
  if (tab === 'merge') {
    activeBtn = tabMergeBtn;
    if (tabMergeBtn) tabMergeBtn.classList.add('active');
    if (mergeTabView) mergeTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Sort by timestamp or drag & drop to reorder';
  } else if (tab === 'remove') {
    activeBtn = tabRemoveBtn;
    if (tabRemoveBtn) tabRemoveBtn.classList.add('active');
    if (removeTabView) removeTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Select and remove unwanted pages with live visual preview';
  } else if (tab === 'slides') {
    activeBtn = tabSlidesBtn;
    if (tabSlidesBtn) tabSlidesBtn.classList.add('active');
    if (slidesTabView) slidesTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Fit 3 presentation slides per A4 page for printing & notes';
  } else if (tab === 'invert') {
    activeBtn = tabInvertBtn;
    if (tabInvertBtn) tabInvertBtn.classList.add('active');
    if (invertTabView) invertTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Invert dark PDF pages to clean white paper for hardcopy printing';
  } else if (tab === 'compress') {
    activeBtn = tabCompressBtn;
    if (tabCompressBtn) tabCompressBtn.classList.add('active');
    if (compressTabView) compressTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Compress and shrink large PDF files with zero or visually-lossless quality';
  } else if (tab === 'images') {
    activeBtn = tabImagesBtn;
    if (tabImagesBtn) tabImagesBtn.classList.add('active');
    if (imagesTabView) imagesTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Convert JPG, PNG, and WebP images into a single clean PDF document';
  } else if (tab === 'pdftoimages') {
    activeBtn = tabPdfToImagesBtn;
    if (tabPdfToImagesBtn) tabPdfToImagesBtn.classList.add('active');
    if (pdfToImagesTabView) pdfToImagesTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Convert PDF pages into high-resolution JPG or PNG images & download as ZIP';
  }

  if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
    try {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } catch (e) {
      // Fallback
    }
  }

  if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
    try {
      window.history.replaceState(null, '', '#' + tab);
    } catch (e) {}
  }
  trackToolUsage(tab, 'viewed');
}

/**
 * Main Application Bootloader
 */
export function init() {
  if (!document.getElementById('mergeTabView')) {
    // DOM elements not present (e.g. running inside headless unit tests)
    return;
  }

  initTheme();
  setDefaultOutputFilename();

  // Initialize individual tool tabs
  initMergeTab(switchTab, handleCompressFileSelected);
  initRemoveTab();
  initSlidesTab(switchTab, handleInvertFileSelected);
  initInvertTab(switchTab);
  initCompressTab(switchTab);
  initImagesTab(switchTab, handleCompressFileSelected);
  initPdfToImagesTab();

  // Navigation tab bar click listener
  const navTabsContainer = document.querySelector('.nav-tabs');
  if (navTabsContainer) {
    navTabsContainer.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.nav-tab');
      if (tabBtn && tabBtn.dataset.tab) {
        switchTab(tabBtn.dataset.tab);
      }
    });
  }

  if (elements.tabMergeBtn) elements.tabMergeBtn.addEventListener('click', () => switchTab('merge'));
  if (elements.tabRemoveBtn) elements.tabRemoveBtn.addEventListener('click', () => switchTab('remove'));
  if (elements.tabSlidesBtn) elements.tabSlidesBtn.addEventListener('click', () => switchTab('slides'));
  if (elements.tabInvertBtn) elements.tabInvertBtn.addEventListener('click', () => switchTab('invert'));
  if (elements.tabCompressBtn) elements.tabCompressBtn.addEventListener('click', () => switchTab('compress'));
  if (elements.tabImagesBtn) elements.tabImagesBtn.addEventListener('click', () => switchTab('images'));
  if (elements.tabPdfToImagesBtn) elements.tabPdfToImagesBtn.addEventListener('click', () => switchTab('pdftoimages'));

  initPWAInstallBanner();
  initCounter();

  // Handle URL query parameters and deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab') || window.location.hash.replace('#', '');
  if (tabParam === 'slides') {
    switchTab('slides');
    if (urlParams.get('demo') === 'true') {
      fetch('test_samples/Sample_8_Pages.pdf')
        .then((res) => res.blob())
        .then((blob) => {
          const sampleFile = new File([blob], 'Quarterly_Presentation_Slides.pdf', {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          handleSlidesFileSelected(sampleFile);
        })
        .catch((err) => console.warn('Could not load demo sample:', err));
    }
  } else if (tabParam === 'remove') {
    switchTab('remove');
  } else if (tabParam === 'invert') {
    switchTab('invert');
    if (urlParams.get('demo') === 'true') {
      fetch('test_samples/Dark_Sample_Slides.pdf')
        .then((res) => res.blob())
        .then((blob) => {
          const sampleFile = new File([blob], 'Dark_Theme_Presentation.pdf', {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          handleInvertFileSelected(sampleFile);
        })
        .catch((err) => console.warn('Could not load demo sample:', err));
    }
  } else if (tabParam === 'compress') {
    switchTab('compress');
    if (urlParams.get('demo') === 'true') {
      fetch('test_samples/Sample_8_Pages.pdf')
        .then((res) => res.blob())
        .then((blob) => {
          const sampleFile = new File([blob], 'Large_Merged_Report.pdf', {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          handleCompressFileSelected(sampleFile);
        })
        .catch((err) => console.warn('Could not load demo sample:', err));
    }
  } else if (tabParam === 'images') {
    switchTab('images');
  } else if (tabParam === 'pdftoimages') {
    switchTab('pdftoimages');
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['merge', 'remove', 'slides', 'invert', 'compress', 'images', 'pdftoimages'].includes(hash)) {
      switchTab(hash);
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
