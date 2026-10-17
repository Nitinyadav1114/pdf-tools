/**
 * Tab 1: Merge PDFs Controller
 * Handles file queueing, metadata parsing, SortableJS reordering, and PDF merging.
 */

import { mergeState } from '../core/state.js';
import { elements } from '../core/dom.js';
import {
  formatBytes,
  formatTimestamp,
  escapeHtml,
  isPasswordProtectedError,
  handleSharePdf,
  trackToolUsage
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';

let sortableInstance = null;

export function setDefaultOutputFilename() {
  if (!elements.outputFilenameInput) return;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  elements.outputFilenameInput.value = `merged_${yyyy}-${mm}-${dd}`;
}

export async function handleMergeFilesAdded(fileList) {
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

  if (elements.resultCard) elements.resultCard.classList.add('hidden');

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

  if (mergeState.autoSort && elements.sortSelect) {
    applySorting(elements.sortSelect.value);
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

export function applySorting(mode) {
  mergeState.sortMode = mode;
  if (elements.sortSelect) elements.sortSelect.value = mode;

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
  if (!elements.fileListEl) return;
  const domIds = Array.from(elements.fileListEl.children).map((card) => card.dataset.id);
  mergeState.files.sort((a, b) => domIds.indexOf(a.id) - domIds.indexOf(b.id));
  mergeState.sortMode = 'custom';
  if (elements.sortSelect) elements.sortSelect.value = 'custom';
  updateMergeIndices();
}

function moveMergeItem(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= mergeState.files.length) return;

  const [movedItem] = mergeState.files.splice(index, 1);
  mergeState.files.splice(targetIndex, 0, movedItem);

  mergeState.sortMode = 'custom';
  if (elements.sortSelect) elements.sortSelect.value = 'custom';
  renderMergeFileList();
}

function removeMergeItem(id) {
  mergeState.files = mergeState.files.filter((item) => item.id !== id);
  if (mergeState.files.length === 0) {
    if (elements.manageSection) elements.manageSection.classList.add('hidden');
    if (elements.resultCard) elements.resultCard.classList.add('hidden');
  } else {
    renderMergeFileList();
  }
}

export function clearAllMergeFiles() {
  if (mergeState.files.length === 0) return;
  mergeState.files = [];
  if (elements.manageSection) elements.manageSection.classList.add('hidden');
  if (elements.resultCard) elements.resultCard.classList.add('hidden');
  if (mergeState.mergedUrl) {
    URL.revokeObjectURL(mergeState.mergedUrl);
    mergeState.mergedUrl = null;
    mergeState.mergedBlob = null;
  }
  if (elements.fileInput) elements.fileInput.value = '';
}

export function renderMergeFileList() {
  if (!elements.fileListEl) return;
  if (mergeState.files.length === 0) {
    if (elements.manageSection) elements.manageSection.classList.add('hidden');
    return;
  }

  if (elements.manageSection) elements.manageSection.classList.remove('hidden');
  elements.fileListEl.innerHTML = '';

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

    elements.fileListEl.appendChild(card);
  });

  updateMergeIndices();
  updateMergeSummaryStats();
}

function updateMergeIndices() {
  if (!elements.fileListEl) return;
  const cards = elements.fileListEl.querySelectorAll('.file-card');
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
  if (elements.fileCountBadge) {
    elements.fileCountBadge.textContent = `${count} ${count === 1 ? 'file' : 'files'}`;
  }

  let totalPages = 0;
  let hasUnloaded = false;
  for (const f of mergeState.files) {
    if (typeof f.pageCount === 'number') {
      totalPages += f.pageCount;
    } else {
      hasUnloaded = true;
    }
  }

  if (elements.pageCountBadge) {
    if (hasUnloaded && totalPages === 0) {
      elements.pageCountBadge.textContent = 'Calculating pages...';
    } else {
      elements.pageCountBadge.textContent = `${totalPages} ${totalPages === 1 ? 'page' : 'pages'} total`;
    }
  }
}

export async function mergePdfs() {
  if (elements.mergeBtn && elements.mergeBtn.disabled) return;
  if (mergeState.files.length < 2) {
    alert('Please add at least 2 PDF files to merge.');
    return;
  }

  if (!window.PDFLib) {
    alert('PDF-Lib is not loaded. Please check your local files.');
    return;
  }

  elements.mergeBtn.disabled = true;
  mergeState.isCancelled = false;
  if (elements.progressContainer) elements.progressContainer.classList.remove('hidden');
  if (elements.resultCard) elements.resultCard.classList.add('hidden');
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
    const useObjectStreams = elements.mergeCompressToggle ? elements.mergeCompressToggle.checked : true;
    const mergedPdfBytes = await mergedPdf.save({ useObjectStreams });

    if (mergeState.mergedUrl) {
      URL.revokeObjectURL(mergeState.mergedUrl);
    }

    mergeState.mergedBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
    mergeState.mergedUrl = URL.createObjectURL(mergeState.mergedBlob);

    setMergeProgress(100, 'Complete!');

    let rawFilename = (elements.outputFilenameInput ? elements.outputFilenameInput.value.trim() : '') || 'merged-document';
    if (!rawFilename.toLowerCase().endsWith('.pdf')) {
      rawFilename += '.pdf';
    }
    if (elements.downloadBtn) {
      elements.downloadBtn.href = mergeState.mergedUrl;
      elements.downloadBtn.download = rawFilename;
    }

    if (elements.resultSummary) {
      elements.resultSummary.textContent = `Successfully merged ${totalFiles} files (${totalMergedPages} total pages • ${formatBytes(mergeState.mergedBlob.size)}).`;
    }
    if (elements.shareBtn && typeof navigator !== 'undefined' && navigator.share) {
      elements.shareBtn.classList.remove('hidden');
    }
    if (elements.resultCard) {
      elements.resultCard.classList.remove('hidden');
      elements.resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    trackToolUsage('merge_pdfs', 'used', totalFiles || mergeState.files.length);
  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setMergeProgress(0, 'Merge cancelled.');
      return;
    }
    console.error('Merge error:', err);
    alert('Failed to merge PDFs: ' + (err.message || 'Unknown error occurred'));
  } finally {
    mergeState.isCancelled = false;
    if (elements.mergeBtn) elements.mergeBtn.disabled = false;
    setTimeout(() => {
      if (elements.progressContainer) elements.progressContainer.classList.add('hidden');
    }, 800);
  }
}

function setMergeProgress(percent, text) {
  if (elements.progressBar) elements.progressBar.style.width = `${percent}%`;
  if (elements.progressPercent) elements.progressPercent.textContent = `${percent}%`;
  if (elements.progressText) elements.progressText.textContent = text;
}

export function initMergeTab(switchTab, handleCompressFileSelected) {
  const { dropzone, fileInput, addMoreBtn, clearAllBtn, sortSelect, autoSortCheckbox, mergeBtn, shareBtn, previewBtn, mergeCancelBtn, mergeSendToCompressBtn, downloadBtn, outputFilenameInput } = elements;

  if (window.Sortable && elements.fileListEl) {
    sortableInstance = new Sortable(elements.fileListEl, {
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

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
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

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const isMergeActive = elements.mergeTabView && !elements.mergeTabView.classList.contains('hidden');
      if (isMergeActive && e.target !== dropzone && !dropzone.contains(e.target)) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleMergeFilesAdded(e.dataTransfer.files);
        }
      }
    });
  }

  if (addMoreBtn && fileInput) addMoreBtn.addEventListener('click', () => fileInput.click());
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to remove all files?')) {
        clearAllMergeFiles();
      }
    });
  }

  if (sortSelect) sortSelect.addEventListener('change', (e) => applySorting(e.target.value));
  if (autoSortCheckbox) {
    autoSortCheckbox.addEventListener('change', (e) => {
      mergeState.autoSort = e.target.checked;
    });
  }

  if (mergeBtn) mergeBtn.addEventListener('click', mergePdfs);
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      handleSharePdf(mergeState.mergedBlob, (downloadBtn && downloadBtn.download) || 'merged-document.pdf');
    });
  }
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      if (mergeState.mergedUrl) {
        window.open(mergeState.mergedUrl, '_blank');
      }
    });
  }

  if (mergeCancelBtn) {
    mergeCancelBtn.addEventListener('click', () => {
      mergeState.isCancelled = true;
      setMergeProgress(0, 'Cancelling merge...');
    });
  }

  if (mergeSendToCompressBtn) {
    mergeSendToCompressBtn.addEventListener('click', () => {
      if (!mergeState.mergedBlob) return;
      let baseName = (outputFilenameInput ? outputFilenameInput.value.trim() : '') || 'merged-document';
      if (!baseName.toLowerCase().endsWith('.pdf')) baseName += '.pdf';
      const file = new File([mergeState.mergedBlob], baseName, {
        type: 'application/pdf',
        lastModified: Date.now(),
      });
      if (typeof switchTab === 'function') switchTab('compress');
      if (typeof handleCompressFileSelected === 'function') handleCompressFileSelected(file);
    });
  }
}
