/**
 * PDF Tools - Merger & Page Remover
 * 100% Client-Side, Secure, and Private
 */

(function () {
  'use strict';

  // Configure PDF.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
  }

  // ==========================================
  // MULTITHREADED WEB WORKER POOL MANAGER
  // ==========================================
  class WorkerPoolManager {
    constructor(workerPath = 'assets/js/worker.js', maxWorkers = 4) {
      this.workerPath = workerPath;
      const concurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
      this.poolSize = Math.max(1, Math.min(concurrency, maxWorkers));
      this.workers = [];
      this.busyWorkers = new Set();
      this.workerTaskMap = new Map(); // worker -> taskId
      this.queue = [];
      this.isSupported = typeof Worker !== 'undefined';
      this.isAvailable = false;
      this.hasOffscreenCanvas = false;
      this.initPromise = null;
      this.taskIdCounter = 0;
      this.pendingCallbacks = new Map();
    }

    init() {
      if (this.initPromise) return this.initPromise;
      if (!this.isSupported) {
        console.warn('[WorkerPool] Web Workers not supported in this environment, using main thread fallback');
        this.isAvailable = false;
        this.initPromise = Promise.resolve(false);
        return this.initPromise;
      }

      this.initPromise = (async () => {
        try {
          for (let i = 0; i < this.poolSize; i++) {
            const worker = new Worker(this.workerPath);
            worker.onmessage = (e) => this._handleMessage(e, worker);
            worker.onerror = (err) => this._handleError(err, worker);
            this.workers.push(worker);
          }

          const pingResult = await this._pingWorker(this.workers[0]);
          if (pingResult && pingResult.pong) {
            this.isAvailable = true;
            this.hasOffscreenCanvas = !!pingResult.hasOffscreenCanvas;
            console.log(`[WorkerPool] Active with ${this.workers.length} threads (OffscreenCanvas: ${this.hasOffscreenCanvas})`);
          } else {
            console.warn('[WorkerPool] Ping failed, disabling workers');
            this.terminate();
            this.isAvailable = false;
          }
        } catch (err) {
          console.warn('[WorkerPool] Initialization failed (e.g. file:// or CSP policy), using main thread fallback:', err);
          this.terminate();
          this.isAvailable = false;
        }
        return this.isAvailable;
      })();

      return this.initPromise;
    }

    _pingWorker(worker) {
      return new Promise((resolve) => {
        const id = ++this.taskIdCounter;
        const timeout = setTimeout(() => {
          this.pendingCallbacks.delete(id);
          resolve(null);
        }, 1500);

        this.pendingCallbacks.set(id, {
          resolve: (val) => {
            clearTimeout(timeout);
            resolve(val);
          },
          reject: () => {
            clearTimeout(timeout);
            resolve(null);
          }
        });

        try {
          worker.postMessage({ id, type: 'ping' });
        } catch (e) {
          clearTimeout(timeout);
          resolve(null);
        }
      });
    }

    _handleMessage(e, worker) {
      const { id, success, error, fallback, ...rest } = e.data || {};
      this.busyWorkers.delete(worker);
      this.workerTaskMap.delete(worker);

      const cb = this.pendingCallbacks.get(id);
      if (cb) {
        this.pendingCallbacks.delete(id);
        if (success) {
          cb.resolve(rest);
        } else {
          cb.reject(new Error(error || (fallback ? 'WORKER_FALLBACK' : 'Worker task failed')));
        }
      }

      this._drainQueue();
    }

    _handleError(err, worker) {
      console.warn('[WorkerPool] Worker error:', err);
      this.busyWorkers.delete(worker);
      const taskId = this.workerTaskMap.get(worker);
      if (taskId) {
        this.workerTaskMap.delete(worker);
        const cb = this.pendingCallbacks.get(taskId);
        if (cb) {
          this.pendingCallbacks.delete(taskId);
          cb.reject(new Error(err && err.message ? err.message : 'Worker execution error'));
        }
      }
      this._drainQueue();
    }

    _drainQueue() {
      while (this.queue.length > 0) {
        const idleWorker = this.workers.find((w) => !this.busyWorkers.has(w));
        if (!idleWorker) break;

        const task = this.queue.shift();
        this._executeOnWorker(idleWorker, task);
      }
    }

    _executeOnWorker(worker, task) {
      this.busyWorkers.add(worker);
      this.workerTaskMap.set(worker, task.id);
      const { id, type, payload, transferables, resolve, reject, timeoutId } = task;
      this.pendingCallbacks.set(id, { resolve, reject, timeoutId, worker });
      try {
        worker.postMessage({ id, type, payload }, transferables || []);
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        this.busyWorkers.delete(worker);
        this.workerTaskMap.delete(worker);
        this.pendingCallbacks.delete(id);
        reject(err);
      }
    }

    async runTask(type, payload, transferables = [], timeoutMs = 30000) {
      if (this.initPromise && !this.isAvailable) {
        await this.initPromise;
      }
      if (!this.isAvailable) {
        throw new Error('WORKER_UNAVAILABLE');
      }

      return new Promise((resolve, reject) => {
        const id = ++this.taskIdCounter;
        let timeoutId = null;
        if (timeoutMs > 0) {
          timeoutId = setTimeout(() => {
            const cb = this.pendingCallbacks.get(id);
            if (cb) {
              this.pendingCallbacks.delete(id);
              if (cb.worker) {
                this.busyWorkers.delete(cb.worker);
                this.workerTaskMap.delete(cb.worker);
              }
              cb.reject(new Error(`Worker task timed out after ${timeoutMs}ms`));
              this._drainQueue();
            }
          }, timeoutMs);
        }

        const task = {
          id,
          type,
          payload,
          transferables,
          timeoutId,
          resolve: (val) => {
            if (timeoutId) clearTimeout(timeoutId);
            resolve(val);
          },
          reject: (err) => {
            if (timeoutId) clearTimeout(timeoutId);
            reject(err);
          }
        };

        const idleWorker = this.workers.find((w) => !this.busyWorkers.has(w));
        if (idleWorker) {
          this._executeOnWorker(idleWorker, task);
        } else {
          this.queue.push(task);
        }
      });
    }

    terminate() {
      this.workers.forEach((w) => {
        try { w.terminate(); } catch (e) {}
      });
      this.workers = [];
      this.busyWorkers.clear();
      this.workerTaskMap.clear();
      this.queue.forEach((t) => {
        if (t.timeoutId) clearTimeout(t.timeoutId);
        t.reject(new Error('Worker terminated'));
      });
      this.queue = [];
      this.pendingCallbacks.forEach((cb) => {
        if (cb.timeoutId) clearTimeout(cb.timeoutId);
        cb.reject(new Error('Worker terminated'));
      });
      this.pendingCallbacks.clear();
      this.isAvailable = false;
      this.initPromise = null;
    }
  }

  const appWorkerPool = new WorkerPoolManager('assets/js/worker.js');
  // Initialize worker pool in background
  appWorkerPool.init().catch(() => {});
  // Expose globally for testing/verification
  window.PDF_TOOLS_WORKER_POOL = appWorkerPool;
  window.WorkerPoolManager = WorkerPoolManager;

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  
  // Tab 1: Merge State
  const mergeState = {
    files: [],
    sortMode: 'time-asc',
    autoSort: true,
    mergedBlob: null,
    mergedUrl: null,
    isCancelled: false,
  };

  // Tab 2: Remove Pages State
  const removeState = {
    file: null,
    arrayBuffer: null,
    pdfDoc: null,
    totalPages: 0,
    selectedPages: new Set(), // 1-based page numbers marked for deletion
    outputBlob: null,
    outputUrl: null,
    isCancelled: false,
    renderedPages: new Set(),
    activeThumbnailWorkers: 0,
    thumbnailQueue: [],
    observer: null,
  };

  // Tab 3: Slides to A4 State
  const slidesState = {
    file: null,
    arrayBuffer: null,
    pdfDoc: null,
    totalSlides: 0,
    layout: '3-centered', // '3-centered', '3-notes', '2-centered', '4-grid', '6-grid'
    margin: 'narrow', // 'narrow', 'moderate', 'normal', 'minimal'
    slideBorder: true,
    slideNumbers: true,
    previewThumbnails: {}, // pageNum -> dataUrl
    outputBlob: null,
    outputUrl: null,
    isCancelled: false,
  };

  // Tab 4: Invert Colors State
  const invertState = {
    file: null,
    arrayBuffer: null,
    pdfDoc: null,
    totalPages: 0,
    mode: 'negative', // 'negative', 'grayscale-invert', 'dark-only', 'preserve-hue'
    quality: 'high',   // 'standard' (1.5x), 'high' (2.0x), 'ultra' (3.0x)
    pagesMode: 'all',  // 'all' or 'custom'
    customPages: '',
    previewPageNum: 1,
    originalCanvasCache: null, // cached un-inverted ImageData for instant mode switching
    outputBlob: null,
    outputUrl: null,
    isCancelled: false,
    activeRenderId: 0,
  };

  // Tab 5: Compress PDF State
  const compressState = {
    file: null,
    arrayBuffer: null,
    pdfDoc: null,
    totalPages: 0,
    preset: 'lossless', // 'lossless', 'recommended', 'balanced', 'extreme'
    previewPageNum: 1,
    originalCanvasCache: null,
    outputBlob: null,
    outputUrl: null,
    isCancelled: false,
    activeRenderId: 0,
  };

  // Tab 6: Image to PDF State
  const imagesState = {
    images: [], // array of { id, file, name, size, type, dataUrl, width, height, rotation }
    pageSize: 'fit', // 'fit', 'a4', 'letter'
    orientation: 'auto', // 'auto', 'portrait', 'landscape'
    margin: 'none', // 'none', 'small', 'normal'
    fit: 'contain', // 'contain', 'cover'
    outputBlob: null,
    outputUrl: null,
    isCancelled: false,
  };

  // ==========================================
  // DOM ELEMENTS
  // ==========================================
  
  // Navigation Tabs & Header
  const tabMergeBtn = document.getElementById('tabMergeBtn');
  const tabRemoveBtn = document.getElementById('tabRemoveBtn');
  const tabSlidesBtn = document.getElementById('tabSlidesBtn');
  const tabInvertBtn = document.getElementById('tabInvertBtn');
  const tabCompressBtn = document.getElementById('tabCompressBtn');
  const tabImagesBtn = document.getElementById('tabImagesBtn');
  const mergeTabView = document.getElementById('mergeTabView');
  const removeTabView = document.getElementById('removeTabView');
  const slidesTabView = document.getElementById('slidesTabView');
  const invertTabView = document.getElementById('invertTabView');
  const compressTabView = document.getElementById('compressTabView');
  const imagesTabView = document.getElementById('imagesTabView');
  const appMainSubtitle = document.getElementById('appMainSubtitle');
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  // Merge Tab DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const manageSection = document.getElementById('manageSection');
  const fileListEl = document.getElementById('fileList');
  const fileCountBadge = document.getElementById('fileCountBadge');
  const pageCountBadge = document.getElementById('pageCountBadge');
  const sortSelect = document.getElementById('sortSelect');
  const autoSortCheckbox = document.getElementById('autoSortCheckbox');
  const addMoreBtn = document.getElementById('addMoreBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const outputFilenameInput = document.getElementById('outputFilename');
  const mergeBtn = document.getElementById('mergeBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const progressPercent = document.getElementById('progressPercent');
  const mergeCancelBtn = document.getElementById('mergeCancelBtn');
  const resultCard = document.getElementById('resultCard');
  const resultSummary = document.getElementById('resultSummary');
  const downloadBtn = document.getElementById('downloadBtn');
  const previewBtn = document.getElementById('previewBtn');
  const shareBtn = document.getElementById('shareBtn');

  // Remove Pages DOM Elements
  const removeDropzone = document.getElementById('removeDropzone');
  const removeFileInput = document.getElementById('removeFileInput');
  const removeDropzoneSection = document.getElementById('removeDropzoneSection');
  const removeWorkspace = document.getElementById('removeWorkspace');
  const removeFileName = document.getElementById('removeFileName');
  const removeFileSubtext = document.getElementById('removeFileSubtext');
  const removeChangeFileBtn = document.getElementById('removeChangeFileBtn');
  const pagesToDeleteInput = document.getElementById('pagesToDeleteInput');
  const btnSelectOdd = document.getElementById('btnSelectOdd');
  const btnSelectEven = document.getElementById('btnSelectEven');
  const btnInvertSelect = document.getElementById('btnInvertSelect');
  const btnClearSelect = document.getElementById('btnClearSelect');
  const removeSummaryText = document.getElementById('removeSummaryText');
  const pagesGrid = document.getElementById('pagesGrid');
  const removeOutputFilename = document.getElementById('removeOutputFilename');
  const executeRemoveBtn = document.getElementById('executeRemoveBtn');
  const removeProgressContainer = document.getElementById('removeProgressContainer');
  const removeProgressBar = document.getElementById('removeProgressBar');
  const removeProgressText = document.getElementById('removeProgressText');
  const removeProgressPercent = document.getElementById('removeProgressPercent');
  const removeCancelBtn = document.getElementById('removeCancelBtn');
  const removeResultCard = document.getElementById('removeResultCard');
  const removeResultSummary = document.getElementById('removeResultSummary');
  const removeDownloadBtn = document.getElementById('removeDownloadBtn');
  const removePreviewBtn = document.getElementById('removePreviewBtn');
  const removeShareBtn = document.getElementById('removeShareBtn');

  // Slides to A4 DOM Elements
  const slidesDropzone = document.getElementById('slidesDropzone');
  const slidesFileInput = document.getElementById('slidesFileInput');
  const slidesDropzoneSection = document.getElementById('slidesDropzoneSection');
  const slidesWorkspace = document.getElementById('slidesWorkspace');
  const slidesFileName = document.getElementById('slidesFileName');
  const slidesFileSubtext = document.getElementById('slidesFileSubtext');
  const slidesChangeFileBtn = document.getElementById('slidesChangeFileBtn');
  const slidesPerLayoutSelect = document.getElementById('slidesPerLayoutSelect');
  const marginSelect = document.getElementById('marginSelect');
  const slideBorderCheckbox = document.getElementById('slideBorderCheckbox');
  const slideNumbersCheckbox = document.getElementById('slideNumbersCheckbox');
  const slidesCalcText = document.getElementById('slidesCalcText');
  const a4SheetPreview = document.getElementById('a4SheetPreview');
  const previewPageIndicator = document.getElementById('previewPageIndicator');
  const slidesOutputFilename = document.getElementById('slidesOutputFilename');
  const executeSlidesBtn = document.getElementById('executeSlidesBtn');
  const slidesProgressContainer = document.getElementById('slidesProgressContainer');
  const slidesProgressBar = document.getElementById('slidesProgressBar');
  const slidesProgressText = document.getElementById('slidesProgressText');
  const slidesProgressPercent = document.getElementById('slidesProgressPercent');
  const slidesCancelBtn = document.getElementById('slidesCancelBtn');
  const slidesResultCard = document.getElementById('slidesResultCard');
  const slidesResultSummary = document.getElementById('slidesResultSummary');
  const slidesDownloadBtn = document.getElementById('slidesDownloadBtn');
  const slidesPreviewBtn = document.getElementById('slidesPreviewBtn');
  const slidesShareBtn = document.getElementById('slidesShareBtn');

  // Invert Colors DOM Elements
  const invertDropzone = document.getElementById('invertDropzone');
  const invertFileInput = document.getElementById('invertFileInput');
  const invertDropzoneSection = document.getElementById('invertDropzoneSection');
  const invertWorkspace = document.getElementById('invertWorkspace');
  const invertFileName = document.getElementById('invertFileName');
  const invertFileSubtext = document.getElementById('invertFileSubtext');
  const invertChangeFileBtn = document.getElementById('invertChangeFileBtn');
  const invertModeSelect = document.getElementById('invertModeSelect');
  const invertQualitySelect = document.getElementById('invertQualitySelect');
  const invertPagesSelect = document.getElementById('invertPagesSelect');
  const invertCustomRangeGroup = document.getElementById('invertCustomRangeGroup');
  const invertCustomPagesInput = document.getElementById('invertCustomPagesInput');
  const invertHintText = document.getElementById('invertHintText');
  const invertPrevPageBtn = document.getElementById('invertPrevPageBtn');
  const invertNextPageBtn = document.getElementById('invertNextPageBtn');
  const invertPageNavText = document.getElementById('invertPageNavText');
  const invertOriginalCanvas = document.getElementById('invertOriginalCanvas');
  const invertPreviewCanvas = document.getElementById('invertPreviewCanvas');
  const invertOriginalSpinner = document.getElementById('invertOriginalSpinner');
  const invertPreviewSpinner = document.getElementById('invertPreviewSpinner');
  const invertOutputFilename = document.getElementById('invertOutputFilename');
  const executeInvertBtn = document.getElementById('executeInvertBtn');
  const invertProgressContainer = document.getElementById('invertProgressContainer');
  const invertProgressBar = document.getElementById('invertProgressBar');
  const invertProgressText = document.getElementById('invertProgressText');
  const invertProgressPercent = document.getElementById('invertProgressPercent');
  const invertCancelBtn = document.getElementById('invertCancelBtn');
  const invertResultCard = document.getElementById('invertResultCard');
  const invertResultSummary = document.getElementById('invertResultSummary');
  const invertDownloadBtn = document.getElementById('invertDownloadBtn');
  const invertPreviewBtn = document.getElementById('invertPreviewBtn');
  const invertShareBtn = document.getElementById('invertShareBtn');

  // Merge tab optimization toggle
  const mergeCompressToggle = document.getElementById('mergeCompressToggle');

  // Compress Tab DOM Elements
  const compressDropzone = document.getElementById('compressDropzone');
  const compressFileInput = document.getElementById('compressFileInput');
  const compressWorkspaceSection = document.getElementById('compressWorkspaceSection');
  const compressFileName = document.getElementById('compressFileName');
  const compressPageCount = document.getElementById('compressPageCount');
  const compressOriginalSize = document.getElementById('compressOriginalSize');
  const compressChangeFileBtn = document.getElementById('compressChangeFileBtn');
  const compressPresetRadios = document.querySelectorAll('input[name="compressPreset"]');
  const compressPresetCards = document.querySelectorAll('.compress-preset-card');
  const compressHintText = document.getElementById('compressHintText');
  const compressPrevPageBtn = document.getElementById('compressPrevPageBtn');
  const compressNextPageBtn = document.getElementById('compressNextPageBtn');
  const compressPageNavText = document.getElementById('compressPageNavText');
  const compressOriginalCanvas = document.getElementById('compressOriginalCanvas');
  const compressOriginalSpinner = document.getElementById('compressOriginalSpinner');
  const compressOriginalBadgeText = document.getElementById('compressOriginalBadgeText');
  const compressPreviewCanvas = document.getElementById('compressPreviewCanvas');
  const compressPreviewSpinner = document.getElementById('compressPreviewSpinner');
  const compressPreviewBadgeText = document.getElementById('compressPreviewBadgeText');
  const compressOutputFilename = document.getElementById('compressOutputFilename');
  const executeCompressBtn = document.getElementById('executeCompressBtn');
  const compressProgressContainer = document.getElementById('compressProgressContainer');
  const compressProgressBar = document.getElementById('compressProgressBar');
  const compressProgressText = document.getElementById('compressProgressText');
  const compressProgressPercent = document.getElementById('compressProgressPercent');
  const compressCancelBtn = document.getElementById('compressCancelBtn');
  const compressResultCard = document.getElementById('compressResultCard');
  const compressResultSummary = document.getElementById('compressResultSummary');
  const statOriginalSize = document.getElementById('statOriginalSize');
  const statCompressedSize = document.getElementById('statCompressedSize');
  const statPercentSaved = document.getElementById('statPercentSaved');
  const compressDownloadBtn = document.getElementById('compressDownloadBtn');
  const compressPreviewBtn = document.getElementById('compressPreviewBtn');
  const compressShareBtn = document.getElementById('compressShareBtn');

  // Simplified Tab 4 & 5 UI Elements
  const btnShowOriginal = document.getElementById('btnShowOriginal');
  const btnShowInverted = document.getElementById('btnShowInverted');
  const invertDisplayCanvas = document.getElementById('invertDisplayCanvas');
  const invertDisplayCaption = document.getElementById('invertDisplayCaption');
  const meterOrigSize = document.getElementById('meterOrigSize');
  const meterEstSize = document.getElementById('meterEstSize');
  const meterEstSaved = document.getElementById('meterEstSaved');
  const mergeSendToCompressBtn = document.getElementById('mergeSendToCompressBtn');
  const slidesSendToInvertBtn = document.getElementById('slidesSendToInvertBtn');
  const invertModeCards = document.querySelectorAll('#invertWorkspace .preset-choice-card');
  const compressChoiceCards = document.querySelectorAll('#compressWorkspaceSection .preset-choice-card');

  // Tab 6: Image to PDF DOM Elements
  const imagesDropzone = document.getElementById('imagesDropzone');
  const imagesFileInput = document.getElementById('imagesFileInput');
  const imagesDropzoneSection = document.getElementById('imagesDropzoneSection');
  const imagesManageSection = document.getElementById('imagesManageSection');
  const imagesCountBadge = document.getElementById('imagesCountBadge');
  const imagesSizeBadge = document.getElementById('imagesSizeBadge');
  const imagesRotateAllBtn = document.getElementById('imagesRotateAllBtn');
  const imagesAddMoreBtn = document.getElementById('imagesAddMoreBtn');
  const imagesClearAllBtn = document.getElementById('imagesClearAllBtn');
  const imagesPageSizeCards = document.querySelectorAll('#imagesPageSizeGrid .preset-choice-card');
  const imagesOrientationSelect = document.getElementById('imagesOrientationSelect');
  const imagesMarginSelect = document.getElementById('imagesMarginSelect');
  const imagesFitSelect = document.getElementById('imagesFitSelect');
  const imagesGrid = document.getElementById('imagesGrid');
  const imagesOutputFilename = document.getElementById('imagesOutputFilename');
  const executeImagesBtn = document.getElementById('executeImagesBtn');
  const imagesProgressContainer = document.getElementById('imagesProgressContainer');
  const imagesProgressBar = document.getElementById('imagesProgressBar');
  const imagesProgressText = document.getElementById('imagesProgressText');
  const imagesProgressPercent = document.getElementById('imagesProgressPercent');
  const imagesCancelBtn = document.getElementById('imagesCancelBtn');
  const imagesResultCard = document.getElementById('imagesResultCard');
  const imagesResultSummary = document.getElementById('imagesResultSummary');
  const imagesDownloadBtn = document.getElementById('imagesDownloadBtn');
  const imagesPreviewBtn = document.getElementById('imagesPreviewBtn');
  const imagesShareBtn = document.getElementById('imagesShareBtn');
  const imagesSendToCompressBtn = document.getElementById('imagesSendToCompressBtn');

  // SortableJS instance
  let sortableInstance = null;
  if (window.Sortable && fileListEl) {
    sortableInstance = new Sortable(fileListEl, {
      animation: 200,
      handle: '.drag-handle, .file-card',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      filter: '.btn-card-action',
      preventOnFilter: false,
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      onEnd: handleDragReorder,
    });
  }

  // ==========================================
  // THEME MANAGEMENT
  // ==========================================
  function initTheme() {
    const savedTheme = localStorage.getItem('pdf_merger_theme') || 'theme-light';
    document.body.className = savedTheme;
    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.contains('theme-light');
      const newTheme = isLight ? 'theme-dark' : 'theme-light';
      document.body.className = newTheme;
      localStorage.setItem('pdf_merger_theme', newTheme);
    });
  }

  // ==========================================
  // TAB NAVIGATION
  // ==========================================
  function switchTab(tab) {
    [tabMergeBtn, tabRemoveBtn, tabSlidesBtn, tabInvertBtn, tabCompressBtn, tabImagesBtn].forEach((btn) => {
      if (btn) btn.classList.remove('active');
    });
    [mergeTabView, removeTabView, slidesTabView, invertTabView, compressTabView, imagesTabView].forEach((view) => {
      if (view) view.classList.add('hidden');
    });

    let activeBtn = null;
    if (tab === 'merge') {
      activeBtn = tabMergeBtn;
      tabMergeBtn.classList.add('active');
      mergeTabView.classList.remove('hidden');
      appMainSubtitle.textContent = 'Sort by timestamp or drag & drop to reorder';
    } else if (tab === 'remove') {
      activeBtn = tabRemoveBtn;
      tabRemoveBtn.classList.add('active');
      removeTabView.classList.remove('hidden');
      appMainSubtitle.textContent = 'Select and remove unwanted pages with live visual preview';
    } else if (tab === 'slides') {
      activeBtn = tabSlidesBtn;
      tabSlidesBtn.classList.add('active');
      slidesTabView.classList.remove('hidden');
      appMainSubtitle.textContent = 'Fit 3 presentation slides per A4 page for printing & notes';
    } else if (tab === 'invert') {
      activeBtn = tabInvertBtn;
      if (tabInvertBtn) tabInvertBtn.classList.add('active');
      if (invertTabView) invertTabView.classList.remove('hidden');
      appMainSubtitle.textContent = 'Invert dark PDF pages to clean white paper for hardcopy printing';
    } else if (tab === 'compress') {
      activeBtn = tabCompressBtn;
      if (tabCompressBtn) tabCompressBtn.classList.add('active');
      if (compressTabView) compressTabView.classList.remove('hidden');
      appMainSubtitle.textContent = 'Compress and shrink large PDF files with zero or visually-lossless quality';
    } else if (tab === 'images') {
      activeBtn = tabImagesBtn;
      if (tabImagesBtn) tabImagesBtn.classList.add('active');
      if (imagesTabView) imagesTabView.classList.remove('hidden');
      appMainSubtitle.textContent = 'Convert JPG, PNG, and WebP images into a single clean PDF document';
    }

    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      try {
        activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } catch (e) {
        // Fallback for older browsers
      }
    }

    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      try {
        window.history.replaceState(null, '', '#' + tab);
      } catch (e) {}
    }
    trackToolUsage(tab, 'viewed');
  }

  // ==========================================
  // PRIVACY-PRESERVING TOOL USAGE TRACKING
  // ==========================================
  function trackToolUsage(toolName, eventType = 'used') {
    const eventPath = `/tool-${toolName}`;
    const eventTitle = `${eventType === 'used' ? 'Used' : 'Viewed'} ${toolName}`;

    // 1. GoatCounter Event Tracking (if configured)
    try {
      if (typeof window !== 'undefined' && window.goatcounter && typeof window.goatcounter.count === 'function') {
        window.goatcounter.count({
          path: eventPath,
          title: eventTitle,
          event: true
        });
      }
    } catch (e) {
      // Ignore analytics failures silently
    }

    // 2. Google Analytics 4 (if configured)
    try {
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
        window.gtag('event', 'tool_usage', {
          tool_name: toolName,
          event_type: eventType
        });
      }
    } catch (e) {
      // Ignore
    }

    // 3. Custom DOM Event for extensibility and unit testing
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('tool_usage', {
          detail: { toolName, eventType, timestamp: Date.now() }
        }));
      }
    } catch (e) {
      // Ignore
    }
  }

  // ==========================================
  // BINARY MAGIC BYTE SECURITY VALIDATORS
  // ==========================================

  /**
   * Validate that a file or blob contains genuine PDF magic bytes (%PDF-).
   * Checks up to 1024 bytes per the PDF ISO 32000-1 specification.
   * @param {File|Blob} file
   * @returns {Promise<boolean>}
   */
  async function isValidPdfFile(file) {
    if (!file) return false;
    try {
      let sliceBuffer;
      if (typeof file.slice === 'function') {
        const slice = file.slice(0, 1024);
        sliceBuffer = await slice.arrayBuffer();
      } else if (typeof file.arrayBuffer === 'function') {
        sliceBuffer = await file.arrayBuffer();
      } else {
        return false;
      }
      const bytes = new Uint8Array(sliceBuffer);
      if (bytes.length < 5) return false;

      // Scan up to 1024 bytes for %PDF- (0x25 0x50 0x44 0x46 0x2D)
      const maxScan = Math.min(bytes.length - 4, 1024);
      for (let i = 0; i < maxScan; i++) {
        if (
          bytes[i] === 0x25 && // %
          bytes[i + 1] === 0x50 && // P
          bytes[i + 2] === 0x44 && // D
          bytes[i + 3] === 0x46 && // F
          bytes[i + 4] === 0x2D    // -
        ) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Validate that a file or blob contains genuine Image magic bytes (JPEG, PNG, WebP, GIF, BMP, SVG, AVIF).
   * @param {File|Blob} file
   * @returns {Promise<boolean>}
   */
  async function isValidImageFile(file) {
    if (!file) return false;
    try {
      let sliceBuffer;
      if (typeof file.slice === 'function') {
        const slice = file.slice(0, 64);
        sliceBuffer = await slice.arrayBuffer();
      } else if (typeof file.arrayBuffer === 'function') {
        sliceBuffer = await file.arrayBuffer();
      } else {
        return false;
      }
      const b = new Uint8Array(sliceBuffer);
      if (b.length < 4) return false;

      // JPEG: FF D8 FF
      if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;
      // PNG: 89 50 4E 47
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;
      // GIF: 47 49 46 38 ('GIF8')
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
      // BMP: 42 4D ('BM')
      if (b[0] === 0x42 && b[1] === 0x4D) return true;
      // WebP: 'RIFF'....'WEBP'
      if (
        b.length >= 12 &&
        b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
      ) {
        return true;
      }
      // AVIF: bytes 4..7 'ftyp' and 8..11 'avif'/'avis'
      if (
        b.length >= 12 &&
        b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
        b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && (b[11] === 0x66 || b[11] === 0x73)
      ) {
        return true;
      }
      // SVG: check for <?xml or <svg
      if (typeof TextDecoder !== 'undefined') {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(b).trim().toLowerCase();
        if (text.startsWith('<svg') || text.startsWith('<?xml')) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  // Export for testing and diagnostics
  if (typeof window !== 'undefined') {
    window.trackToolUsage = trackToolUsage;
    window.isValidPdfFile = isValidPdfFile;
    window.isValidImageFile = isValidImageFile;
  }

  // ==========================================
  // UTILITY HELPERS
  // ==========================================
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown date';
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // Parse page input string (e.g. "1, 2, 7, 8" or "1-3, 5") into Set of 1-based page numbers
  function parsePageInput(inputStr, totalPages) {
    const set = new Set();
    if (!inputStr || !inputStr.trim()) return set;
    const parts = inputStr.split(/[\s,]+/);
    for (const part of parts) {
      if (!part) continue;
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.max(1, Math.min(start, end));
          const max = Math.min(totalPages, Math.max(start, end));
          for (let p = min; p <= max; p++) set.add(p);
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          set.add(p);
        }
      }
    }
    return set;
  }

  // Format array/set of page numbers into comma-separated ranges e.g. "1, 2, 7, 8"
  function formatPageSet(pageSet) {
    const sorted = Array.from(pageSet).sort((a, b) => a - b);
    if (sorted.length === 0) return '';
    return sorted.join(', ');
  }

  function isPasswordProtectedError(err) {
    if (!err) return false;
    const msg = String(err.message || err.name || '').toLowerCase();
    return (
      msg.includes('password') ||
      msg.includes('encrypted') ||
      msg.includes('decrypt') ||
      msg.includes('security handler')
    );
  }

  function validatePageInput(inputStr, totalPages) {
    if (!inputStr || !inputStr.trim() || !totalPages) return { outOfBounds: [] };
    const parts = inputStr.split(/[\s,]+/);
    const outOfBounds = [];
    for (const part of parts) {
      if (!part) continue;
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const s = parseInt(startStr, 10);
        const e = parseInt(endStr, 10);
        if (!isNaN(s) && s > totalPages) outOfBounds.push(s);
        if (!isNaN(e) && e > totalPages) outOfBounds.push(e);
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p > totalPages) outOfBounds.push(p);
      }
    }
    return { outOfBounds: Array.from(new Set(outOfBounds)) };
  }

  // ==========================================
  // TAB 1: MERGE PDFS LOGIC
  // ==========================================
  function setDefaultOutputFilename() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    outputFilenameInput.value = `merged_${yyyy}-${mm}-${dd}`;
  }

  async function handleMergeFilesAdded(fileList) {
    if (!fileList || fileList.length === 0) return;

    const validPdfs = [];
    const invalidFiles = [];

    for (const f of Array.from(fileList)) {
      const isExt = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (!isExt) {
        invalidFiles.push(f.name);
        continue;
      }
      const isGenuine = await isValidPdfFile(f);
      if (!isGenuine) {
        invalidFiles.push(f.name);
      } else {
        validPdfs.push(f);
      }
    }

    if (invalidFiles.length > 0 && validPdfs.length === 0) {
      alert(`Security Warning: The selected file(s) [${invalidFiles.join(', ')}] are not genuine or valid PDF documents. Upload rejected.`);
      return;
    } else if (invalidFiles.length > 0) {
      alert(`Security Notice: Excluded invalid or non-PDF file(s): ${invalidFiles.join(', ')}`);
    }

    if (validPdfs.length === 0) {
      alert('Please select valid PDF files.');
      return;
    }

    resultCard.classList.add('hidden');

    for (const file of validPdfs) {
      const item = {
        id: 'pdf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        file: file,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified || Date.now(),
        pageCount: null,
        thumbnailUrl: null,
      };
      mergeState.files.push(item);
    }

    if (mergeState.autoSort) {
      applySorting(sortSelect.value);
    } else {
      renderMergeFileList();
    }

    processMergeMetadata();
  }

  async function processMergeMetadata() {
    for (const item of mergeState.files) {
      if (item.pageCount === null) {
        try {
          const arrayBuffer = await item.file.arrayBuffer();

          if (window.PDFLib) {
            try {
              const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
              item.pageCount = srcDoc.getPageCount();
            } catch (e) {
              console.warn('PDFLib count warning:', e);
            }
          }

          if (window.pdfjsLib) {
            try {
              const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
              const pdfDoc = await loadingTask.promise;
              if (item.pageCount === null) item.pageCount = pdfDoc.numPages;

              const page = await pdfDoc.getPage(1);
              const viewport = page.getViewport({ scale: 0.3 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              await page.render({ canvasContext: ctx, viewport }).promise;
              item.thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
            } catch (pe) {
              console.warn('PDF.js thumbnail warning:', pe);
            }
          }
        } catch (err) {
          console.warn('Could not read metadata for:', item.name, err);
          if (item.pageCount === null) item.pageCount = '—';
        }
        updateMergeCardMetadata(item);
      }
    }
    updateMergeSummaryStats();
  }

  function updateMergeCardMetadata(item) {
    const card = document.querySelector(`.file-card[data-id="${item.id}"]`);
    if (!card) return;

    const pageBadge = card.querySelector('.page-badge-text');
    if (pageBadge && item.pageCount !== null) {
      pageBadge.textContent = `${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'}`;
    }

    const thumbContainer = card.querySelector('.file-thumb-container');
    if (thumbContainer && item.thumbnailUrl) {
      thumbContainer.innerHTML = `<img src="${item.thumbnailUrl}" class="file-thumb-canvas" alt="Page 1 preview">`;
    }
  }

  function applySorting(mode) {
    mergeState.sortMode = mode;
    sortSelect.value = mode;

    switch (mode) {
      case 'time-asc':
        mergeState.files.sort((a, b) => a.lastModified - b.lastModified);
        break;
      case 'time-desc':
        mergeState.files.sort((a, b) => b.lastModified - a.lastModified);
        break;
      case 'name-asc':
        mergeState.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        break;
      case 'name-desc':
        mergeState.files.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
        break;
      case 'size-asc':
        mergeState.files.sort((a, b) => a.size - b.size);
        break;
      case 'size-desc':
        mergeState.files.sort((a, b) => b.size - a.size);
        break;
      default:
        break;
    }

    renderMergeFileList();
  }

  function handleDragReorder() {
    const domIds = Array.from(fileListEl.children).map((card) => card.dataset.id);
    mergeState.files.sort((a, b) => domIds.indexOf(a.id) - domIds.indexOf(b.id));
    mergeState.sortMode = 'custom';
    sortSelect.value = 'custom';
    updateMergeIndices();
  }

  function moveMergeItem(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= mergeState.files.length) return;

    const [movedItem] = mergeState.files.splice(index, 1);
    mergeState.files.splice(targetIndex, 0, movedItem);

    mergeState.sortMode = 'custom';
    sortSelect.value = 'custom';
    renderMergeFileList();
  }

  function removeMergeItem(id) {
    mergeState.files = mergeState.files.filter((item) => item.id !== id);
    if (mergeState.files.length === 0) {
      manageSection.classList.add('hidden');
      resultCard.classList.add('hidden');
    } else {
      renderMergeFileList();
    }
  }

  function clearAllMergeFiles() {
    if (mergeState.files.length === 0) return;
    mergeState.files = [];
    manageSection.classList.add('hidden');
    resultCard.classList.add('hidden');
    if (mergeState.mergedUrl) {
      URL.revokeObjectURL(mergeState.mergedUrl);
      mergeState.mergedUrl = null;
      mergeState.mergedBlob = null;
    }
    fileInput.value = '';
  }

  function renderMergeFileList() {
    if (mergeState.files.length === 0) {
      manageSection.classList.add('hidden');
      return;
    }

    manageSection.classList.remove('hidden');
    fileListEl.innerHTML = '';

    mergeState.files.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.dataset.id = item.id;

      const formattedDate = formatTimestamp(item.lastModified);
      const sizeStr = formatBytes(item.size);
      const pageStr = item.pageCount !== null ? `${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'}` : 'Loading pages...';

      const thumbHtml = item.thumbnailUrl
        ? `<img src="${item.thumbnailUrl}" class="file-thumb-canvas" alt="Page 1 preview">`
        : `<div class="thumb-placeholder">📄</div>`;

      card.innerHTML = `
        <div class="drag-handle" title="Drag to reorder" aria-label="Drag handle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
          </svg>
        </div>
        <div class="index-pill" title="Order position">${index + 1}</div>
        <div class="file-thumb-container">${thumbHtml}</div>
        <div class="file-info">
          <div class="file-name" title="${item.name}">${escapeHtml(item.name)}</div>
          <div class="file-meta-row">
            <span class="meta-badge timestamp-badge" title="File last modified timestamp">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${formattedDate}
            </span>
            <span class="meta-badge" title="Page count">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span class="page-badge-text">${pageStr}</span>
            </span>
            <span class="meta-badge" title="File size">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              </svg>
              ${sizeStr}
            </span>
          </div>
        </div>
        <div class="file-actions">
          <button class="btn-card-action btn-up" title="Move Up" ${index === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
          <button class="btn-card-action btn-down" title="Move Down" ${index === mergeState.files.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <button class="btn-card-action btn-delete" title="Remove PDF">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      card.querySelector('.btn-up').addEventListener('click', (e) => {
        e.stopPropagation();
        moveMergeItem(index, -1);
      });

      card.querySelector('.btn-down').addEventListener('click', (e) => {
        e.stopPropagation();
        moveMergeItem(index, 1);
      });

      card.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        removeMergeItem(item.id);
      });

      fileListEl.appendChild(card);
    });

    updateMergeIndices();
    updateMergeSummaryStats();
  }

  function updateMergeIndices() {
    const cards = fileListEl.querySelectorAll('.file-card');
    cards.forEach((card, i) => {
      const pill = card.querySelector('.index-pill');
      if (pill) pill.textContent = i + 1;

      const upBtn = card.querySelector('.btn-up');
      const downBtn = card.querySelector('.btn-down');
      if (upBtn) {
        upBtn.disabled = i === 0;
        upBtn.style.opacity = i === 0 ? '0.3' : '1';
        upBtn.style.cursor = i === 0 ? 'not-allowed' : 'pointer';
      }
      if (downBtn) {
        downBtn.disabled = i === cards.length - 1;
        downBtn.style.opacity = i === cards.length - 1 ? '0.3' : '1';
        downBtn.style.cursor = i === cards.length - 1 ? 'not-allowed' : 'pointer';
      }
    });
  }

  function updateMergeSummaryStats() {
    const count = mergeState.files.length;
    fileCountBadge.textContent = `${count} ${count === 1 ? 'file' : 'files'}`;

    let totalPages = 0;
    let hasUnloaded = false;
    for (const f of mergeState.files) {
      if (typeof f.pageCount === 'number') {
        totalPages += f.pageCount;
      } else {
        hasUnloaded = true;
      }
    }

    if (hasUnloaded && totalPages === 0) {
      pageCountBadge.textContent = 'Calculating pages...';
    } else {
      pageCountBadge.textContent = `${totalPages} ${totalPages === 1 ? 'page' : 'pages'} total`;
    }
  }

  // --- Web Share API Helper ---
  async function handleSharePdf(blob, filename) {
    if (!blob) return;
    const safeFilename = filename || 'document.pdf';
    try {
      if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare) {
        const file = new File([blob], safeFilename, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: safeFilename,
            text: 'Sharing processed PDF from PDF Tools.'
          });
          return;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('File share failed, falling back to URL share:', err);
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: safeFilename,
          url: window.location.href
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share fallback failed:', err);
        }
      }
    } else {
      alert('Sharing is not supported on this device. Please use the Download button.');
    }
  }

  async function mergePdfs() {
    if (mergeBtn && mergeBtn.disabled) return;
    if (mergeState.files.length < 2) {
      alert('Please add at least 2 PDF files to merge.');
      return;
    }

    if (!window.PDFLib) {
      alert('PDF-Lib is not loaded. Please check your local files.');
      return;
    }

    mergeBtn.disabled = true;
    mergeState.isCancelled = false;
    progressContainer.classList.remove('hidden');
    resultCard.classList.add('hidden');
    setMergeProgress(5, 'Initializing PDF merger...');

    try {
      const { PDFDocument } = window.PDFLib;
      const mergedPdf = await PDFDocument.create();

      const totalFiles = mergeState.files.length;
      let totalMergedPages = 0;

      for (let i = 0; i < totalFiles; i++) {
        if (mergeState.isCancelled) {
          throw new Error('OPERATION_CANCELLED');
        }

        const item = mergeState.files[i];
        const stepProgress = Math.round(10 + ((i + 1) / totalFiles) * 75);
        setMergeProgress(stepProgress, `Merging file ${i + 1} of ${totalFiles}: "${item.name}"...`);

        const arrayBuffer = await item.file.arrayBuffer();
        if (mergeState.isCancelled) {
          throw new Error('OPERATION_CANCELLED');
        }

        let srcDoc;
        try {
          srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        } catch (loadErr) {
          if (isPasswordProtectedError(loadErr)) {
            throw new Error(`File "${item.name}" is password-protected or encrypted. Please remove password protection before merging.`);
          }
          throw loadErr;
        }
        const pageIndices = srcDoc.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);

        copiedPages.forEach((page) => mergedPdf.addPage(page));
        totalMergedPages += copiedPages.length;
      }

      if (mergeState.isCancelled) {
        throw new Error('OPERATION_CANCELLED');
      }

      setMergeProgress(90, 'Generating final merged PDF...');
      const useObjectStreams = mergeCompressToggle ? mergeCompressToggle.checked : true;
      const mergedPdfBytes = await mergedPdf.save({ useObjectStreams });

      if (mergeState.mergedUrl) {
        URL.revokeObjectURL(mergeState.mergedUrl);
      }

      mergeState.mergedBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      mergeState.mergedUrl = URL.createObjectURL(mergeState.mergedBlob);

      setMergeProgress(100, 'Complete!');

      let rawFilename = outputFilenameInput.value.trim() || 'merged-document';
      if (!rawFilename.toLowerCase().endsWith('.pdf')) {
        rawFilename += '.pdf';
      }
      downloadBtn.href = mergeState.mergedUrl;
      downloadBtn.download = rawFilename;

      resultSummary.textContent = `Successfully merged ${totalFiles} files (${totalMergedPages} total pages • ${formatBytes(mergeState.mergedBlob.size)}).`;
      if (shareBtn && typeof navigator !== 'undefined' && navigator.share) shareBtn.classList.remove('hidden');
      resultCard.classList.remove('hidden');
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      trackToolUsage('merge_pdfs');
    } catch (err) {
      if (err.message === 'OPERATION_CANCELLED') {
        setMergeProgress(0, 'Merge cancelled.');
        return;
      }
      console.error('Merge error:', err);
      alert('Failed to merge PDFs: ' + (err.message || 'Unknown error occurred'));
    } finally {
      mergeState.isCancelled = false;
      mergeBtn.disabled = false;
      setTimeout(() => {
        progressContainer.classList.add('hidden');
      }, 800);
    }
  }

  function setMergeProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressText.textContent = text;
  }

  // ==========================================
  // TAB 2: REMOVE PAGES LOGIC
  // ==========================================
  async function handleRemoveFileSelected(file) {
    if (!file || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
      alert('Please select a valid PDF file.');
      return;
    }

    const isGenuinePdf = await isValidPdfFile(file);
    if (!isGenuinePdf) {
      alert(`Security Warning: "${file.name}" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);
      return;
    }

    removeState.file = file;
    removeState.selectedPages.clear();
    removeResultCard.classList.add('hidden');
    removeProgressContainer.classList.add('hidden');

    // UI Updates
    removeFileName.textContent = file.name;
    removeFileSubtext.textContent = `Loading pages • ${formatBytes(file.size)}...`;
    
    // Set default output filename
    const baseName = file.name.replace(/\.pdf$/i, '');
    removeOutputFilename.value = `${baseName}_pages_removed`;

    removeDropzoneSection.classList.add('hidden');
    removeWorkspace.classList.remove('hidden');

    try {
      removeState.arrayBuffer = await file.arrayBuffer();

      // Determine total pages using PDFLib immediately and reliably
      if (window.PDFLib) {
        const srcDoc = await PDFLib.PDFDocument.load(removeState.arrayBuffer, { ignoreEncryption: true });
        removeState.totalPages = srcDoc.getPageCount();
      }

      if (removeState.totalPages === 0) {
        throw new Error('Document contains no pages or could not be read.');
      }

      removeFileSubtext.textContent = `${removeState.totalPages} ${removeState.totalPages === 1 ? 'page' : 'pages'} total • ${formatBytes(file.size)}`;

      // Render Visual Pages Grid immediately
      renderPagesGrid();
      updateRemoveSummary();

      // Load PDF.js asynchronously in background for canvas thumbnails
      if (window.pdfjsLib) {
        pdfjsLib.getDocument({ data: new Uint8Array(removeState.arrayBuffer.slice(0)) }).promise
          .then((doc) => {
            removeState.pdfDoc = doc;
            processThumbnailQueue();
          })
          .catch((e) => console.warn('PDF.js thumbnail loader:', e));
      }
    } catch (err) {
      if (isPasswordProtectedError(err)) {
        alert('🔒 This PDF document is password-protected or encrypted.\nPlease remove password protection before uploading it.');
        resetRemoveWorkspace();
        return;
      }
      console.error('Failed to load PDF for page removal:', err);
      alert('Could not open this PDF: ' + (err.message || 'Unknown error'));
      resetRemoveWorkspace();
    }
  }

  function resetRemoveWorkspace() {
    if (removeState.observer) {
      removeState.observer.disconnect();
      removeState.observer = null;
    }
    removeState.thumbnailQueue = [];
    removeState.renderedPages.clear();
    removeState.activeThumbnailWorkers = 0;

    // Release GPU memory for all existing canvas elements before clearing
    const existingCanvases = pagesGrid.querySelectorAll('canvas');
    existingCanvases.forEach((c) => {
      c.width = 0;
      c.height = 0;
    });

    removeState.file = null;
    removeState.arrayBuffer = null;
    removeState.pdfDoc = null;
    removeState.totalPages = 0;
    removeState.selectedPages.clear();
    removeState.isCancelled = false;
    if (removeState.outputUrl) {
      URL.revokeObjectURL(removeState.outputUrl);
      removeState.outputUrl = null;
      removeState.outputBlob = null;
    }
    removeFileInput.value = '';
    pagesGrid.innerHTML = '';
    pagesToDeleteInput.value = '';
    removeWorkspace.classList.add('hidden');
    removeDropzoneSection.classList.remove('hidden');
    removeResultCard.classList.add('hidden');
  }

  const MAX_CONCURRENT_THUMBNAILS = 3;

  function queueThumbnailRender(pageNum) {
    if (removeState.renderedPages.has(pageNum)) return;
    if (!removeState.thumbnailQueue.includes(pageNum)) {
      removeState.thumbnailQueue.push(pageNum);
    }
    processThumbnailQueue();
  }

  function processThumbnailQueue() {
    if (!removeState.pdfDoc) return;
    while (
      removeState.activeThumbnailWorkers < MAX_CONCURRENT_THUMBNAILS &&
      removeState.thumbnailQueue.length > 0
    ) {
      const pageNum = removeState.thumbnailQueue.shift();
      if (removeState.renderedPages.has(pageNum)) continue;

      removeState.activeThumbnailWorkers++;
      renderPageThumbnail(pageNum).finally(() => {
        removeState.activeThumbnailWorkers--;
        processThumbnailQueue();
      });
    }
  }

  function renderPagesGrid() {
    if (removeState.observer) {
      removeState.observer.disconnect();
      removeState.observer = null;
    }
    removeState.renderedPages.clear();
    removeState.thumbnailQueue = [];
    removeState.activeThumbnailWorkers = 0;

    pagesGrid.innerHTML = '';

    const hasObserver = typeof window.IntersectionObserver !== 'undefined';
    if (hasObserver) {
      removeState.observer = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.dataset.pageNum, 10);
            if (pageNum && !removeState.renderedPages.has(pageNum)) {
              queueThumbnailRender(pageNum);
            }
            observer.unobserve(entry.target);
          }
        });
      }, {
        root: null,
        rootMargin: '350px 0px',
        threshold: 0.01,
      });
    }

    for (let p = 1; p <= removeState.totalPages; p++) {
      const card = document.createElement('div');
      card.className = 'page-card';
      if (removeState.selectedPages.has(p)) {
        card.classList.add('marked-for-deletion');
      }
      card.dataset.pageNum = p;

      card.innerHTML = `
        <div class="page-card-header">
          <span class="page-num-pill">Page ${p}</span>
          <span class="page-status-badge">🗑️ Delete</span>
        </div>
        <div class="page-canvas-wrapper">
          <canvas class="page-canvas" id="canvas_page_${p}"></canvas>
          <div class="page-fallback-label">📄 Page ${p}</div>
          <div class="delete-watermark">🗑️ Delete</div>
        </div>
      `;

      card.addEventListener('click', () => {
        togglePageSelection(p);
      });

      pagesGrid.appendChild(card);

      if (hasObserver) {
        removeState.observer.observe(card);
      } else {
        queueThumbnailRender(p);
      }
    }
  }

  async function renderPageThumbnail(pageNum) {
    if (!removeState.pdfDoc) return;
    try {
      const page = await removeState.pdfDoc.getPage(pageNum);
      const canvas = document.getElementById(`canvas_page_${pageNum}`);
      if (!canvas) return;

      const viewport = page.getViewport({ scale: 0.35 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      removeState.renderedPages.add(pageNum);

      // Hide fallback label once canvas renders
      const card = canvas.closest('.page-card');
      if (card) {
        const fallback = card.querySelector('.page-fallback-label');
        if (fallback) fallback.style.display = 'none';
      }
    } catch (err) {
      console.warn(`Could not render thumbnail for page ${pageNum}:`, err);
    }
  }

  function togglePageSelection(pageNum) {
    if (removeState.selectedPages.has(pageNum)) {
      removeState.selectedPages.delete(pageNum);
    } else {
      removeState.selectedPages.add(pageNum);
    }
    syncSelectionToInput();
    updateGridCardStyles();
    updateRemoveSummary();
  }

  function updateGridCardStyles() {
    const cards = pagesGrid.querySelectorAll('.page-card');
    cards.forEach((card) => {
      const p = parseInt(card.dataset.pageNum, 10);
      if (removeState.selectedPages.has(p)) {
        card.classList.add('marked-for-deletion');
      } else {
        card.classList.remove('marked-for-deletion');
      }
    });
  }

  function syncSelectionToInput() {
    pagesToDeleteInput.value = formatPageSet(removeState.selectedPages);
  }

  function updateRemoveSummary() {
    const total = removeState.totalPages;
    const delCount = removeState.selectedPages.size;
    const keepCount = total - delCount;

    if (delCount === 0) {
      removeSummaryText.innerHTML = `No pages selected for deletion yet. Click any page card below or type page numbers (e.g. <code>1, 2, 7, 8</code>).`;
    } else if (keepCount === 0) {
      removeSummaryText.innerHTML = `<span class="delete-tag">⚠️ All ${total} pages are selected for deletion! You must keep at least 1 page.</span>`;
    } else {
      const delListStr = formatPageSet(removeState.selectedPages);
      removeSummaryText.innerHTML = `
        <span class="delete-tag">🗑️ ${delCount} ${delCount === 1 ? 'page' : 'pages'} to delete (${delListStr})</span>
        <span class="dot-separator">•</span>
        <span class="keep-tag">📄 ${keepCount} ${keepCount === 1 ? 'page' : 'pages'} will remain in output</span>
      `;
    }
  }

  // Handle manual typing in page numbers input
  function handlePageInputChange() {
    const inputVal = pagesToDeleteInput.value;
    removeState.selectedPages = parsePageInput(inputVal, removeState.totalPages);
    const val = validatePageInput(inputVal, removeState.totalPages);
    if (val.outOfBounds.length > 0) {
      pagesToDeleteInput.style.borderColor = 'var(--danger)';
      pagesToDeleteInput.title = `Pages ${val.outOfBounds.join(', ')} exceed total pages (${removeState.totalPages})`;
    } else {
      pagesToDeleteInput.style.borderColor = '';
      pagesToDeleteInput.title = '';
    }
    updateGridCardStyles();
    updateRemoveSummary();
  }

  // Quick Action Buttons
  function selectOddPages() {
    removeState.selectedPages.clear();
    for (let p = 1; p <= removeState.totalPages; p += 2) {
      removeState.selectedPages.add(p);
    }
    syncSelectionToInput();
    updateGridCardStyles();
    updateRemoveSummary();
  }

  function selectEvenPages() {
    removeState.selectedPages.clear();
    for (let p = 2; p <= removeState.totalPages; p += 2) {
      removeState.selectedPages.add(p);
    }
    syncSelectionToInput();
    updateGridCardStyles();
    updateRemoveSummary();
  }

  function invertSelection() {
    const newSet = new Set();
    for (let p = 1; p <= removeState.totalPages; p++) {
      if (!removeState.selectedPages.has(p)) {
        newSet.add(p);
      }
    }
    removeState.selectedPages = newSet;
    syncSelectionToInput();
    updateGridCardStyles();
    updateRemoveSummary();
  }

  function clearPageSelection() {
    removeState.selectedPages.clear();
    syncSelectionToInput();
    updateGridCardStyles();
    updateRemoveSummary();
  }

  // Execute Deletion of Selected Pages & Build Clean PDF
  async function executeRemovePages() {
    if (executeRemoveBtn && executeRemoveBtn.disabled) return;
    if (!removeState.file || removeState.totalPages === 0) {
      alert('Please upload a PDF first.');
      return;
    }

    if (removeState.selectedPages.size === 0) {
      alert('Please select at least 1 page to delete (e.g. 1, 2, 7, 8 or click the page cards).');
      return;
    }

    const keptPages = [];
    for (let p = 1; p <= removeState.totalPages; p++) {
      if (!removeState.selectedPages.has(p)) {
        keptPages.push(p);
      }
    }

    if (keptPages.length === 0) {
      alert('Cannot delete all pages! You must keep at least 1 page.');
      return;
    }

    if (!window.PDFLib) {
      alert('PDF-Lib is not loaded.');
      return;
    }

    executeRemoveBtn.disabled = true;
    removeState.isCancelled = false;
    removeProgressContainer.classList.remove('hidden');
    removeResultCard.classList.add('hidden');
    setRemoveProgress(10, 'Reading PDF document...');

    try {
      if (removeState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const { PDFDocument } = window.PDFLib;
      setRemoveProgress(30, 'Extracting unselected pages...');

      const srcDoc = await PDFDocument.load(removeState.arrayBuffer, { ignoreEncryption: true });
      if (removeState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const newDoc = await PDFDocument.create();

      // Convert 1-based kept pages to 0-based indices for PDF-Lib
      const keptIndices = keptPages.map((p) => p - 1);
      const copiedPages = await newDoc.copyPages(srcDoc, keptIndices);
      if (removeState.isCancelled) throw new Error('OPERATION_CANCELLED');

      setRemoveProgress(70, 'Compiling clean PDF...');
      copiedPages.forEach((page) => newDoc.addPage(page));

      setRemoveProgress(90, 'Saving new PDF...');
      const newPdfBytes = await newDoc.save();
      if (removeState.isCancelled) throw new Error('OPERATION_CANCELLED');

      if (removeState.outputUrl) {
        URL.revokeObjectURL(removeState.outputUrl);
      }

      removeState.outputBlob = new Blob([newPdfBytes], { type: 'application/pdf' });
      removeState.outputUrl = URL.createObjectURL(removeState.outputBlob);

      setRemoveProgress(100, 'Complete!');

      // Download Button Config
      let rawFilename = removeOutputFilename.value.trim() || 'document_pages_removed';
      if (!rawFilename.toLowerCase().endsWith('.pdf')) {
        rawFilename += '.pdf';
      }
      removeDownloadBtn.href = removeState.outputUrl;
      removeDownloadBtn.download = rawFilename;

      // Result summary
      const deletedCount = removeState.selectedPages.size;
      const keptCount = keptPages.length;
      removeResultSummary.textContent = `Deleted ${deletedCount} ${deletedCount === 1 ? 'page' : 'pages'}. New PDF contains ${keptCount} ${keptCount === 1 ? 'page' : 'pages'} (${formatBytes(removeState.outputBlob.size)}).`;
      if (removeShareBtn && typeof navigator !== 'undefined' && navigator.share) removeShareBtn.classList.remove('hidden');
      removeResultCard.classList.remove('hidden');
      removeResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      trackToolUsage('remove_pages');
    } catch (err) {
      if (err.message === 'OPERATION_CANCELLED') {
        setRemoveProgress(0, 'Page removal cancelled.');
        return;
      }
      console.error('Error removing pages:', err);
      alert('Failed to delete pages: ' + (err.message || 'Unknown error occurred'));
    } finally {
      removeState.isCancelled = false;
      executeRemoveBtn.disabled = false;
      setTimeout(() => {
        removeProgressContainer.classList.add('hidden');
      }, 800);
    }
  }

  function setRemoveProgress(percent, text) {
    removeProgressBar.style.width = `${percent}%`;
    removeProgressPercent.textContent = `${percent}%`;
    removeProgressText.textContent = text;
  }

  // ==========================================
  // TAB 3: SLIDES TO A4 HANDOUT LOGIC
  // ==========================================
  async function handleSlidesFileSelected(file) {
    if (!file || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
      alert('Please select a valid PDF file.');
      return;
    }

    const isGenuinePdf = await isValidPdfFile(file);
    if (!isGenuinePdf) {
      alert(`Security Warning: "${file.name}" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);
      return;
    }

    slidesState.file = file;
    slidesState.previewThumbnails = {};
    slidesResultCard.classList.add('hidden');
    slidesProgressContainer.classList.add('hidden');

    slidesFileName.textContent = file.name;
    slidesFileSubtext.textContent = `Loading presentation • ${formatBytes(file.size)}...`;

    const baseName = file.name.replace(/\.pdf$/i, '');
    slidesOutputFilename.value = `${baseName}_A4_handout`;

    slidesDropzoneSection.classList.add('hidden');
    slidesWorkspace.classList.remove('hidden');

    try {
      slidesState.arrayBuffer = await file.arrayBuffer();

      // Read total slide count using PDFLib immediately
      if (window.PDFLib) {
        const srcDoc = await PDFLib.PDFDocument.load(slidesState.arrayBuffer, { ignoreEncryption: true });
        slidesState.totalSlides = srcDoc.getPageCount();
      }

      if (slidesState.totalSlides === 0) {
        throw new Error('Presentation contains no slides.');
      }

      slidesFileSubtext.textContent = `${slidesState.totalSlides} ${slidesState.totalSlides === 1 ? 'slide' : 'slides'} total • ${formatBytes(file.size)}`;

      updateSlidesCalculation();
      renderA4SheetPreview();

      // Load PDF.js to render live slide thumbnails into preview
      if (window.pdfjsLib) {
        pdfjsLib.getDocument({ data: new Uint8Array(slidesState.arrayBuffer.slice(0)) }).promise
          .then(async (doc) => {
            slidesState.pdfDoc = doc;
            const maxThumbs = Math.min(6, slidesState.totalSlides);
            for (let s = 1; s <= maxThumbs; s++) {
              try {
                const page = await doc.getPage(s);
                const viewport = page.getViewport({ scale: 0.3 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                slidesState.previewThumbnails[s] = canvas.toDataURL('image/jpeg', 0.8);
              } catch (err) {
                console.warn('Slide thumbnail preview error:', err);
              }
            }
            renderA4SheetPreview();
          })
          .catch((e) => console.warn('PDF.js slides preview:', e));
      }
    } catch (err) {
      if (isPasswordProtectedError(err)) {
        alert('🔒 This presentation PDF is password-protected or encrypted.\nPlease remove password protection before uploading it.');
        resetSlidesWorkspace();
        return;
      }
      console.error('Failed to load presentation:', err);
      alert('Could not open presentation: ' + (err.message || 'Unknown error'));
      resetSlidesWorkspace();
    }
  }

  function resetSlidesWorkspace() {
    slidesState.file = null;
    slidesState.arrayBuffer = null;
    slidesState.pdfDoc = null;
    slidesState.totalSlides = 0;
    slidesState.previewThumbnails = {};
    if (slidesState.outputUrl) {
      URL.revokeObjectURL(slidesState.outputUrl);
      slidesState.outputUrl = null;
      slidesState.outputBlob = null;
    }
    slidesFileInput.value = '';
    slidesWorkspace.classList.add('hidden');
    slidesDropzoneSection.classList.remove('hidden');
    slidesResultCard.classList.add('hidden');
  }

  function getSlidesPerPageCount() {
    if (slidesState.layout === '2-centered') return 2;
    if (slidesState.layout === '4-grid') return 4;
    if (slidesState.layout === '6-grid') return 6;
    return 3; // 3-centered or 3-notes default
  }

  function updateSlidesCalculation() {
    const slidesPerPage = getSlidesPerPageCount();
    const total = slidesState.totalSlides;
    if (total === 0) return;

    const totalA4Pages = Math.ceil(total / slidesPerPage);
    slidesCalcText.innerHTML = `📊 <strong>${total} slides</strong> will fit onto <strong>${totalA4Pages} A4 pages</strong> (${slidesPerPage} slides per page).`;
    previewPageIndicator.textContent = `Shows first ${Math.min(slidesPerPage, total)} slides`;
  }

  const MARGIN_CONFIG = {
    narrow: {
      sideMargin: 18,    // 0.25 inch
      topMargin: 20,     // ~0.28 inch
      gap: 12,           // slide gap
      previewPadding: '8px 8px',
      boxWidthPercent: '96%',
    },
    moderate: {
      sideMargin: 36,    // 0.5 inch
      topMargin: 36,     // 0.5 inch
      gap: 18,
      previewPadding: '14px 14px',
      boxWidthPercent: '90%',
    },
    normal: {
      sideMargin: 54,    // 0.75 inch
      topMargin: 50,     // ~0.7 inch
      gap: 24,
      previewPadding: '20px 18px',
      boxWidthPercent: '84%',
    },
    minimal: {
      sideMargin: 10,    // ~0.14 inch
      topMargin: 12,     // ~0.16 inch
      gap: 8,
      previewPadding: '4px 4px',
      boxWidthPercent: '98%',
    },
  };

  function renderA4SheetPreview() {
    if (!a4SheetPreview) return;
    a4SheetPreview.innerHTML = '';

    const count = getSlidesPerPageCount();
    const layout = slidesState.layout;
    const margin = slidesState.margin || 'narrow';
    const marginCfg = MARGIN_CONFIG[margin] || MARGIN_CONFIG.narrow;

    a4SheetPreview.style.padding = marginCfg.previewPadding;

    if (layout === '3-centered') {
      for (let s = 1; s <= 3; s++) {
        const slot = document.createElement('div');
        slot.className = 'mockup-slot-centered';
        const thumbUrl = slidesState.previewThumbnails[s];
        const content = thumbUrl
          ? `<img src="${thumbUrl}" class="mockup-slide-canvas" alt="Slide ${s}">`
          : `<span>Slide ${s}</span>`;

        slot.innerHTML = `
          <div class="mockup-slide-box" style="width: ${marginCfg.boxWidthPercent}; border: ${slidesState.slideBorder ? '1.5px solid #cbd5e1' : 'none'};">
            ${content}
          </div>
          ${slidesState.slideNumbers ? `<span class="mockup-slide-label">Slide ${s} of ${slidesState.totalSlides || 3}</span>` : ''}
        `;
        a4SheetPreview.appendChild(slot);
      }
    } else if (layout === '3-notes') {
      const slideBoxWidth = margin === 'narrow' || margin === 'minimal' ? '54%' : (margin === 'normal' ? '46%' : '50%');
      for (let s = 1; s <= 3; s++) {
        const slot = document.createElement('div');
        slot.className = 'mockup-slot-notes';
        const thumbUrl = slidesState.previewThumbnails[s];
        const content = thumbUrl
          ? `<img src="${thumbUrl}" class="mockup-slide-canvas" alt="Slide ${s}">`
          : `<span>Slide ${s}</span>`;

        slot.innerHTML = `
          <div class="mockup-slide-box" style="width: ${slideBoxWidth}; border: ${slidesState.slideBorder ? '1.5px solid #cbd5e1' : 'none'};">
            ${content}
          </div>
          <div class="mockup-lines-box">
            <div class="mockup-note-line"></div>
            <div class="mockup-note-line"></div>
            <div class="mockup-note-line"></div>
            <div class="mockup-note-line"></div>
          </div>
        `;
        a4SheetPreview.appendChild(slot);
      }
    } else if (layout === '2-centered') {
      for (let s = 1; s <= 2; s++) {
        const slot = document.createElement('div');
        slot.className = 'mockup-slot-2centered';
        const thumbUrl = slidesState.previewThumbnails[s];
        const content = thumbUrl
          ? `<img src="${thumbUrl}" class="mockup-slide-canvas" alt="Slide ${s}">`
          : `<span>Slide ${s}</span>`;

        slot.innerHTML = `
          <div class="mockup-slide-box" style="width: ${marginCfg.boxWidthPercent}; border: ${slidesState.slideBorder ? '1.5px solid #cbd5e1' : 'none'};">
            ${content}
          </div>
          ${slidesState.slideNumbers ? `<span class="mockup-slide-label">Slide ${s}</span>` : ''}
        `;
        a4SheetPreview.appendChild(slot);
      }
    } else if (layout === '4-grid') {
      const grid = document.createElement('div');
      grid.className = 'mockup-grid-4';
      const gridGap = margin === 'minimal' ? '6px' : (margin === 'narrow' ? '8px' : (margin === 'normal' ? '12px' : '10px'));
      grid.style.gap = gridGap;
      for (let s = 1; s <= 4; s++) {
        const thumbUrl = slidesState.previewThumbnails[s];
        const content = thumbUrl
          ? `<img src="${thumbUrl}" class="mockup-slide-canvas" alt="Slide ${s}">`
          : `<span>Slide ${s}</span>`;
        grid.innerHTML += `
          <div class="mockup-slide-box" style="border: ${slidesState.slideBorder ? '1.5px solid #cbd5e1' : 'none'};">
            ${content}
          </div>
        `;
      }
      a4SheetPreview.appendChild(grid);
    } else if (layout === '6-grid') {
      const grid = document.createElement('div');
      grid.className = 'mockup-grid-6';
      const gridGap = margin === 'minimal' ? '4px' : (margin === 'narrow' ? '5px' : (margin === 'normal' ? '8px' : '6px'));
      grid.style.gap = gridGap;
      for (let s = 1; s <= 6; s++) {
        const thumbUrl = slidesState.previewThumbnails[s];
        const content = thumbUrl
          ? `<img src="${thumbUrl}" class="mockup-slide-canvas" alt="Slide ${s}">`
          : `<span>Slide ${s}</span>`;
        grid.innerHTML += `
          <div class="mockup-slide-box" style="border: ${slidesState.slideBorder ? '1.5px solid #cbd5e1' : 'none'};">
            ${content}
          </div>
        `;
      }
      a4SheetPreview.appendChild(grid);
    }
  }

  // Generate A4 Handout with embedded slides via PDFLib
  async function executeGenerateSlidesA4() {
    if (executeSlidesBtn && executeSlidesBtn.disabled) return;
    if (!slidesState.file || slidesState.totalSlides === 0) {
      alert('Please upload a presentation PDF first.');
      return;
    }

    if (!window.PDFLib) {
      alert('PDF-Lib is not loaded.');
      return;
    }

    executeSlidesBtn.disabled = true;
    slidesState.isCancelled = false;
    slidesProgressContainer.classList.remove('hidden');
    slidesResultCard.classList.add('hidden');
    setSlidesProgress(5, 'Initializing A4 layout engine...');

    try {
      if (slidesState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const { PDFDocument, PageSizes, rgb, StandardFonts } = window.PDFLib;
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;

      setSlidesProgress(15, 'Loading presentation slides...');
      const srcDoc = await PDFDocument.load(slidesState.arrayBuffer, { ignoreEncryption: true });
      if (slidesState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const outDoc = await PDFDocument.create();
      const font = await outDoc.embedFont(StandardFonts.Helvetica);

      const totalSlides = srcDoc.getPageCount();
      const slidesPerPage = getSlidesPerPageCount();
      const totalA4Pages = Math.ceil(totalSlides / slidesPerPage);

      const margin = slidesState.margin || 'narrow';
      const marginCfg = MARGIN_CONFIG[margin] || MARGIN_CONFIG.narrow;

      async function embedSlideSafely(slidePage) {
        try {
          if (!slidePage.node.Contents()) {
            slidePage.drawText(' ', { x: 0, y: 0, size: 1 });
          }
          // Normalize slide rotation: reset 90/180/270 degree rotation tags to 0 for consistent orientation
          const rot = (slidePage.getRotation ? slidePage.getRotation().angle : 0) % 360;
          if (rot !== 0 && slidePage.setRotation && window.PDFLib.degrees) {
            slidePage.setRotation(window.PDFLib.degrees(0));
          }
        } catch (_) {}
        return await outDoc.embedPage(slidePage);
      }

      for (let pageIdx = 0; pageIdx < totalA4Pages; pageIdx++) {
        if (slidesState.isCancelled) throw new Error('OPERATION_CANCELLED');
        const stepProgress = Math.round(20 + ((pageIdx + 1) / totalA4Pages) * 70);
        setSlidesProgress(stepProgress, `Composing A4 page ${pageIdx + 1} of ${totalA4Pages}...`);

        const a4Page = outDoc.addPage(PageSizes.A4);
        const startSlideIdx = pageIdx * slidesPerPage;
        const endSlideIdx = Math.min(startSlideIdx + slidesPerPage, totalSlides);

        if (slidesState.layout === '3-centered') {
          const topMargin = marginCfg.topMargin;
          const sideMargin = marginCfg.sideMargin;
          const gap = marginCfg.gap;
          const availableHeight = A4_HEIGHT - 2 * topMargin - 2 * gap;
          const slotHeight = availableHeight / 3;
          const slotWidth = A4_WIDTH - 2 * sideMargin;

          for (let s = startSlideIdx; s < endSlideIdx; s++) {
            const slotInPage = s - startSlideIdx;
            const embedded = await embedSlideSafely(srcDoc.getPage(s));
            const origW = embedded.width;
            const origH = embedded.height;

            const maxDrawH = slotHeight - (slidesState.slideNumbers ? 16 : 4);
            const scale = Math.min(slotWidth / origW, maxDrawH / origH);
            const drawW = origW * scale;
            const drawH = origH * scale;

            const drawX = (A4_WIDTH - drawW) / 2;
            const slotTopY = A4_HEIGHT - topMargin - slotInPage * (slotHeight + gap);
            const slotBottomY = slotTopY - slotHeight;
            const drawY = slotBottomY + (maxDrawH - drawH) / 2 + (slidesState.slideNumbers ? 16 : 2);

            a4Page.drawPage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

            if (slidesState.slideBorder) {
              a4Page.drawRectangle({
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH,
                borderColor: rgb(0.8, 0.82, 0.86),
                borderWidth: 0.75,
              });
            }

            if (slidesState.slideNumbers) {
              const label = `Slide ${s + 1} of ${totalSlides}`;
              a4Page.drawText(label, {
                x: drawX + 2,
                y: drawY - 11,
                size: 8,
                font,
                color: rgb(0.45, 0.45, 0.45),
              });
            }
          }
        } else if (slidesState.layout === '3-notes') {
          const topMargin = marginCfg.topMargin;
          const sideMargin = marginCfg.sideMargin;
          const gap = marginCfg.gap;
          const availableHeight = A4_HEIGHT - 2 * topMargin - 2 * gap;
          const slotHeight = availableHeight / 3;
          const slideSlotWidth = Math.floor((A4_WIDTH - 2 * sideMargin - gap) * 0.52);
          const linesStartX = sideMargin + slideSlotWidth + gap;
          const linesEndX = A4_WIDTH - sideMargin;

          for (let s = startSlideIdx; s < endSlideIdx; s++) {
            const slotInPage = s - startSlideIdx;
            const embedded = await embedSlideSafely(srcDoc.getPage(s));
            const origW = embedded.width;
            const origH = embedded.height;

            const maxDrawH = slotHeight - (slidesState.slideNumbers ? 16 : 4);
            const scale = Math.min(slideSlotWidth / origW, maxDrawH / origH);
            const drawW = origW * scale;
            const drawH = origH * scale;

            const drawX = sideMargin + (slideSlotWidth - drawW) / 2;
            const slotTopY = A4_HEIGHT - topMargin - slotInPage * (slotHeight + gap);
            const slotBottomY = slotTopY - slotHeight;
            const drawY = slotBottomY + (maxDrawH - drawH) / 2 + (slidesState.slideNumbers ? 16 : 2);

            a4Page.drawPage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

            if (slidesState.slideBorder) {
              a4Page.drawRectangle({
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH,
                borderColor: rgb(0.8, 0.82, 0.86),
                borderWidth: 0.75,
              });
            }

            if (slidesState.slideNumbers) {
              a4Page.drawText(`Slide ${s + 1} of ${totalSlides}`, {
                x: drawX + 2,
                y: drawY - 11,
                size: 8,
                font,
                color: rgb(0.45, 0.45, 0.45),
              });
            }

            // Note Lines
            const lineCount = 5;
            const lineSpacing = drawH / (lineCount + 1);
            for (let l = 1; l <= lineCount; l++) {
              const lineY = drawY + l * lineSpacing;
              a4Page.drawLine({
                start: { x: linesStartX, y: lineY },
                end: { x: linesEndX, y: lineY },
                color: rgb(0.8, 0.82, 0.85),
                thickness: 0.75,
              });
            }
          }
        } else if (slidesState.layout === '2-centered') {
          const topMargin = marginCfg.topMargin * 1.2;
          const sideMargin = marginCfg.sideMargin;
          const gap = marginCfg.gap * 1.5;
          const availableHeight = A4_HEIGHT - 2 * topMargin - gap;
          const slotHeight = availableHeight / 2;
          const slotWidth = A4_WIDTH - 2 * sideMargin;

          for (let s = startSlideIdx; s < endSlideIdx; s++) {
            const slotInPage = s - startSlideIdx;
            const embedded = await embedSlideSafely(srcDoc.getPage(s));
            const origW = embedded.width;
            const origH = embedded.height;

            const maxDrawH = slotHeight - (slidesState.slideNumbers ? 18 : 6);
            const scale = Math.min(slotWidth / origW, maxDrawH / origH);
            const drawW = origW * scale;
            const drawH = origH * scale;

            const drawX = (A4_WIDTH - drawW) / 2;
            const slotTopY = A4_HEIGHT - topMargin - slotInPage * (slotHeight + gap);
            const slotBottomY = slotTopY - slotHeight;
            const drawY = slotBottomY + (maxDrawH - drawH) / 2 + (slidesState.slideNumbers ? 18 : 2);

            a4Page.drawPage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

            if (slidesState.slideBorder) {
              a4Page.drawRectangle({
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH,
                borderColor: rgb(0.8, 0.82, 0.86),
                borderWidth: 0.75,
              });
            }

            if (slidesState.slideNumbers) {
              a4Page.drawText(`Slide ${s + 1} of ${totalSlides}`, {
                x: drawX + 2,
                y: drawY - 12,
                size: 9,
                font,
                color: rgb(0.45, 0.45, 0.45),
              });
            }
          }
        } else if (slidesState.layout === '4-grid') {
          const topMargin = marginCfg.topMargin;
          const sideMargin = marginCfg.sideMargin;
          const gap = marginCfg.gap;
          const colW = (A4_WIDTH - 2 * sideMargin - gap) / 2;
          const rowH = (A4_HEIGHT - 2 * topMargin - gap) / 2;

          for (let s = startSlideIdx; s < endSlideIdx; s++) {
            const slotInPage = s - startSlideIdx;
            const col = slotInPage % 2;
            const row = Math.floor(slotInPage / 2);
            const embedded = await embedSlideSafely(srcDoc.getPage(s));
            const origW = embedded.width;
            const origH = embedded.height;

            const maxDrawH = rowH - (slidesState.slideNumbers ? 18 : 6);
            const scale = Math.min(colW / origW, maxDrawH / origH);
            const drawW = origW * scale;
            const drawH = origH * scale;

            const slotLeftX = sideMargin + col * (colW + gap);
            const drawX = slotLeftX + (colW - drawW) / 2;
            const slotTopY = A4_HEIGHT - topMargin - row * (rowH + gap);
            const slotBottomY = slotTopY - rowH;
            const drawY = slotBottomY + (maxDrawH - drawH) / 2 + (slidesState.slideNumbers ? 16 : 2);

            a4Page.drawPage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

            if (slidesState.slideBorder) {
              a4Page.drawRectangle({
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH,
                borderColor: rgb(0.8, 0.82, 0.86),
                borderWidth: 0.75,
              });
            }

            if (slidesState.slideNumbers) {
              a4Page.drawText(`Slide ${s + 1}`, {
                x: drawX + 2,
                y: drawY - 10,
                size: 8,
                font,
                color: rgb(0.45, 0.45, 0.45),
              });
            }
          }
        } else if (slidesState.layout === '6-grid') {
          const topMargin = marginCfg.topMargin;
          const sideMargin = marginCfg.sideMargin;
          const gap = marginCfg.gap;
          const colW = (A4_WIDTH - 2 * sideMargin - gap) / 2;
          const rowH = (A4_HEIGHT - 2 * topMargin - 2 * gap) / 3;

          for (let s = startSlideIdx; s < endSlideIdx; s++) {
            const slotInPage = s - startSlideIdx;
            const col = slotInPage % 2;
            const row = Math.floor(slotInPage / 2);
            const embedded = await embedSlideSafely(srcDoc.getPage(s));
            const origW = embedded.width;
            const origH = embedded.height;

            const maxDrawH = rowH - (slidesState.slideNumbers ? 15 : 4);
            const scale = Math.min(colW / origW, maxDrawH / origH);
            const drawW = origW * scale;
            const drawH = origH * scale;

            const slotLeftX = sideMargin + col * (colW + gap);
            const drawX = slotLeftX + (colW - drawW) / 2;
            const slotTopY = A4_HEIGHT - topMargin - row * (rowH + gap);
            const slotBottomY = slotTopY - rowH;
            const drawY = slotBottomY + (maxDrawH - drawH) / 2 + (slidesState.slideNumbers ? 13 : 2);

            a4Page.drawPage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

            if (slidesState.slideBorder) {
              a4Page.drawRectangle({
                x: drawX,
                y: drawY,
                width: drawW,
                height: drawH,
                borderColor: rgb(0.8, 0.82, 0.86),
                borderWidth: 0.75,
              });
            }

            if (slidesState.slideNumbers) {
              a4Page.drawText(`Slide ${s + 1}`, {
                x: drawX + 2,
                y: drawY - 9,
                size: 7.5,
                font,
                color: rgb(0.45, 0.45, 0.45),
              });
            }
          }
        }
      }

      setSlidesProgress(95, 'Finalizing A4 document...');
      const outPdfBytes = await outDoc.save();

      if (slidesState.outputUrl) {
        URL.revokeObjectURL(slidesState.outputUrl);
      }

      slidesState.outputBlob = new Blob([outPdfBytes], { type: 'application/pdf' });
      slidesState.outputUrl = URL.createObjectURL(slidesState.outputBlob);

      setSlidesProgress(100, 'Complete!');

      let rawFilename = slidesOutputFilename.value.trim() || 'presentation_A4_handout';
      if (!rawFilename.toLowerCase().endsWith('.pdf')) {
        rawFilename += '.pdf';
      }
      slidesDownloadBtn.href = slidesState.outputUrl;
      slidesDownloadBtn.download = rawFilename;

      slidesResultSummary.textContent = `Formatted ${totalSlides} slides onto ${totalA4Pages} A4 pages (${formatBytes(slidesState.outputBlob.size)}).`;
      if (slidesShareBtn && typeof navigator !== 'undefined' && navigator.share) slidesShareBtn.classList.remove('hidden');
      slidesResultCard.classList.remove('hidden');
      slidesResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      trackToolUsage('slides_to_a4');
    } catch (err) {
      if (err.message === 'OPERATION_CANCELLED') {
        setSlidesProgress(0, 'Handout generation cancelled.');
        return;
      }
      console.error('Error generating A4 handout:', err);
      alert('Failed to generate A4 handout: ' + (err.message || 'Unknown error'));
    } finally {
      slidesState.isCancelled = false;
      executeSlidesBtn.disabled = false;
      setTimeout(() => {
        slidesProgressContainer.classList.add('hidden');
      }, 800);
    }
  }

  function setSlidesProgress(percent, text) {
    slidesProgressBar.style.width = `${percent}%`;
    slidesProgressPercent.textContent = `${percent}%`;
    slidesProgressText.textContent = text;
  }

  // ==========================================
  // TAB 4: INVERT COLORS CONTROLLER
  // ==========================================
  async function handleInvertFileSelected(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please upload a valid PDF document.');
      return;
    }

    const isGenuinePdf = await isValidPdfFile(file);
    if (!isGenuinePdf) {
      alert(`Security Warning: "${file.name}" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);
      return;
    }

    try {
      invertFileName.textContent = file.name;
      invertFileSubtext.textContent = 'Analyzing PDF...';
      invertDropzoneSection.classList.add('hidden');
      invertWorkspace.classList.remove('hidden');
      invertResultCard.classList.add('hidden');

      const arrayBuffer = await file.arrayBuffer();
      invertState.file = file;
      invertState.arrayBuffer = arrayBuffer;

      // Set default output filename
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      invertOutputFilename.value = `${baseName}_inverted.pdf`;

      // Read total pages with pdf-lib immediately
      if (window.PDFLib) {
        const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        invertState.pdfDoc = doc;
        invertState.totalPages = doc.getPageCount();
        invertFileSubtext.textContent = `${invertState.totalPages} pages • ${formatBytes(file.size)}`;
      }

      invertState.previewPageNum = 1;
      updateInvertNavButtons();
      await renderInvertComparisonPreview();
      updateInvertHint();
    } catch (err) {
      if (isPasswordProtectedError(err)) {
        alert('🔒 This PDF document is password-protected or encrypted.\nPlease remove password protection before uploading it.');
        resetInvertWorkspace();
        return;
      }
      console.error('Error loading PDF for inversion:', err);
      alert('Could not open PDF document: ' + (err.message || 'Unknown error'));
      resetInvertWorkspace();
    }
  }

  function resetInvertWorkspace() {
    invertState.file = null;
    invertState.arrayBuffer = null;
    invertState.pdfDoc = null;
    invertState.totalPages = 0;
    invertState.previewPageNum = 1;
    invertState.originalCanvasCache = null;
    invertState.isCancelled = false;

    // Release backing canvas bitmaps
    if (invertOriginalCanvas) {
      invertOriginalCanvas.width = 0;
      invertOriginalCanvas.height = 0;
    }
    if (invertPreviewCanvas) {
      invertPreviewCanvas.width = 0;
      invertPreviewCanvas.height = 0;
    }
    if (invertDisplayCanvas) {
      invertDisplayCanvas.width = 0;
      invertDisplayCanvas.height = 0;
    }

    if (invertState.outputUrl) {
      URL.revokeObjectURL(invertState.outputUrl);
      invertState.outputUrl = null;
      invertState.outputBlob = null;
    }
    invertFileInput.value = '';
    invertWorkspace.classList.add('hidden');
    invertDropzoneSection.classList.remove('hidden');
    invertResultCard.classList.add('hidden');
  }

  // Inversion Algorithms
  function invertPixelsNegative(data) {
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      data[i] = 255 - data[i];         // Red
      data[i + 1] = 255 - data[i + 1]; // Green
      data[i + 2] = 255 - data[i + 2]; // Blue
    }
  }

  function invertPixelsGrayscale(data) {
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const inv = 255 - gray;
      data[i] = inv;
      data[i + 1] = inv;
      data[i + 2] = inv;
    }
  }

  function isPageDark(data) {
    let totalLuma = 0;
    let samples = 0;
    const len = data.length;
    for (let i = 0; i < len; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      totalLuma += 0.299 * r + 0.587 * g + 0.114 * b;
      samples++;
    }
    const avgLuma = totalLuma / (samples || 1);
    return avgLuma < 128;
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      const val = Math.round(l * 255);
      return [val, val, val];
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, h) * 255);
    const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
    return [r, g, b];
  }

  function invertPixelsPreserveHue(data) {
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      const [r2, g2, b2] = hslToRgb(h, s, 1 - l);
      data[i] = r2;
      data[i + 1] = g2;
      data[i + 2] = b2;
    }
  }

  function applyInvertAlgorithm(imageData, mode) {
    const data = imageData.data;
    if (mode === 'grayscale-invert') {
      invertPixelsGrayscale(data);
    } else if (mode === 'preserve-hue') {
      invertPixelsPreserveHue(data);
    } else if (mode === 'dark-only') {
      if (isPageDark(data)) {
        invertPixelsNegative(data);
      }
    } else {
      invertPixelsNegative(data);
    }
  }

  async function renderInvertComparisonPreview() {
    if (!invertState.arrayBuffer || !window.pdfjsLib) return;

    const renderId = ++invertState.activeRenderId;
    invertOriginalSpinner.classList.remove('hidden');
    invertPreviewSpinner.classList.remove('hidden');

    try {
      const bufferClone = new Uint8Array(invertState.arrayBuffer.slice(0));
      const loadingTask = pdfjsLib.getDocument({ data: bufferClone });
      const pdf = await loadingTask.promise;
      if (renderId !== invertState.activeRenderId) return;

      const pageNum = Math.max(1, Math.min(invertState.previewPageNum, pdf.numPages));
      const page = await pdf.getPage(pageNum);
      if (renderId !== invertState.activeRenderId) return;

      const viewport = page.getViewport({ scale: 1.5 });

      invertOriginalCanvas.width = viewport.width;
      invertOriginalCanvas.height = viewport.height;
      const origCtx = invertOriginalCanvas.getContext('2d');
      origCtx.fillStyle = '#ffffff';
      origCtx.fillRect(0, 0, viewport.width, viewport.height);
      await page.render({ canvasContext: origCtx, viewport }).promise;
      if (renderId !== invertState.activeRenderId) return;

      invertOriginalSpinner.classList.add('hidden');

      invertState.originalCanvasCache = origCtx.getImageData(0, 0, viewport.width, viewport.height);

      updateInvertedPreviewCanvas();
      window.INVERT_PREVIEW_READY = true;
    } catch (err) {
      if (renderId === invertState.activeRenderId) {
        console.error('Error rendering comparison preview:', err);
      }
    } finally {
      if (renderId === invertState.activeRenderId) {
        invertOriginalSpinner.classList.add('hidden');
        invertPreviewSpinner.classList.add('hidden');
      }
    }
  }

  async function updateInvertedPreviewCanvas() {
    if (!invertState.originalCanvasCache) return;

    invertPreviewCanvas.width = invertOriginalCanvas.width;
    invertPreviewCanvas.height = invertOriginalCanvas.height;
    const prevCtx = invertPreviewCanvas.getContext('2d');
    const width = invertState.originalCanvasCache.width;
    const height = invertState.originalCanvasCache.height;
    const currentRenderId = invertState.activeRenderId;

    let workerSuccess = false;
    if (appWorkerPool && appWorkerPool.isAvailable) {
      try {
        const bufferCopy = invertState.originalCanvasCache.data.buffer.slice(0);
        const res = await appWorkerPool.runTask('invert', {
          buffer: bufferCopy,
          width,
          height,
          mode: invertState.mode,
          returnJpeg: false
        }, [bufferCopy]);

        if (currentRenderId === invertState.activeRenderId && res && res.buffer) {
          const invData = new ImageData(new Uint8ClampedArray(res.buffer), width, height);
          prevCtx.putImageData(invData, 0, 0);
          invertPreviewSpinner.classList.add('hidden');
          refreshInvertDisplay();
          workerSuccess = true;
        }
      } catch (err) {
        // Fallback to main thread
      }
    }

    if (!workerSuccess && currentRenderId === invertState.activeRenderId) {
      const imgDataCopy = prevCtx.createImageData(width, height);
      imgDataCopy.data.set(invertState.originalCanvasCache.data);
      applyInvertAlgorithm(imgDataCopy, invertState.mode);
      prevCtx.putImageData(imgDataCopy, 0, 0);
      invertPreviewSpinner.classList.add('hidden');
      refreshInvertDisplay();
    }
  }

  function refreshInvertDisplay() {
    if (!invertDisplayCanvas) return;
    const isShowingInverted = !btnShowOriginal || !btnShowOriginal.classList.contains('active');
    const sourceCanvas = isShowingInverted ? invertPreviewCanvas : invertOriginalCanvas;
    if (!sourceCanvas || sourceCanvas.width === 0) return;

    invertDisplayCanvas.width = sourceCanvas.width;
    invertDisplayCanvas.height = sourceCanvas.height;
    const ctx = invertDisplayCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);

    if (invertDisplayCaption) {
      if (isShowingInverted) {
        invertDisplayCaption.innerHTML = 'Viewing: <strong>Hardcopy Print-Ready (White Paper)</strong>';
      } else {
        invertDisplayCaption.innerHTML = 'Viewing: <strong>Original Screen Version (Dark Background)</strong>';
      }
    }
  }

  function updateInvertNavButtons() {
    const total = invertState.totalPages || 1;
    const current = invertState.previewPageNum;
    invertPageNavText.textContent = `Page ${current} of ${total}`;
    invertPrevPageBtn.disabled = current <= 1;
    invertNextPageBtn.disabled = current >= total;
  }

  function updateInvertHint() {
    if (!invertHintText) return;
    const mode = invertState.mode;
    if (mode === 'grayscale-invert') {
      invertHintText.innerHTML = '🖨️ <strong>Monochrome Ink Saver:</strong> Converts dark backgrounds into pure white paper and turns all text &amp; charts to black/grayscale.';
    } else if (mode === 'dark-only') {
      invertHintText.innerHTML = '🌓 <strong>Smart Auto Invert:</strong> Automatically inverts dark slides into white pages, but leaves pages that are already white untouched.';
    } else if (mode === 'preserve-hue') {
      invertHintText.innerHTML = '🎨 <strong>Color Preserving:</strong> Inverts brightness while retaining color hues (e.g. blue remains blue, red remains red on white paper).';
    } else {
      invertHintText.innerHTML = '🖨️ <strong>Smart Negative:</strong> Inverts dark backgrounds to clean white paper and light text to dark, saving up to 90% toner.';
    }
  }

  async function executeInvertPdf() {
    if (executeInvertBtn && executeInvertBtn.disabled) return;
    if (!invertState.file || invertState.totalPages === 0) {
      alert('Please upload a PDF document first.');
      return;
    }

    if (!window.PDFLib || !window.pdfjsLib) {
      alert('PDF libraries are not loaded.');
      return;
    }

    executeInvertBtn.disabled = true;
    invertState.isCancelled = false;
    invertProgressContainer.classList.remove('hidden');
    invertResultCard.classList.add('hidden');
    setInvertProgress(5, 'Preparing document inversion...');

    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');

    try {
      if (invertState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const { PDFDocument } = window.PDFLib;
      const totalPages = invertState.totalPages;

      let pagesToInvertSet = new Set();
      if (invertState.pagesMode === 'custom' && invertState.customPages.trim()) {
        pagesToInvertSet = parsePageInput(invertState.customPages, totalPages);
        if (pagesToInvertSet.size === 0) {
          for (let p = 1; p <= totalPages; p++) pagesToInvertSet.add(p);
        }
      } else {
        for (let p = 1; p <= totalPages; p++) pagesToInvertSet.add(p);
      }

      let scaleMultiplier = 2.0;
      if (invertState.quality === 'ultra') scaleMultiplier = 3.0;
      else if (invertState.quality === 'standard') scaleMultiplier = 1.5;

      setInvertProgress(12, 'Loading source pages...');
      const srcDoc = await PDFDocument.load(invertState.arrayBuffer, { ignoreEncryption: true });
      if (invertState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const outDoc = await PDFDocument.create();

      const bufferClone = new Uint8Array(invertState.arrayBuffer.slice(0));
      const pdfjsDoc = await pdfjsLib.getDocument({ data: bufferClone }).promise;

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        if (invertState.isCancelled) throw new Error('OPERATION_CANCELLED');

        const pageNum = pageIdx + 1;
        const stepProgress = Math.round(15 + (pageIdx / totalPages) * 75);
        setInvertProgress(stepProgress, `Inverting page ${pageNum} of ${totalPages}...`);

        const srcPage = srcDoc.getPage(pageIdx);
        const { width: origWidth, height: origHeight } = srcPage.getSize();

        if (pagesToInvertSet.has(pageNum)) {
          const pdfjsPage = await pdfjsDoc.getPage(pageNum);
          const viewport = pdfjsPage.getViewport({ scale: scaleMultiplier });

          offCanvas.width = viewport.width;
          offCanvas.height = viewport.height;
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, viewport.width, viewport.height);

          await pdfjsPage.render({ canvasContext: offCtx, viewport }).promise;
          if (invertState.isCancelled) throw new Error('OPERATION_CANCELLED');

          const imgData = offCtx.getImageData(0, 0, viewport.width, viewport.height);
          let embeddedImage = null;

          if (appWorkerPool && appWorkerPool.isAvailable) {
            try {
              const bufferCopy = imgData.data.buffer.slice(0);
              const res = await appWorkerPool.runTask('invert', {
                buffer: bufferCopy,
                width: viewport.width,
                height: viewport.height,
                mode: invertState.mode,
                returnJpeg: appWorkerPool.hasOffscreenCanvas !== false,
                quality: 0.92
              }, [bufferCopy]);

              if (res && res.jpegBuffer) {
                const jpegBytes = new Uint8Array(res.jpegBuffer);
                embeddedImage = await outDoc.embedJpg(jpegBytes);
              } else if (res && res.buffer) {
                const invImgData = new ImageData(new Uint8ClampedArray(res.buffer), viewport.width, viewport.height);
                offCtx.putImageData(invImgData, 0, 0);
                const jpegDataUrl = offCanvas.toDataURL('image/jpeg', 0.92);
                const base64Data = jpegDataUrl.split(',')[1];
                const jpegBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
                embeddedImage = await outDoc.embedJpg(jpegBytes);
              }
            } catch (wErr) {
              console.warn('[Worker] Invert page task fallback:', wErr);
            }
          }

          if (!embeddedImage) {
            const fallbackImgData = offCtx.getImageData(0, 0, viewport.width, viewport.height);
            applyInvertAlgorithm(fallbackImgData, invertState.mode);
            offCtx.putImageData(fallbackImgData, 0, 0);

            const jpegDataUrl = offCanvas.toDataURL('image/jpeg', 0.92);
            const base64Data = jpegDataUrl.split(',')[1];
            const jpegBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

            embeddedImage = await outDoc.embedJpg(jpegBytes);
          }
          const outPage = outDoc.addPage([origWidth, origHeight]);
          outPage.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: origWidth,
            height: origHeight,
          });
        } else {
          const [copiedPage] = await outDoc.copyPages(srcDoc, [pageIdx]);
          outDoc.addPage(copiedPage);
        }
      }

      if (invertState.isCancelled) throw new Error('OPERATION_CANCELLED');

      setInvertProgress(95, 'Finalizing inverted document...');
      const outPdfBytes = await outDoc.save();

      if (invertState.outputUrl) {
        URL.revokeObjectURL(invertState.outputUrl);
      }

      invertState.outputBlob = new Blob([outPdfBytes], { type: 'application/pdf' });
      invertState.outputUrl = URL.createObjectURL(invertState.outputBlob);

      setInvertProgress(100, 'Complete!');

      let rawFilename = invertOutputFilename.value.trim() || 'document_inverted';
      if (!rawFilename.toLowerCase().endsWith('.pdf')) {
        rawFilename += '.pdf';
      }
      invertDownloadBtn.href = invertState.outputUrl;
      invertDownloadBtn.download = rawFilename;

      invertResultSummary.textContent = `Successfully inverted ${pagesToInvertSet.size} of ${totalPages} pages (${formatBytes(invertState.outputBlob.size)}). Ready for printing!`;
      if (invertShareBtn && typeof navigator !== 'undefined' && navigator.share) invertShareBtn.classList.remove('hidden');
      invertResultCard.classList.remove('hidden');
      invertResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      trackToolUsage('invert_colors');
    } catch (err) {
      if (err.message === 'OPERATION_CANCELLED') {
        setInvertProgress(0, 'Document inversion cancelled.');
        return;
      }
      console.error('Error inverting PDF:', err);
      alert('Failed to invert PDF: ' + (err.message || 'Unknown error'));
    } finally {
      // Release offscreen canvas memory
      offCanvas.width = 0;
      offCanvas.height = 0;
      invertState.isCancelled = false;
      executeInvertBtn.disabled = false;
      setTimeout(() => {
        invertProgressContainer.classList.add('hidden');
      }, 800);
    }
  }

  function setInvertProgress(percent, text) {
    invertProgressBar.style.width = `${percent}%`;
    invertProgressPercent.textContent = `${percent}%`;
    invertProgressText.textContent = text;
  }

  // ==========================================
  // TAB 5: COMPRESS PDF CORE ENGINE
  // ==========================================

  async function handleCompressFileSelected(file) {
    if (!file) return;

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please upload a valid PDF file.');
      return;
    }

    const isGenuinePdf = await isValidPdfFile(file);
    if (!isGenuinePdf) {
      alert(`Security Warning: "${file.name}" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();

      let pdfjsDoc;
      try {
        const bufferCopy = new Uint8Array(arrayBuffer.slice(0));
        pdfjsDoc = await pdfjsLib.getDocument({ data: bufferCopy }).promise;
      } catch (loadErr) {
        if (isPasswordProtectedError(loadErr)) {
          alert('🔒 This PDF document is password-protected or encrypted. Please remove password protection before compressing.');
          return;
        }
        throw loadErr;
      }

      compressState.file = file;
      compressState.arrayBuffer = arrayBuffer;
      compressState.totalPages = pdfjsDoc.numPages;
      compressState.previewPageNum = 1;

      // Update UI elements
      compressFileName.textContent = file.name;
      compressPageCount.textContent = `${compressState.totalPages} page${compressState.totalPages > 1 ? 's' : ''}`;
      compressOriginalSize.textContent = formatBytes(file.size);

      // Default output name
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      compressOutputFilename.value = `${baseName}_compressed.pdf`;

      // Show workspace
      compressDropzone.parentElement.classList.add('hidden');
      compressWorkspaceSection.classList.remove('hidden');
      compressResultCard.classList.add('hidden');

      updateCompressHintAndPresetUI();
      await renderCompressComparisonPreview();
    } catch (err) {
      console.error('Error loading PDF for compression:', err);
      alert('Failed to load PDF: ' + (err.message || 'Unknown error'));
    }
  }

  function resetCompressWorkspace() {
    if (compressState.outputUrl) {
      URL.revokeObjectURL(compressState.outputUrl);
      compressState.outputUrl = null;
    }
    compressState.file = null;
    compressState.arrayBuffer = null;
    compressState.pdfDoc = null;
    compressState.totalPages = 0;
    compressState.previewPageNum = 1;
    compressFileInput.value = '';

    if (compressOriginalCanvas) {
      compressOriginalCanvas.width = 0;
      compressOriginalCanvas.height = 0;
    }
    if (compressPreviewCanvas) {
      compressPreviewCanvas.width = 0;
      compressPreviewCanvas.height = 0;
    }

    compressWorkspaceSection.classList.add('hidden');
    compressDropzone.parentElement.classList.remove('hidden');
    compressResultCard.classList.add('hidden');
  }

  function updateCompressSavingsMeter() {
    if (!meterOrigSize || !compressState.file) return;
    const origBytes = compressState.file.size;
    meterOrigSize.textContent = formatBytes(origBytes);

    let estRatio = 0.25; // 75% smaller for recommended
    let estSavedLabel = '~75%';

    if (compressState.preset === 'lossless') {
      estRatio = 0.80; // 20% smaller
      estSavedLabel = '~20%';
    } else if (compressState.preset === 'extreme') {
      estRatio = 0.10; // 90% smaller
      estSavedLabel = 'up to 90%';
    }

    const estBytes = Math.round(origBytes * estRatio);
    if (meterEstSize) {
      meterEstSize.textContent = '~' + formatBytes(estBytes);
    }
    const savedBytes = Math.max(0, origBytes - estBytes);
    if (meterEstSaved) {
      meterEstSaved.textContent = `🎯 Estimated savings: ${estSavedLabel} (~${formatBytes(savedBytes)} saved)`;
    }
  }

  function updateCompressHintAndPresetUI() {
    const allCards = document.querySelectorAll('#compressWorkspaceSection .preset-choice-card, .compress-preset-card');
    allCards.forEach((card) => {
      const radio = card.querySelector('input[type="radio"]');
      const val = (radio && radio.value) || card.dataset.preset;
      if (val === compressState.preset) {
        card.classList.add('active');
        if (radio) radio.checked = true;
      } else {
        card.classList.remove('active');
      }
    });

    if (compressHintText) {
      if (compressState.preset === 'lossless') {
        compressHintText.innerHTML = '💎 <strong>Lossless Mode Active:</strong> Compresses internal syntax &amp; dictionary cross-references without modifying any image pixels. Ideal for official, legal, and vector documents.';
      } else if (compressState.preset === 'recommended') {
        compressHintText.innerHTML = '🎯 <strong>Visually Lossless Active:</strong> Resamples oversized scans &amp; images to ~180 DPI with high-fidelity encoding. 100% sharp text with 60%–80% size savings!';
      } else if (compressState.preset === 'balanced') {
        compressHintText.innerHTML = '📄 <strong>Balanced Web Mode Active:</strong> Standard ~140 DPI optimization. Ideal balance between sharpness and compact file size for web, Slack, or archives.';
      } else if (compressState.preset === 'extreme') {
        compressHintText.innerHTML = '📧 <strong>Maximum Compression Active:</strong> Heavy ~100 DPI compression for fitting within strict email limits (<25MB) and portal file caps.';
      }
    }

    updateCompressSavingsMeter();
  }

  async function renderCompressComparisonPreview() {
    if (!compressState.arrayBuffer || compressState.totalPages === 0) return;

    compressState.activeRenderId++;
    const currentRenderId = compressState.activeRenderId;

    compressOriginalSpinner.classList.remove('hidden');
    compressPreviewSpinner.classList.remove('hidden');

    compressPageNavText.textContent = `Page ${compressState.previewPageNum} of ${compressState.totalPages}`;
    compressPrevPageBtn.disabled = compressState.previewPageNum <= 1;
    compressNextPageBtn.disabled = compressState.previewPageNum >= compressState.totalPages;

    try {
      const bufferCopy = new Uint8Array(compressState.arrayBuffer.slice(0));
      const pdfjsDoc = await pdfjsLib.getDocument({ data: bufferCopy }).promise;

      if (currentRenderId !== compressState.activeRenderId) return;

      const page = await pdfjsDoc.getPage(compressState.previewPageNum);
      const standardViewport = page.getViewport({ scale: 1.0 });

      // 1. Render Original Viewport
      const origCtx = compressOriginalCanvas.getContext('2d');
      compressOriginalCanvas.width = standardViewport.width;
      compressOriginalCanvas.height = standardViewport.height;

      origCtx.fillStyle = '#ffffff';
      origCtx.fillRect(0, 0, standardViewport.width, standardViewport.height);
      await page.render({ canvasContext: origCtx, viewport: standardViewport }).promise;

      if (currentRenderId !== compressState.activeRenderId) return;
      compressOriginalSpinner.classList.add('hidden');
      compressOriginalBadgeText.textContent = 'Native Vector / 100% Quality';

      // 2. Render Simulated Compressed Preview
      const prevCtx = compressPreviewCanvas.getContext('2d');
      compressPreviewCanvas.width = standardViewport.width;
      compressPreviewCanvas.height = standardViewport.height;

      if (compressState.preset === 'lossless') {
        // In lossless mode, visual pixels are identical
        prevCtx.drawImage(compressOriginalCanvas, 0, 0);
        compressPreviewBadgeText.textContent = 'Lossless Stream (100% Bit-Exact)';
      } else {
        let simScale = 1.8;
        let simQuality = 0.80;
        let badgeLabel = 'Visually Lossless (~180 DPI)';

        if (compressState.preset === 'balanced') {
          simScale = 1.4;
          simQuality = 0.68;
          badgeLabel = 'Balanced (~140 DPI)';
        } else if (compressState.preset === 'extreme') {
          simScale = 1.0;
          simQuality = 0.52;
          badgeLabel = 'Email Optimized (~100 DPI)';
        }

        const simViewport = page.getViewport({ scale: simScale });
        const offCanvas = document.createElement('canvas');
        offCanvas.width = simViewport.width;
        offCanvas.height = simViewport.height;
        const offCtx = offCanvas.getContext('2d');

        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, simViewport.width, simViewport.height);
        await page.render({ canvasContext: offCtx, viewport: simViewport }).promise;

        if (currentRenderId !== compressState.activeRenderId) {
          offCanvas.width = 0;
          offCanvas.height = 0;
          return;
        }

        const dataUrl = offCanvas.toDataURL('image/jpeg', simQuality);
        const img = new Image();
        img.onload = () => {
          if (currentRenderId !== compressState.activeRenderId) return;
          prevCtx.fillStyle = '#ffffff';
          prevCtx.fillRect(0, 0, compressPreviewCanvas.width, compressPreviewCanvas.height);
          prevCtx.drawImage(img, 0, 0, compressPreviewCanvas.width, compressPreviewCanvas.height);
          compressPreviewBadgeText.textContent = badgeLabel;
          compressPreviewSpinner.classList.add('hidden');
        };
        img.src = dataUrl;

        offCanvas.width = 0;
        offCanvas.height = 0;
      }

      if (compressState.preset === 'lossless') {
        compressPreviewSpinner.classList.add('hidden');
      }
    } catch (err) {
      console.error('Error rendering compression preview:', err);
    } finally {
      if (currentRenderId === compressState.activeRenderId) {
        compressOriginalSpinner.classList.add('hidden');
        compressPreviewSpinner.classList.add('hidden');
        window.COMPRESS_PREVIEW_READY = true;
      }
    }
  }

  async function executeCompressPDF() {
    if (executeCompressBtn && executeCompressBtn.disabled) return;
    if (!compressState.arrayBuffer || !window.PDFLib) {
      alert('No PDF file loaded or PDF-Lib is not ready.');
      return;
    }

    executeCompressBtn.disabled = true;
    compressState.isCancelled = false;
    compressProgressContainer.classList.remove('hidden');
    compressResultCard.classList.add('hidden');
    setCompressProgress(5, 'Initializing PDF compression...');

    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');

    try {
      if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const { PDFDocument } = window.PDFLib;
      let outPdfBytes;

      if (compressState.preset === 'lossless') {
        // --- 100% Bit-Exact Pure Lossless Object Stream Packing ---
        setCompressProgress(20, 'Loading document syntax tree...');
        const srcDoc = await PDFDocument.load(compressState.arrayBuffer, { ignoreEncryption: true });

        if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');
        setCompressProgress(60, 'Re-indexing objects & applying Flate object streams...');

        outPdfBytes = await srcDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
          objectsPerTick: 50,
          updateFieldAppearances: false,
        });
      } else {
        // --- Smart Visually Lossless / Balanced / Extreme Raster Optimizer ---
        let scaleMultiplier = 1.8;
        let jpegQuality = 0.80;

        if (compressState.preset === 'balanced') {
          scaleMultiplier = 1.4;
          jpegQuality = 0.68;
        } else if (compressState.preset === 'extreme') {
          scaleMultiplier = 1.0;
          jpegQuality = 0.52;
        }

        setCompressProgress(12, 'Loading document pages...');
        const srcDoc = await PDFDocument.load(compressState.arrayBuffer, { ignoreEncryption: true });
        if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');

        const outDoc = await PDFDocument.create();
        const totalPages = compressState.totalPages;

        const bufferClone = new Uint8Array(compressState.arrayBuffer.slice(0));
        const pdfjsDoc = await pdfjsLib.getDocument({ data: bufferClone }).promise;

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
          if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');

          const pageNum = pageIdx + 1;
          const stepProgress = Math.round(15 + (pageIdx / totalPages) * 75);
          setCompressProgress(stepProgress, `Compressing page ${pageNum} of ${totalPages}...`);

          const srcPage = srcDoc.getPage(pageIdx);
          const { width: origWidth, height: origHeight } = srcPage.getSize();

          const pdfjsPage = await pdfjsDoc.getPage(pageNum);
          const viewport = pdfjsPage.getViewport({ scale: scaleMultiplier });

          offCanvas.width = viewport.width;
          offCanvas.height = viewport.height;
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, viewport.width, viewport.height);

          await pdfjsPage.render({ canvasContext: offCtx, viewport }).promise;
          if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');

          let embeddedImage = null;
          if (appWorkerPool && appWorkerPool.isAvailable && appWorkerPool.hasOffscreenCanvas !== false) {
            try {
              const imgData = offCtx.getImageData(0, 0, viewport.width, viewport.height);
              const bufferCopy = imgData.data.buffer.slice(0);
              const res = await appWorkerPool.runTask('compress-resample', {
                buffer: bufferCopy,
                width: viewport.width,
                height: viewport.height,
                quality: jpegQuality
              }, [bufferCopy]);

              if (res && res.jpegBuffer) {
                const jpegBytes = new Uint8Array(res.jpegBuffer);
                embeddedImage = await outDoc.embedJpg(jpegBytes);
              }
            } catch (wErr) {
              console.warn('[Worker] Compress page task fallback:', wErr);
            }
          }

          if (!embeddedImage) {
            const jpegDataUrl = offCanvas.toDataURL('image/jpeg', jpegQuality);
            const base64Data = jpegDataUrl.split(',')[1];
            const jpegBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
            embeddedImage = await outDoc.embedJpg(jpegBytes);
          }
          const outPage = outDoc.addPage([origWidth, origHeight]);
          outPage.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: origWidth,
            height: origHeight,
          });
        }

        if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');

        setCompressProgress(92, 'Packaging optimized PDF document...');
        outPdfBytes = await outDoc.save({ useObjectStreams: true });
      }

      if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');

      // Finalize output
      if (compressState.outputUrl) {
        URL.revokeObjectURL(compressState.outputUrl);
      }

      compressState.outputBlob = new Blob([outPdfBytes], { type: 'application/pdf' });
      compressState.outputUrl = URL.createObjectURL(compressState.outputBlob);

      setCompressProgress(100, 'Complete!');

      // Set download link & filename
      let rawFilename = compressOutputFilename.value.trim() || 'document_compressed';
      if (!rawFilename.toLowerCase().endsWith('.pdf')) {
        rawFilename += '.pdf';
      }
      compressDownloadBtn.href = compressState.outputUrl;
      compressDownloadBtn.download = rawFilename;

      // Stats calculation
      const origBytes = compressState.file.size;
      const compBytes = outPdfBytes.length;
      const savedBytes = origBytes - compBytes;
      const pctSaved = origBytes > 0 ? Math.round(((origBytes - compBytes) / origBytes) * 1000) / 10 : 0;

      statOriginalSize.textContent = formatBytes(origBytes);
      statCompressedSize.textContent = formatBytes(compBytes);

      if (savedBytes > 0) {
        statPercentSaved.textContent = `-${pctSaved}% (${formatBytes(savedBytes)} saved)`;
        statPercentSaved.parentElement.classList.add('stat-highlight');
        compressResultSummary.textContent = `Successfully compressed ${compressState.totalPages} pages, saving ${formatBytes(savedBytes)} (${pctSaved}% reduction)!`;
      } else {
        statPercentSaved.textContent = 'Fully Optimized';
        statPercentSaved.parentElement.classList.remove('stat-highlight');
        compressResultSummary.textContent = `Document is already packed with optimal streams (${formatBytes(compBytes)}).`;
      }

      if (compressShareBtn && typeof navigator !== 'undefined' && navigator.share) compressShareBtn.classList.remove('hidden');
      compressResultCard.classList.remove('hidden');
      compressResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      trackToolUsage('compress_pdf');
    } catch (err) {
      if (err.message === 'OPERATION_CANCELLED') {
        setCompressProgress(0, 'Compression cancelled.');
        return;
      }
      console.error('Error compressing PDF:', err);
      alert('Failed to compress PDF: ' + (err.message || 'Unknown error'));
    } finally {
      offCanvas.width = 0;
      offCanvas.height = 0;
      compressState.isCancelled = false;
      executeCompressBtn.disabled = false;
      setTimeout(() => {
        compressProgressContainer.classList.add('hidden');
      }, 800);
    }
  }

  function setCompressProgress(percent, text) {
    compressProgressBar.style.width = `${percent}%`;
    compressProgressPercent.textContent = `${percent}%`;
    compressProgressText.textContent = text;
  }

  // ==========================================
  // TAB 6: IMAGE TO PDF FUNCTIONS
  // ==========================================
  async function handleImageFilesAdded(fileList) {
    if (!fileList || fileList.length === 0) return;

    const validExtensions = /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i;
    const validImages = [];
    const invalidImages = [];

    for (const f of Array.from(fileList)) {
      const isExt = f.type.startsWith('image/') || validExtensions.test(f.name);
      if (!isExt) {
        invalidImages.push(f.name);
        continue;
      }
      const isGenuine = await isValidImageFile(f);
      if (!isGenuine) {
        invalidImages.push(f.name);
      } else {
        validImages.push(f);
      }
    }

    if (invalidImages.length > 0 && validImages.length === 0) {
      alert(`Security Warning: The selected file(s) [${invalidImages.join(', ')}] are not genuine image files (corrupted or unrecognized format). Upload rejected.`);
      return;
    } else if (invalidImages.length > 0) {
      alert(`Security Notice: Excluded invalid or corrupted image file(s): ${invalidImages.join(', ')}`);
    }

    if (validImages.length === 0) {
      alert('Please select valid image files (JPG, PNG, WebP, GIF, BMP).');
      return;
    }

    for (const file of validImages) {
      const objUrl = URL.createObjectURL(file);
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
        img.onerror = () => resolve({ width: 800, height: 600 });
        img.src = objUrl;
      });

      imagesState.images.push({
        id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        file: file,
        name: file.name,
        size: file.size,
        type: file.type || 'image/jpeg',
        dataUrl: objUrl,
        width: dims.width,
        height: dims.height,
        rotation: 0,
      });
    }

    renderImagesGrid();
  }

  function renderImagesGrid() {
    const total = imagesState.images.length;
    if (total === 0) {
      imagesDropzoneSection.classList.remove('hidden');
      imagesManageSection.classList.add('hidden');
      imagesResultCard.classList.add('hidden');
      return;
    }

    imagesDropzoneSection.classList.add('hidden');
    imagesManageSection.classList.remove('hidden');

    const totalBytes = imagesState.images.reduce((sum, item) => sum + (item.size || 0), 0);
    imagesCountBadge.textContent = `${total} image${total > 1 ? 's' : ''}`;
    imagesSizeBadge.textContent = `${formatBytes(totalBytes)} total`;

    let html = '';
    imagesState.images.forEach((img, idx) => {
      html += `
        <div class="image-card" data-id="${img.id}">
          <div class="image-page-badge">Page ${idx + 1}</div>
          <div class="image-thumb-wrapper">
            <img src="${img.dataUrl}" class="image-thumb" style="transform: rotate(${img.rotation}deg);" alt="${escapeHtml(img.name)}" loading="lazy">
          </div>
          <div class="image-card-meta">
            <div class="image-card-title" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
            <div class="image-card-details">${img.width} × ${img.height} &bull; ${formatBytes(img.size)}</div>
          </div>
          <div class="image-card-actions">
            <button type="button" class="btn-image-action btn-image-rotate" data-id="${img.id}" title="Rotate 90° Clockwise">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
            <button type="button" class="btn-image-action btn-image-prev" data-id="${img.id}" ${idx === 0 ? 'disabled style="opacity:0.3;cursor:default;"' : ''} title="Move Left / Earlier">
              ‹
            </button>
            <button type="button" class="btn-image-action btn-image-next" data-id="${img.id}" ${idx === total - 1 ? 'disabled style="opacity:0.3;cursor:default;"' : ''} title="Move Right / Later">
              ›
            </button>
            <button type="button" class="btn-image-action btn-image-delete" data-id="${img.id}" title="Remove image">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    imagesGrid.innerHTML = html;

    imagesGrid.querySelectorAll('.btn-image-rotate').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        rotateImage(btn.dataset.id, 90);
      });
    });

    imagesGrid.querySelectorAll('.btn-image-prev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveImage(btn.dataset.id, -1);
      });
    });

    imagesGrid.querySelectorAll('.btn-image-next').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveImage(btn.dataset.id, 1);
      });
    });

    imagesGrid.querySelectorAll('.btn-image-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage(btn.dataset.id);
      });
    });
  }

  function rotateImage(id, delta = 90) {
    const item = imagesState.images.find((x) => x.id === id);
    if (!item) return;
    item.rotation = (item.rotation + delta) % 360;
    const card = imagesGrid.querySelector(`.image-card[data-id="${id}"]`);
    if (card) {
      const img = card.querySelector('.image-thumb');
      if (img) img.style.transform = `rotate(${item.rotation}deg)`;
    }
  }

  function rotateAllImages(delta = 90) {
    imagesState.images.forEach((item) => {
      item.rotation = (item.rotation + delta) % 360;
    });
    renderImagesGrid();
  }

  function moveImage(id, direction) {
    const idx = imagesState.images.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= imagesState.images.length) return;
    const [moved] = imagesState.images.splice(idx, 1);
    imagesState.images.splice(targetIdx, 0, moved);
    renderImagesGrid();
  }

  function removeImage(id) {
    const idx = imagesState.images.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const [removed] = imagesState.images.splice(idx, 1);
    if (removed && removed.dataUrl) {
      URL.revokeObjectURL(removed.dataUrl);
    }
    renderImagesGrid();
  }

  function clearAllImages() {
    imagesState.images.forEach((item) => {
      if (item.dataUrl) URL.revokeObjectURL(item.dataUrl);
    });
    imagesState.images = [];
    renderImagesGrid();
  }

  async function executeImagesToPDF() {
    if (executeImagesBtn && executeImagesBtn.disabled) return;
    if (!imagesState.images || imagesState.images.length === 0) {
      alert('Please add at least one image to convert.');
      return;
    }

    imagesState.isCancelled = false;
    executeImagesBtn.disabled = true;
    imagesProgressContainer.classList.remove('hidden');
    imagesResultCard.classList.add('hidden');
    setImagesProgress(0, 'Preparing PDF document...');

    const offCanvas = document.createElement('canvas');
    const ctx = offCanvas.getContext('2d');

    try {
      const pdfDoc = await PDFLib.PDFDocument.create();
      const total = imagesState.images.length;

      for (let i = 0; i < total; i++) {
        if (imagesState.isCancelled) throw new Error('OPERATION_CANCELLED');

        const imgData = imagesState.images[i];
        setImagesProgress(
          Math.round((i / total) * 90),
          `Converting image ${i + 1} of ${total} (${imgData.name})...`
        );

        const img = new Image();
        img.src = imgData.dataUrl;
        await new Promise((resolve, reject) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Failed to load image: ${imgData.name}`));
        });

        const rot = (imgData.rotation || 0) % 360;
        const isQuarterTurn = (rot === 90 || rot === 270);
        const drawWidth = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
        const drawHeight = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

        offCanvas.width = drawWidth;
        offCanvas.height = drawHeight;
        ctx.clearRect(0, 0, drawWidth, drawHeight);

        ctx.save();
        ctx.translate(drawWidth / 2, drawHeight / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        ctx.restore();

        const isPng = imgData.type === 'image/png';
        const exportMime = isPng ? 'image/png' : 'image/jpeg';
        const exportQuality = isPng ? undefined : 0.92;

        const blob = await new Promise((resolve) => offCanvas.toBlob(resolve, exportMime, exportQuality));
        const arrayBuffer = await blob.arrayBuffer();

        let pdfImage;
        if (isPng) {
          try {
            pdfImage = await pdfDoc.embedPng(arrayBuffer);
          } catch (e) {
            const jpgBlob = await new Promise((resolve) => offCanvas.toBlob(resolve, 'image/jpeg', 0.92));
            const jpgBuf = await jpgBlob.arrayBuffer();
            pdfImage = await pdfDoc.embedJpg(jpgBuf);
          }
        } else {
          pdfImage = await pdfDoc.embedJpg(arrayBuffer);
        }

        let pageWidth, pageHeight;
        let imgX = 0, imgY = 0, imgW = pdfImage.width, imgH = pdfImage.height;

        const pageSize = imagesState.pageSize || 'fit';

        if (pageSize === 'fit') {
          pageWidth = pdfImage.width;
          pageHeight = pdfImage.height;
          imgX = 0;
          imgY = 0;
          imgW = pageWidth;
          imgH = pageHeight;
        } else {
          let baseW = pageSize === 'letter' ? 612 : 595.28;
          let baseH = pageSize === 'letter' ? 792 : 841.89;

          const orientation = imagesState.orientation || 'auto';
          let isLandscape = false;
          if (orientation === 'auto') {
            isLandscape = pdfImage.width > pdfImage.height;
          } else if (orientation === 'landscape') {
            isLandscape = true;
          } else {
            isLandscape = false;
          }

          pageWidth = isLandscape ? Math.max(baseW, baseH) : Math.min(baseW, baseH);
          pageHeight = isLandscape ? Math.min(baseW, baseH) : Math.max(baseW, baseH);

          let marginPt = 0;
          if (imagesState.margin === 'small') marginPt = 28.35;
          else if (imagesState.margin === 'normal') marginPt = 56.7;

          const availW = Math.max(10, pageWidth - 2 * marginPt);
          const availH = Math.max(10, pageHeight - 2 * marginPt);

          const fitMode = imagesState.fit || 'contain';
          if (fitMode === 'contain') {
            const scale = Math.min(availW / pdfImage.width, availH / pdfImage.height);
            imgW = pdfImage.width * scale;
            imgH = pdfImage.height * scale;
            imgX = marginPt + (availW - imgW) / 2;
            imgY = marginPt + (availH - imgH) / 2;
          } else {
            const scale = Math.max(availW / pdfImage.width, availH / pdfImage.height);
            imgW = pdfImage.width * scale;
            imgH = pdfImage.height * scale;
            imgX = marginPt + (availW - imgW) / 2;
            imgY = marginPt + (availH - imgH) / 2;
          }
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(pdfImage, {
          x: imgX,
          y: imgY,
          width: imgW,
          height: imgH,
        });
      }

      if (imagesState.isCancelled) throw new Error('OPERATION_CANCELLED');

      setImagesProgress(95, 'Packaging PDF document...');
      const pdfBytes = await pdfDoc.save({ useObjectStreams: true });

      if (imagesState.outputUrl) {
        URL.revokeObjectURL(imagesState.outputUrl);
      }

      imagesState.outputBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      imagesState.outputUrl = URL.createObjectURL(imagesState.outputBlob);

      setImagesProgress(100, 'Complete!');

      let filename = (imagesOutputFilename ? imagesOutputFilename.value.trim() : 'converted_images') || 'converted_images';
      if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

      imagesDownloadBtn.href = imagesState.outputUrl;
      imagesDownloadBtn.download = filename;
      imagesResultSummary.textContent = `Successfully converted ${total} image${total > 1 ? 's' : ''} into a ${formatBytes(pdfBytes.length)} PDF document.`;

      if (imagesShareBtn && typeof navigator !== 'undefined' && navigator.share) imagesShareBtn.classList.remove('hidden');
      imagesResultCard.classList.remove('hidden');
      imagesResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      trackToolUsage('images_to_pdf');
    } catch (err) {
      if (err.message === 'OPERATION_CANCELLED') {
        setImagesProgress(0, 'Conversion cancelled.');
        return;
      }
      console.error('Error converting images to PDF:', err);
      alert('Failed to convert images: ' + (err.message || 'Unknown error'));
    } finally {
      offCanvas.width = 0;
      offCanvas.height = 0;
      imagesState.isCancelled = false;
      executeImagesBtn.disabled = false;
      setTimeout(() => {
        imagesProgressContainer.classList.add('hidden');
      }, 800);
    }
  }

  function setImagesProgress(percent, text) {
    imagesProgressBar.style.width = `${percent}%`;
    imagesProgressPercent.textContent = `${percent}%`;
    imagesProgressText.textContent = text;
  }

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function initEvents() {
    // Navigation Tabs
    tabMergeBtn.addEventListener('click', () => switchTab('merge'));
    tabRemoveBtn.addEventListener('click', () => switchTab('remove'));
    tabSlidesBtn.addEventListener('click', () => switchTab('slides'));

    // --- Merge Tab Events ---
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleMergeFilesAdded(e.target.files);
        fileInput.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleMergeFilesAdded(e.dataTransfer.files);
      }
    });

    // Window drag-and-drop for Merge tab
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const isMergeActive = !mergeTabView.classList.contains('hidden');
      if (isMergeActive && e.target !== dropzone && !dropzone.contains(e.target)) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleMergeFilesAdded(e.dataTransfer.files);
        }
      }
    });

    addMoreBtn.addEventListener('click', () => fileInput.click());
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to remove all files?')) {
        clearAllMergeFiles();
      }
    });

    sortSelect.addEventListener('change', (e) => applySorting(e.target.value));
    autoSortCheckbox.addEventListener('change', (e) => {
      mergeState.autoSort = e.target.checked;
    });

    mergeBtn.addEventListener('click', mergePdfs);
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        handleSharePdf(mergeState.mergedBlob, downloadBtn.download || 'merged-document.pdf');
      });
    }
    previewBtn.addEventListener('click', () => {
      if (mergeState.mergedUrl) {
        window.open(mergeState.mergedUrl, '_blank');
      }
    });

    // --- Remove Pages Tab Events ---
    removeDropzone.addEventListener('click', () => removeFileInput.click());
    removeDropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeFileInput.click(); } });
    removeFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleRemoveFileSelected(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      removeDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      removeDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeDropzone.classList.remove('drag-active');
      });
    });

    removeDropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleRemoveFileSelected(e.dataTransfer.files[0]);
      }
    });

    removeChangeFileBtn.addEventListener('click', resetRemoveWorkspace);
    pagesToDeleteInput.addEventListener('input', handlePageInputChange);
    btnSelectOdd.addEventListener('click', selectOddPages);
    btnSelectEven.addEventListener('click', selectEvenPages);
    btnInvertSelect.addEventListener('click', invertSelection);
    btnClearSelect.addEventListener('click', clearPageSelection);
    executeRemoveBtn.addEventListener('click', executeRemovePages);
    if (removeShareBtn) {
      removeShareBtn.addEventListener('click', () => {
        handleSharePdf(removeState.outputBlob, removeDownloadBtn.download || 'document_pages_removed.pdf');
      });
    }
    removePreviewBtn.addEventListener('click', () => {
      if (removeState.outputUrl) {
        window.open(removeState.outputUrl, '_blank');
      }
    });

    // --- Slides to A4 Tab Events ---
    slidesDropzone.addEventListener('click', () => slidesFileInput.click());
    slidesDropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slidesFileInput.click(); } });
    slidesFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSlidesFileSelected(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      slidesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        slidesDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      slidesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        slidesDropzone.classList.remove('drag-active');
      });
    });

    slidesDropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleSlidesFileSelected(e.dataTransfer.files[0]);
      }
    });

    slidesChangeFileBtn.addEventListener('click', resetSlidesWorkspace);
    slidesPerLayoutSelect.addEventListener('change', (e) => {
      slidesState.layout = e.target.value;
      updateSlidesCalculation();
      renderA4SheetPreview();
    });
    if (marginSelect) {
      marginSelect.addEventListener('change', (e) => {
        slidesState.margin = e.target.value;
        renderA4SheetPreview();
      });
    }
    slideBorderCheckbox.addEventListener('change', (e) => {
      slidesState.slideBorder = e.target.checked;
      renderA4SheetPreview();
    });
    slideNumbersCheckbox.addEventListener('change', (e) => {
      slidesState.slideNumbers = e.target.checked;
      renderA4SheetPreview();
    });
    executeSlidesBtn.addEventListener('click', executeGenerateSlidesA4);
    if (slidesShareBtn) {
      slidesShareBtn.addEventListener('click', () => {
        handleSharePdf(slidesState.outputBlob, slidesDownloadBtn.download || 'presentation_A4_handout.pdf');
      });
    }
    slidesPreviewBtn.addEventListener('click', () => {
      if (slidesState.outputUrl) {
        window.open(slidesState.outputUrl, '_blank');
      }
    });

    // --- Invert Colors Tab Events ---
    if (tabInvertBtn) {
      tabInvertBtn.addEventListener('click', () => switchTab('invert'));
    }
    if (invertDropzone) {
      invertDropzone.addEventListener('click', () => invertFileInput.click());
      invertDropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); invertFileInput.click(); } });
      ['dragenter', 'dragover'].forEach((eventName) => {
        invertDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          invertDropzone.classList.add('drag-active');
        });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        invertDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          invertDropzone.classList.remove('drag-active');
        });
      });
      invertDropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleInvertFileSelected(e.dataTransfer.files[0]);
        }
      });
    }

    if (invertFileInput) {
      invertFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleInvertFileSelected(e.target.files[0]);
        }
      });
    }

    if (invertChangeFileBtn) {
      invertChangeFileBtn.addEventListener('click', resetInvertWorkspace);
    }

    if (invertModeSelect) {
      invertModeSelect.addEventListener('change', (e) => {
        invertState.mode = e.target.value;
        const matchingCard = document.querySelector(`#invertWorkspace .preset-choice-card[data-mode="${e.target.value}"]`);
        if (matchingCard) {
          document.querySelectorAll('#invertWorkspace .preset-choice-card').forEach((c) => c.classList.remove('active'));
          matchingCard.classList.add('active');
          const radio = matchingCard.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
        }
        updateInvertedPreviewCanvas();
        updateInvertHint();
      });
    }

    // Tab 4 Visual Mode Choice Cards
    const invertChoiceCards = document.querySelectorAll('#invertWorkspace .preset-choice-card');
    invertChoiceCards.forEach((card) => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        if (!mode) return;
        invertState.mode = mode;
        invertChoiceCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        if (invertModeSelect) invertModeSelect.value = mode;
        updateInvertHint();
        updateInvertedPreviewCanvas();
      });
    });

    // Tab 4 Preview Mode Toggle (Original vs Inverted)
    if (btnShowOriginal) {
      btnShowOriginal.addEventListener('click', () => {
        btnShowOriginal.classList.add('active');
        if (btnShowInverted) btnShowInverted.classList.remove('active');
        refreshInvertDisplay();
      });
    }
    if (btnShowInverted) {
      btnShowInverted.addEventListener('click', () => {
        btnShowInverted.classList.add('active');
        if (btnShowOriginal) btnShowOriginal.classList.remove('active');
        refreshInvertDisplay();
      });
    }

    if (invertQualitySelect) {
      invertQualitySelect.addEventListener('change', (e) => {
        invertState.quality = e.target.value;
      });
    }

    if (invertPagesSelect) {
      invertPagesSelect.addEventListener('change', (e) => {
        invertState.pagesMode = e.target.value;
        if (e.target.value === 'custom') {
          invertCustomRangeGroup.classList.remove('hidden');
        } else {
          invertCustomRangeGroup.classList.add('hidden');
        }
      });
    }

    if (invertCustomPagesInput) {
      invertCustomPagesInput.addEventListener('input', (e) => {
        invertState.customPages = e.target.value;
      });
    }

    if (invertPrevPageBtn) {
      invertPrevPageBtn.addEventListener('click', () => {
        if (invertState.previewPageNum > 1) {
          invertState.previewPageNum--;
          updateInvertNavButtons();
          renderInvertComparisonPreview();
        }
      });
    }

    if (invertNextPageBtn) {
      invertNextPageBtn.addEventListener('click', () => {
        if (invertState.previewPageNum < invertState.totalPages) {
          invertState.previewPageNum++;
          updateInvertNavButtons();
          renderInvertComparisonPreview();
        }
      });
    }

    if (executeInvertBtn) {
      executeInvertBtn.addEventListener('click', executeInvertPdf);
    }

    if (invertShareBtn) {
      invertShareBtn.addEventListener('click', () => {
        handleSharePdf(invertState.outputBlob, invertDownloadBtn.download || 'document_inverted.pdf');
      });
    }
    if (invertPreviewBtn) {
      invertPreviewBtn.addEventListener('click', () => {
        if (invertState.outputUrl) {
          window.open(invertState.outputUrl, '_blank');
        }
      });
    }

    // --- Compress PDF Tab Events ---
    if (tabCompressBtn) {
      tabCompressBtn.addEventListener('click', () => switchTab('compress'));
    }

    if (compressDropzone) {
      compressDropzone.addEventListener('click', () => compressFileInput.click());
      compressDropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); compressFileInput.click(); } });
      ['dragenter', 'dragover'].forEach((eventName) => {
        compressDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          compressDropzone.classList.add('drag-active');
        });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        compressDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          compressDropzone.classList.remove('drag-active');
        });
      });
      compressDropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleCompressFileSelected(e.dataTransfer.files[0]);
        }
      });
    }

    if (compressFileInput) {
      compressFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleCompressFileSelected(e.target.files[0]);
        }
      });
    }

    if (compressChangeFileBtn) {
      compressChangeFileBtn.addEventListener('click', resetCompressWorkspace);
    }

    const compressChoiceCardsList = document.querySelectorAll('#compressWorkspaceSection .preset-choice-card, .compress-preset-card');
    compressChoiceCardsList.forEach((card) => {
      card.addEventListener('click', () => {
        const radio = card.querySelector('input[type="radio"]');
        const preset = (radio && radio.value) || card.dataset.preset;
        if (preset) {
          compressState.preset = preset;
          updateCompressHintAndPresetUI();
          renderCompressComparisonPreview();
        }
      });
    });

    // Cross-Tool Quick Actions (Merge -> Compress, Slides -> Invert)
    if (mergeSendToCompressBtn) {
      mergeSendToCompressBtn.addEventListener('click', () => {
        if (!mergeState.mergedBlob) return;
        let baseName = outputFilenameInput.value.trim() || 'merged-document';
        if (!baseName.toLowerCase().endsWith('.pdf')) baseName += '.pdf';
        const file = new File([mergeState.mergedBlob], baseName, {
          type: 'application/pdf',
          lastModified: Date.now(),
        });
        switchTab('compress');
        handleCompressFileSelected(file);
      });
    }

    if (slidesSendToInvertBtn) {
      slidesSendToInvertBtn.addEventListener('click', () => {
        if (!slidesState.outputBlob) return;
        let baseName = (slidesOutputFilename ? slidesOutputFilename.value.trim() : 'slides_handout') || 'slides_handout';
        if (!baseName.toLowerCase().endsWith('.pdf')) baseName += '.pdf';
        const file = new File([slidesState.outputBlob], baseName, {
          type: 'application/pdf',
          lastModified: Date.now(),
        });
        switchTab('invert');
        handleInvertFileSelected(file);
      });
    }

    if (compressPrevPageBtn) {
      compressPrevPageBtn.addEventListener('click', () => {
        if (compressState.previewPageNum > 1) {
          compressState.previewPageNum--;
          renderCompressComparisonPreview();
        }
      });
    }

    if (compressNextPageBtn) {
      compressNextPageBtn.addEventListener('click', () => {
        if (compressState.previewPageNum < compressState.totalPages) {
          compressState.previewPageNum++;
          renderCompressComparisonPreview();
        }
      });
    }

    if (executeCompressBtn) {
      executeCompressBtn.addEventListener('click', executeCompressPDF);
    }

    if (compressShareBtn) {
      compressShareBtn.addEventListener('click', () => {
        handleSharePdf(compressState.outputBlob, compressDownloadBtn.download || 'document_compressed.pdf');
      });
    }
    if (compressPreviewBtn) {
      compressPreviewBtn.addEventListener('click', () => {
        if (compressState.outputUrl) {
          window.open(compressState.outputUrl, '_blank');
        }
      });
    }

    // --- Task Cancellation Handlers ---
    if (mergeCancelBtn) {
      mergeCancelBtn.addEventListener('click', () => {
        mergeState.isCancelled = true;
        setMergeProgress(0, 'Cancelling merge...');
      });
    }

    if (removeCancelBtn) {
      removeCancelBtn.addEventListener('click', () => {
        removeState.isCancelled = true;
        setRemoveProgress(0, 'Cancelling page removal...');
      });
    }

    if (slidesCancelBtn) {
      slidesCancelBtn.addEventListener('click', () => {
        slidesState.isCancelled = true;
        setSlidesProgress(0, 'Cancelling handout generation...');
      });
    }

    if (invertCancelBtn) {
      invertCancelBtn.addEventListener('click', () => {
        invertState.isCancelled = true;
        setInvertProgress(0, 'Cancelling color inversion...');
      });
    }

    if (compressCancelBtn) {
      compressCancelBtn.addEventListener('click', () => {
        compressState.isCancelled = true;
        setCompressProgress(0, 'Cancelling compression...');
      });
    }

    // --- Tab 6: Image to PDF Events ---
    if (tabImagesBtn) {
      tabImagesBtn.addEventListener('click', () => switchTab('images'));
    }

    if (imagesDropzone) {
      imagesDropzone.addEventListener('click', () => imagesFileInput.click());
      imagesDropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); imagesFileInput.click(); } });
      ['dragenter', 'dragover'].forEach((eventName) => {
        imagesDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          imagesDropzone.classList.add('drag-active');
        });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        imagesDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          imagesDropzone.classList.remove('drag-active');
        });
      });
      imagesDropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleImageFilesAdded(e.dataTransfer.files);
        }
      });
    }

    if (imagesFileInput) {
      imagesFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleImageFilesAdded(e.target.files);
          imagesFileInput.value = '';
        }
      });
    }

    if (imagesAddMoreBtn) {
      imagesAddMoreBtn.addEventListener('click', () => imagesFileInput.click());
    }

    if (imagesClearAllBtn) {
      imagesClearAllBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to remove all images?')) {
          clearAllImages();
        }
      });
    }

    if (imagesRotateAllBtn) {
      imagesRotateAllBtn.addEventListener('click', () => rotateAllImages(90));
    }

    // Page Size Presets for Images
    const pageSizeCardsList = document.querySelectorAll('#imagesPageSizeGrid .preset-choice-card');
    pageSizeCardsList.forEach((card) => {
      card.addEventListener('click', () => {
        const size = card.dataset.pageSize;
        if (!size) return;
        imagesState.pageSize = size;
        pageSizeCardsList.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });

    if (imagesOrientationSelect) {
      imagesOrientationSelect.addEventListener('change', (e) => {
        imagesState.orientation = e.target.value;
      });
    }

    if (imagesMarginSelect) {
      imagesMarginSelect.addEventListener('change', (e) => {
        imagesState.margin = e.target.value;
      });
    }

    if (imagesFitSelect) {
      imagesFitSelect.addEventListener('change', (e) => {
        imagesState.fit = e.target.value;
      });
    }

    if (executeImagesBtn) {
      executeImagesBtn.addEventListener('click', executeImagesToPDF);
    }

    if (imagesShareBtn) {
      imagesShareBtn.addEventListener('click', () => {
        handleSharePdf(imagesState.outputBlob, imagesDownloadBtn.download || 'converted_images.pdf');
      });
    }
    if (imagesPreviewBtn) {
      imagesPreviewBtn.addEventListener('click', () => {
        if (imagesState.outputUrl) {
          window.open(imagesState.outputUrl, '_blank');
        }
      });
    }

    if (imagesCancelBtn) {
      imagesCancelBtn.addEventListener('click', () => {
        imagesState.isCancelled = true;
        setImagesProgress(0, 'Cancelling image conversion...');
      });
    }

    // Cross-Tool Flow: Images -> Compress
    if (imagesSendToCompressBtn) {
      imagesSendToCompressBtn.addEventListener('click', () => {
        if (!imagesState.outputBlob) return;
        let baseName = (imagesOutputFilename ? imagesOutputFilename.value.trim() : 'converted_images') || 'converted_images';
        if (!baseName.toLowerCase().endsWith('.pdf')) baseName += '.pdf';
        const file = new File([imagesState.outputBlob], baseName, {
          type: 'application/pdf',
          lastModified: Date.now(),
        });
        switchTab('compress');
        handleCompressFileSelected(file);
      });
    }

    // SortableJS instance for Image Cards Grid
    if (window.Sortable && imagesGrid) {
      new Sortable(imagesGrid, {
        animation: 200,
        handle: '.image-card',
        ghostClass: 'sortable-ghost',
        filter: '.btn-image-action',
        preventOnFilter: false,
        delay: 150,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        onEnd: (evt) => {
          if (evt.oldIndex !== evt.newIndex) {
            const [moved] = imagesState.images.splice(evt.oldIndex, 1);
            imagesState.images.splice(evt.newIndex, 0, moved);
            renderImagesGrid();
          }
        },
      });
    }
  }

  // ==========================================
  // MOBILE PWA INSTALL PROMPT
  // ==========================================
  function initPWAInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    const installBtn = document.getElementById('pwaInstallBtn');
    const dismissBtn = document.getElementById('pwaDismissBtn');
    if (!banner || !installBtn || !dismissBtn) return;

    let deferredPrompt = null;
    const dismissedTime = localStorage.getItem('pdf_pwa_banner_dismissed');
    const isDismissedRecently = dismissedTime && (Date.now() - parseInt(dismissedTime, 10) < 7 * 24 * 60 * 60 * 1000);

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!isDismissedRecently) {
        banner.classList.remove('hidden');
      }
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      banner.classList.add('hidden');
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('pdf_pwa_installed', 'true');
      }
      deferredPrompt = null;
    });

    dismissBtn.addEventListener('click', () => {
      banner.classList.add('hidden');
      localStorage.setItem('pdf_pwa_banner_dismissed', Date.now().toString());
    });
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================
  function init() {
    if (!document.getElementById('mergeTabView')) {
      // DOM elements not present (e.g. running inside headless unit tests)
      return;
    }
    initTheme();
    setDefaultOutputFilename();
    initEvents();
    initPWAInstallBanner();

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
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
