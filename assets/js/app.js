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
  pdfToImagesState,
  splitState
} from './core/state.js';
import { elements } from './core/dom.js';
import {
  initTheme,
  trackToolUsage,
  formatBytes,
  formatTimestamp,
  escapeHtml,
  isPasswordProtectedError,
  handleSharePdf,
  initShareModal,
  openShareModal,
  closeShareModal
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
import { initSplitTab, handleSplitFileSelected, parseRangeGroups } from './tabs/tab-split.js';
import { initHomeTab } from './tabs/tab-home.js';
import {
  ensurePdfLibLoaded,
  ensurePdfJsLoaded,
  ensureAllPdfEngines,
  preloadEngineForTool,
  initEnginePreloader
} from './core/engine-loader.js';

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
  window.mergeState = mergeState;
  window.removeState = removeState;
  window.slidesState = slidesState;
  window.invertState = invertState;
  window.compressState = compressState;
  window.imagesState = imagesState;
  window.pdfToImagesState = pdfToImagesState;
  window.splitState = splitState;
  window.parseRangeGroups = parseRangeGroups;
  window.handleMergeFilesAdded = handleMergeFilesAdded;
  window.handleCompressFileSelected = handleCompressFileSelected;
  window.handleRemoveFileSelected = handleRemoveFileSelected;
  window.handleSplitFileSelected = handleSplitFileSelected;
  window.handleSlidesFileSelected = handleSlidesFileSelected;
  window.handleInvertFileSelected = handleInvertFileSelected;
  window.handlePdfToImagesFileSelected = handlePdfToImagesFileSelected;
  window.handleImageFilesAdded = handleImageFilesAdded;
  window.switchTab = switchTab;
  window.trackToolUsage = trackToolUsage;
  window.incrementProcessedCounter = incrementProcessedCounter;
  window.getCounterStats = getCounterStats;
  window.openShareModal = openShareModal;
  window.closeShareModal = closeShareModal;
  window.ensurePdfLibLoaded = ensurePdfLibLoaded;
  window.ensurePdfJsLoaded = ensurePdfJsLoaded;
  window.ensureAllPdfEngines = ensureAllPdfEngines;
  window.preloadEngineForTool = preloadEngineForTool;
}

export {
  ensurePdfLibLoaded,
  ensurePdfJsLoaded,
  ensureAllPdfEngines,
  preloadEngineForTool,
  initEnginePreloader
};

/**
 * Tab Navigation Controller
 * Switches visible views, updates titles, manages active states, and updates URL hash.
 */
export function switchTab(tab) {
  const {
    tabHomeBtn,
    tabMergeBtn,
    tabRemoveBtn,
    tabSlidesBtn,
    tabInvertBtn,
    tabCompressBtn,
    tabImagesBtn,
    tabPdfToImagesBtn,
    tabSplitBtn,
    homeTabView,
    mergeTabView,
    removeTabView,
    slidesTabView,
    invertTabView,
    compressTabView,
    imagesTabView,
    pdfToImagesTabView,
    splitTabView,
    appMainSubtitle
  } = elements;

  [tabHomeBtn, tabMergeBtn, tabRemoveBtn, tabSlidesBtn, tabInvertBtn, tabCompressBtn, tabImagesBtn, tabPdfToImagesBtn, tabSplitBtn].forEach((btn) => {
    if (btn) btn.classList.remove('active');
  });

  [homeTabView, mergeTabView, removeTabView, slidesTabView, invertTabView, compressTabView, imagesTabView, pdfToImagesTabView, splitTabView].forEach((view) => {
    if (view) view.classList.add('hidden');
  });

  let activeBtn = null;
  if (tab === 'home') {
    activeBtn = tabHomeBtn;
    if (tabHomeBtn) tabHomeBtn.classList.add('active');
    if (homeTabView) homeTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = '100% In-Browser & Private PDF Tools • Zero Server Uploads';
  } else if (tab === 'merge') {
    activeBtn = tabMergeBtn;
    if (tabMergeBtn) tabMergeBtn.classList.add('active');
    if (mergeTabView) mergeTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Sort by timestamp or drag & drop to reorder';
  } else if (tab === 'remove') {
    activeBtn = tabRemoveBtn;
    if (tabRemoveBtn) tabRemoveBtn.classList.add('active');
    if (removeTabView) removeTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Select, rotate, and organize pages with live visual preview';
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
  } else if (tab === 'split') {
    activeBtn = tabSplitBtn;
    if (tabSplitBtn) tabSplitBtn.classList.add('active');
    if (splitTabView) splitTabView.classList.remove('hidden');
    if (appMainSubtitle) appMainSubtitle.textContent = 'Extract specific page ranges or split into multiple separate PDF documents';
  }

  if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
    try {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } catch (e) {
      // Fallback
    }
  }

  // Update floating mobile navigation label & icon
  const mobileNavTitle = document.getElementById('mobileNavCurrentTitle');
  const mobileNavIcon = document.getElementById('mobileNavCurrentIcon');
  if (mobileNavTitle && mobileNavIcon) {
    const toolMeta = {
      home: { title: 'All Tools', icon: 'grid' },
      merge: { title: 'Merge PDFs', icon: 'merge' },
      split: { title: 'Split PDF', icon: 'split' },
      remove: { title: 'Remove Pages', icon: 'scissors' },
      slides: { title: 'Slides to A4', icon: 'layers' },
      invert: { title: 'Invert Colors', icon: 'sun-moon' },
      compress: { title: 'Compress PDF', icon: 'minimize-2' },
      images: { title: 'Image to PDF', icon: 'images' },
      pdftoimages: { title: 'PDF to Images', icon: 'file-image' }
    };
    const meta = toolMeta[tab] || { title: 'All Tools', icon: 'grid' };
    mobileNavTitle.textContent = meta.title;
    mobileNavIcon.innerHTML = `<svg class="w-3.5 h-3.5 shrink-0" aria-hidden="true"><use href="#lucide-${meta.icon}"></use></svg>`;
  }

  if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
    try {
      window.history.replaceState(null, '', '#' + tab);
    } catch (e) {}
  }
  trackToolUsage(tab, 'viewed');
  return preloadEngineForTool(tab);
}

/**
 * Main Application Bootloader
 */
export async function init() {
  if (!document.getElementById('mergeTabView')) {
    // DOM elements not present (e.g. running inside headless unit tests)
    return;
  }

  initTheme();
  setDefaultOutputFilename();

  // Initialize individual tool tabs
  initMergeTab(switchTab, handleCompressFileSelected);
  initRemoveTab(switchTab, handleCompressFileSelected, handleSplitFileSelected);
  initSlidesTab(switchTab, handleInvertFileSelected);
  initInvertTab(switchTab);
  initCompressTab(switchTab);
  initImagesTab(switchTab, handleCompressFileSelected);
  initPdfToImagesTab();
  initSplitTab(switchTab, handleCompressFileSelected);
  initHomeTab(switchTab, {
    handleMergeFilesAdded,
    handleCompressFileSelected,
    handleRemoveFileSelected,
    handleSplitFileSelected,
    handleSlidesFileSelected,
    handleInvertFileSelected,
    handlePdfToImagesFileSelected,
    handleImageFilesAdded
  });

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
  // Delegated click listener above handles all .nav-tab buttons

  initPWAInstallBanner();
  initCounter();
  initShareModal();
  initEnginePreloader();

  // Mobile Floating Navigation & Quick Action Drawer
  const mobileNavHomeBtn = document.getElementById('mobileNavHomeBtn');
  const mobileNavToolsBtn = document.getElementById('mobileNavToolsBtn');
  const mobileNavThemeBtn = document.getElementById('mobileNavThemeBtn');
  const mobileToolsDrawer = document.getElementById('mobileToolsDrawer');
  const closeMobileDrawerBtn = document.getElementById('closeMobileDrawerBtn');
  const closeMobileDrawerBar = document.getElementById('closeMobileDrawerBar');

  if (mobileNavHomeBtn) {
    mobileNavHomeBtn.addEventListener('click', () => switchTab('home'));
  }

  function openMobileDrawer() {
    if (mobileToolsDrawer) mobileToolsDrawer.classList.remove('hidden');
  }

  function closeMobileDrawer() {
    if (mobileToolsDrawer) mobileToolsDrawer.classList.add('hidden');
  }

  if (mobileNavToolsBtn) {
    mobileNavToolsBtn.addEventListener('click', openMobileDrawer);
  }
  if (closeMobileDrawerBtn) {
    closeMobileDrawerBtn.addEventListener('click', closeMobileDrawer);
  }
  if (closeMobileDrawerBar) {
    closeMobileDrawerBar.addEventListener('click', closeMobileDrawer);
  }
  if (mobileToolsDrawer) {
    mobileToolsDrawer.addEventListener('click', (e) => {
      if (e.target === mobileToolsDrawer) closeMobileDrawer();
    });
  }

  const drawerItems = document.querySelectorAll('[data-drawer-tab]');
  drawerItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.drawerTab;
      closeMobileDrawer();
      if (target) switchTab(target);
    });
  });

  if (mobileNavThemeBtn) {
    mobileNavThemeBtn.addEventListener('click', () => {
      const themeToggle = document.getElementById('themeToggleBtn');
      if (themeToggle) themeToggle.click();
    });
  }

  // Handle URL query parameters and direct deep linking
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab') || window.location.hash.replace('#', '');
  if (tabParam === 'slides') {
    await switchTab('slides').catch(() => {});
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
    await switchTab('remove').catch(() => {});
  } else if (tabParam === 'invert') {
    await switchTab('invert').catch(() => {});
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
    await switchTab('compress').catch(() => {});
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
    await switchTab('images').catch(() => {});
  } else if (tabParam === 'pdftoimages') {
    await switchTab('pdftoimages').catch(() => {});
  } else if (tabParam === 'split') {
    await switchTab('split').catch(() => {});
  } else if (tabParam === 'merge') {
    await switchTab('merge').catch(() => {});
  } else {
    switchTab('home');
  }

  window.addEventListener('hashchange', async () => {
    const hash = window.location.hash.replace('#', '');
    if (['home', 'merge', 'remove', 'slides', 'invert', 'compress', 'images', 'pdftoimages', 'split'].includes(hash)) {
      await switchTab(hash).catch(() => {});
    } else if (!hash) {
      switchTab('home');
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch((err) => console.error('PDF Tools boot error:', err));
    });
  } else {
    init().catch((err) => console.error('PDF Tools boot error:', err));
  }
}

