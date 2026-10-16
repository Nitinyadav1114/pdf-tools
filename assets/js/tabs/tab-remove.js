/**
 * Tab 2: Remove Pages Logic
 * Interactive visual grid thumbnail browser, page selector, and PDF page remover.
 */

import { removeState } from '../core/state.js';
import { elements } from '../core/dom.js';
import {
  formatBytes,
  formatPageSet,
  parsePageInput,
  validatePageInput,
  isPasswordProtectedError,
  handleSharePdf,
  trackToolUsage
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';

const MAX_CONCURRENT_THUMBNAILS = 3;

export async function handleRemoveFileSelected(file) {
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
  if (elements.removeResultCard) elements.removeResultCard.classList.add('hidden');
  if (elements.removeProgressContainer) elements.removeProgressContainer.classList.add('hidden');

  if (elements.removeFileName) elements.removeFileName.textContent = file.name;
  if (elements.removeFileSubtext) elements.removeFileSubtext.textContent = `Loading pages • ${formatBytes(file.size)}...`;

  const baseName = file.name.replace(/\.pdf$/i, '');
  if (elements.removeOutputFilename) elements.removeOutputFilename.value = `${baseName}_pages_removed`;

  if (elements.removeDropzoneSection) elements.removeDropzoneSection.classList.add('hidden');
  if (elements.removeWorkspace) elements.removeWorkspace.classList.remove('hidden');

  try {
    removeState.arrayBuffer = await file.arrayBuffer();

    if (window.PDFLib) {
      const srcDoc = await PDFLib.PDFDocument.load(removeState.arrayBuffer, { ignoreEncryption: true });
      removeState.totalPages = srcDoc.getPageCount();
    }

    if (removeState.totalPages === 0) {
      throw new Error('Document contains no pages or could not be read.');
    }

    if (elements.removeFileSubtext) {
      elements.removeFileSubtext.textContent = `${removeState.totalPages} ${removeState.totalPages === 1 ? 'page' : 'pages'} total • ${formatBytes(file.size)}`;
    }

    renderPagesGrid();
    updateRemoveSummary();

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

export function resetRemoveWorkspace() {
  if (removeState.observer) {
    removeState.observer.disconnect();
    removeState.observer = null;
  }
  removeState.thumbnailQueue = [];
  removeState.renderedPages.clear();
  removeState.activeThumbnailWorkers = 0;

  if (elements.pagesGrid) {
    const existingCanvases = elements.pagesGrid.querySelectorAll('canvas');
    existingCanvases.forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    elements.pagesGrid.innerHTML = '';
  }

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

  if (elements.removeFileInput) elements.removeFileInput.value = '';
  if (elements.pagesToDeleteInput) elements.pagesToDeleteInput.value = '';
  if (elements.removeWorkspace) elements.removeWorkspace.classList.add('hidden');
  if (elements.removeDropzoneSection) elements.removeDropzoneSection.classList.remove('hidden');
  if (elements.removeResultCard) elements.removeResultCard.classList.add('hidden');
}

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

export function renderPagesGrid() {
  if (!elements.pagesGrid) return;
  if (removeState.observer) {
    removeState.observer.disconnect();
    removeState.observer = null;
  }
  removeState.renderedPages.clear();
  removeState.thumbnailQueue = [];
  removeState.activeThumbnailWorkers = 0;

  elements.pagesGrid.innerHTML = '';

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

    elements.pagesGrid.appendChild(card);

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

    const card = canvas.closest('.page-card');
    if (card) {
      const fallback = card.querySelector('.page-fallback-label');
      if (fallback) fallback.style.display = 'none';
    }
  } catch (err) {
    console.warn(`Could not render thumbnail for page ${pageNum}:`, err);
  }
}

export function togglePageSelection(pageNum) {
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
  if (!elements.pagesGrid) return;
  const cards = elements.pagesGrid.querySelectorAll('.page-card');
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
  if (elements.pagesToDeleteInput) {
    elements.pagesToDeleteInput.value = formatPageSet(removeState.selectedPages);
  }
}

export function updateRemoveSummary() {
  if (!elements.removeSummaryText) return;
  const total = removeState.totalPages;
  const delCount = removeState.selectedPages.size;
  const keepCount = total - delCount;

  if (delCount === 0) {
    elements.removeSummaryText.innerHTML = `No pages selected for deletion yet. Click any page card below or type page numbers (e.g. <code>1, 2, 7, 8</code>).`;
  } else if (keepCount === 0) {
    elements.removeSummaryText.innerHTML = `<span class="delete-tag">⚠️ All ${total} pages are selected for deletion! You must keep at least 1 page.</span>`;
  } else {
    const delListStr = formatPageSet(removeState.selectedPages);
    elements.removeSummaryText.innerHTML = `
      <span class="delete-tag">🗑️ ${delCount} ${delCount === 1 ? 'page' : 'pages'} to delete (${delListStr})</span>
      <span class="dot-separator">•</span>
      <span class="keep-tag">📄 ${keepCount} ${keepCount === 1 ? 'page' : 'pages'} will remain in output</span>
    `;
  }
}

export function handlePageInputChange() {
  if (!elements.pagesToDeleteInput) return;
  const inputVal = elements.pagesToDeleteInput.value;
  removeState.selectedPages = parsePageInput(inputVal, removeState.totalPages);
  const val = validatePageInput(inputVal, removeState.totalPages);
  if (val.outOfBounds.length > 0) {
    elements.pagesToDeleteInput.style.borderColor = 'var(--danger)';
    elements.pagesToDeleteInput.title = `Pages ${val.outOfBounds.join(', ')} exceed total pages (${removeState.totalPages})`;
  } else {
    elements.pagesToDeleteInput.style.borderColor = '';
    elements.pagesToDeleteInput.title = '';
  }
  updateGridCardStyles();
  updateRemoveSummary();
}

export function selectOddPages() {
  removeState.selectedPages.clear();
  for (let p = 1; p <= removeState.totalPages; p += 2) {
    removeState.selectedPages.add(p);
  }
  syncSelectionToInput();
  updateGridCardStyles();
  updateRemoveSummary();
}

export function selectEvenPages() {
  removeState.selectedPages.clear();
  for (let p = 2; p <= removeState.totalPages; p += 2) {
    removeState.selectedPages.add(p);
  }
  syncSelectionToInput();
  updateGridCardStyles();
  updateRemoveSummary();
}

export function invertSelection() {
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

export function clearPageSelection() {
  removeState.selectedPages.clear();
  syncSelectionToInput();
  updateGridCardStyles();
  updateRemoveSummary();
}

export async function executeRemovePages() {
  if (elements.executeRemoveBtn && elements.executeRemoveBtn.disabled) return;
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

  elements.executeRemoveBtn.disabled = true;
  removeState.isCancelled = false;
  if (elements.removeProgressContainer) elements.removeProgressContainer.classList.remove('hidden');
  if (elements.removeResultCard) elements.removeResultCard.classList.add('hidden');
  setRemoveProgress(10, 'Reading PDF document...');

  try {
    if (removeState.isCancelled) throw new Error('OPERATION_CANCELLED');

    const { PDFDocument } = window.PDFLib;
    setRemoveProgress(30, 'Extracting unselected pages...');

    const srcDoc = await PDFDocument.load(removeState.arrayBuffer, { ignoreEncryption: true });
    if (removeState.isCancelled) throw new Error('OPERATION_CANCELLED');

    const newDoc = await PDFDocument.create();

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

    let rawFilename = (elements.removeOutputFilename ? elements.removeOutputFilename.value.trim() : '') || 'document_pages_removed';
    if (!rawFilename.toLowerCase().endsWith('.pdf')) {
      rawFilename += '.pdf';
    }
    if (elements.removeDownloadBtn) {
      elements.removeDownloadBtn.href = removeState.outputUrl;
      elements.removeDownloadBtn.download = rawFilename;
    }

    const deletedCount = removeState.selectedPages.size;
    const keptCount = keptPages.length;
    if (elements.removeResultSummary) {
      elements.removeResultSummary.textContent = `Deleted ${deletedCount} ${deletedCount === 1 ? 'page' : 'pages'}. New PDF contains ${keptCount} ${keptCount === 1 ? 'page' : 'pages'} (${formatBytes(removeState.outputBlob.size)}).`;
    }
    if (elements.removeShareBtn && typeof navigator !== 'undefined' && navigator.share) {
      elements.removeShareBtn.classList.remove('hidden');
    }
    if (elements.removeResultCard) {
      elements.removeResultCard.classList.remove('hidden');
      elements.removeResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
    if (elements.executeRemoveBtn) elements.executeRemoveBtn.disabled = false;
    setTimeout(() => {
      if (elements.removeProgressContainer) elements.removeProgressContainer.classList.add('hidden');
    }, 800);
  }
}

function setRemoveProgress(percent, text) {
  if (elements.removeProgressBar) elements.removeProgressBar.style.width = `${percent}%`;
  if (elements.removeProgressPercent) elements.removeProgressPercent.textContent = `${percent}%`;
  if (elements.removeProgressText) elements.removeProgressText.textContent = text;
}

export function initRemoveTab() {
  const {
    removeDropzone,
    removeFileInput,
    pagesToDeleteInput,
    btnSelectOdd,
    btnSelectEven,
    btnInvertSelect,
    btnClearSelect,
    removeChangeFileBtn,
    executeRemoveBtn,
    removeCancelBtn,
    removeShareBtn,
    removePreviewBtn,
    removeDownloadBtn
  } = elements;

  if (removeDropzone && removeFileInput) {
    removeDropzone.addEventListener('click', () => removeFileInput.click());
    removeDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        removeFileInput.click();
      }
    });
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
  }

  if (pagesToDeleteInput) pagesToDeleteInput.addEventListener('input', handlePageInputChange);
  if (btnSelectOdd) btnSelectOdd.addEventListener('click', selectOddPages);
  if (btnSelectEven) btnSelectEven.addEventListener('click', selectEvenPages);
  if (btnInvertSelect) btnInvertSelect.addEventListener('click', invertSelection);
  if (btnClearSelect) btnClearSelect.addEventListener('click', clearPageSelection);
  if (removeChangeFileBtn) removeChangeFileBtn.addEventListener('click', resetRemoveWorkspace);
  if (executeRemoveBtn) executeRemoveBtn.addEventListener('click', executeRemovePages);

  if (removeCancelBtn) {
    removeCancelBtn.addEventListener('click', () => {
      removeState.isCancelled = true;
      setRemoveProgress(0, 'Cancelling page removal...');
    });
  }

  if (removeShareBtn) {
    removeShareBtn.addEventListener('click', () => {
      handleSharePdf(removeState.outputBlob, (removeDownloadBtn && removeDownloadBtn.download) || 'document_pages_removed.pdf');
    });
  }

  if (removePreviewBtn) {
    removePreviewBtn.addEventListener('click', () => {
      if (removeState.outputUrl) {
        window.open(removeState.outputUrl, '_blank');
      }
    });
  }
}
