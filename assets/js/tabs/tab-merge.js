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
  trackToolUsage,
  showToast
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';
import { ensureAllPdfEngines, ensurePdfLibLoaded } from '../core/engine-loader.js';

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
    showToast(`Security Warning: Excluded invalid or non-PDF files: [${invalidFiles.join(', ')}]`, 'error');
    return;
  } else if (invalidFiles.length > 0) {
    showToast(`Security Notice: Excluded invalid file(s): ${invalidFiles.join(', ')}`, 'info');
  }

  if (validPdfs.length === 0) {
    showToast('Please select valid PDF files.', 'warning');
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
  await ensureAllPdfEngines().catch(() => {});
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
          let pdfDoc = null;
          try {
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
            pdfDoc = await loadingTask.promise;
            if (item.pageCount === null) item.pageCount = pdfDoc.numPages;

            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            item.thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
            canvas.width = 0;
            canvas.height = 0;
          } catch (pe) {
            console.warn('PDF.js thumbnail warning:', pe);
          } finally {
            if (pdfDoc) pdfDoc.destroy().catch(() => {});
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

  const rangeBadge = card.querySelector('.page-range-pill');
  if (rangeBadge && item.pageCount) {
    rangeBadge.textContent = `Pages 1–${item.pageCount}`;
  }

  const thumbContainer = card.querySelector('.file-thumb-container');
  if (thumbContainer && item.thumbnailUrl) {
    thumbContainer.innerHTML = `<img src="${item.thumbnailUrl}" class="w-full h-full object-cover" alt="Page 1 preview">`;
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
    card.className = 'file-card reorder-card bg-surface-container-lowest/90 dark:bg-[#131b2e]/90 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-lg transition-all duration-200 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between group cursor-grab active:cursor-grabbing hover:-translate-y-1 relative';
    card.dataset.id = item.id;

    const formattedDate = formatTimestamp(item.lastModified);
    const sizeStr = formatBytes(item.size);
    const pageStr = item.pageCount !== null ? `${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'}` : 'Loading pages...';

    const thumbHtml = item.thumbnailUrl
      ? `<img src="${item.thumbnailUrl}" class="w-full h-full object-cover" alt="Page 1 preview">`
      : `<span class="material-symbols-outlined text-[24px]">picture_as_pdf</span>`;

    card.innerHTML = `
      <!-- Card Header Row -->
      <div class="flex items-start justify-between gap-2 mb-3">
        <div class="flex items-center gap-2">
          <span class="drag-handle text-slate-400 group-hover:text-primary-container dark:group-hover:text-indigo-400 transition-colors cursor-grab p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Drag to reorder" aria-label="Drag handle">
            <span class="material-symbols-outlined text-[20px]">drag_indicator</span>
          </span>
          <span class="index-pill w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-primary-container dark:text-indigo-300 text-xs font-bold flex items-center justify-center border border-indigo-100 dark:border-indigo-900/60 shadow-sm">${index + 1}</span>
        </div>
        <div class="card-header-actions file-actions flex items-center gap-1">
          <button class="btn-card-action btn-up w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Move Up" ${index === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
            <span class="material-symbols-outlined text-[16px]">expand_less</span>
          </button>
          <button class="btn-card-action btn-down w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Move Down" ${index === mergeState.files.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
            <span class="material-symbols-outlined text-[16px]">expand_more</span>
          </button>
          <button class="btn-card-action btn-delete w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors" title="Remove PDF">
            <span class="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>

      <!-- Card Body Row -->
      <div class="flex items-start gap-3 mb-4">
        <div class="file-thumb-container w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-primary-container dark:text-indigo-400 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200/60 dark:border-slate-700/60 shadow-inner">
          ${thumbHtml}
        </div>
        <div class="file-info flex flex-col min-w-0 flex-1 gap-0.5">
          <span class="file-name font-bold text-sm text-on-surface dark:text-white truncate tracking-tight" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <span class="file-submeta text-xs text-slate-muted dark:text-slate-400"><span class="page-badge-text font-medium">${pageStr}</span> &bull; <span>${sizeStr}</span></span>
        </div>
      </div>

      <!-- Card Footer Row -->
      <div class="card-footer-row flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <div class="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-900/70 px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-slate-800">
          <span class="material-symbols-outlined text-[13px]">schedule</span>
          <span>${formattedDate}</span>
        </div>
        <span class="page-range-pill text-[11px] font-semibold text-primary-container dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-2.5 py-1 rounded-lg border border-indigo-100/70 dark:border-indigo-900/50">${item.pageCount ? `Pages 1–${item.pageCount}` : 'Pages 1+'}</span>
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
    showToast('Please add at least 2 PDF files to merge.', 'warning');
    return;
  }

  await ensurePdfLibLoaded().catch(() => {});
  if (!window.PDFLib) {
    showToast('PDF-Lib engine could not be loaded.', 'error');
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
    if (elements.shareBtn) {
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
    showToast('Failed to merge PDFs: ' + (err.message || 'Unknown error occurred'), 'error');
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
    dropzone.addEventListener('mouseenter', () => ensureAllPdfEngines().catch(() => {}), { once: true, passive: true });
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

    let mergeDragCounter = 0;
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureAllPdfEngines().catch(() => {});
      mergeDragCounter++;
      dropzone.classList.add('drag-active');
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      mergeDragCounter = Math.max(0, mergeDragCounter - 1);
      if (mergeDragCounter === 0) {
        dropzone.classList.remove('drag-active');
      }
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      mergeDragCounter = 0;
      dropzone.classList.remove('drag-active');
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
