/**
 * Tab 8: Split PDF Logic
 * 100% Client-Side PDF Splitting & Page Range Extractor
 * Supports:
 * 1. Extract Range to Single PDF or Individual Pages (ZIP)
 * 2. Split Every N Pages into Separate PDFs (ZIP)
 * 3. Split by Custom Range Groups into Separate PDFs (ZIP)
 */

import { splitState } from '../core/state.js';
import { elements } from '../core/dom.js';
import {
  formatBytes,
  parsePageInput,
  isPasswordProtectedError,
  handleSharePdf,
  trackToolUsage
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';
import { createZipArchive } from '../core/zip-builder.js';
import { ensurePdfLibLoaded } from '../core/engine-loader.js';

/**
 * Parses grouped ranges like "1-3, 4-6, 7-10" into an array of page arrays
 * e.g. [[1, 2, 3], [4, 5, 6], [7, 8, 9, 10]]
 * @param {string} inputStr
 * @param {number} totalPages
 * @returns {Array<Array<number>>}
 */
export function parseRangeGroups(inputStr, totalPages) {
  if (!inputStr || !inputStr.trim()) return [];
  const groups = inputStr.split(';').map(g => g.trim()).filter(Boolean);
  const result = [];

  // If semicolon separated, treat each as a group
  // If no semicolon, split by comma-delimited ranges (e.g. "1-2, 3-5")
  const rawGroups = groups.length > 1 ? groups : inputStr.split(',').map(g => g.trim()).filter(Boolean);

  for (const group of rawGroups) {
    const pageSet = new Set();
    const parts = group.split(/[\s,]+/);
    for (const part of parts) {
      if (!part) continue;
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        let start = parseInt(startStr, 10);
        let end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          if (start > end) [start, end] = [end, start];
          start = Math.max(1, start);
          end = Math.min(totalPages, end);
          for (let i = start; i <= end; i++) pageSet.add(i);
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          pageSet.add(p);
        }
      }
    }
    const sorted = Array.from(pageSet).sort((a, b) => a - b);
    if (sorted.length > 0) {
      result.push(sorted);
    }
  }

  return result;
}

export async function handleSplitFileSelected(file) {
  if (!file || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
    alert('Please select a valid PDF file.');
    return;
  }

  const isGenuinePdf = await isValidPdfFile(file);
  if (!isGenuinePdf) {
    alert(`Security Warning: "${file.name}" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);
    return;
  }

  splitState.file = file;
  splitState.outputBlob = null;
  splitState.outputUrl = null;
  splitState.isCancelled = false;
  splitState.isProcessing = false;

  if (elements.splitResultCard) elements.splitResultCard.classList.add('hidden');
  if (elements.splitProgressContainer) elements.splitProgressContainer.classList.add('hidden');

  if (elements.splitFileName) elements.splitFileName.textContent = file.name;
  if (elements.splitFileSubtext) elements.splitFileSubtext.textContent = `Reading PDF • ${formatBytes(file.size)}...`;

  const baseName = file.name.replace(/\.pdf$/i, '');
  if (elements.splitOutputPrefix) elements.splitOutputPrefix.value = `${baseName}_part`;

  if (elements.splitDropzoneSection) elements.splitDropzoneSection.classList.add('hidden');
  if (elements.splitWorkspace) elements.splitWorkspace.classList.remove('hidden');

  try {
    splitState.arrayBuffer = await file.arrayBuffer();

    await ensurePdfLibLoaded().catch(() => {});
    if (!window.PDFLib) {
      throw new Error('PDF-Lib library not loaded.');
    }

    const srcDoc = await PDFLib.PDFDocument.load(splitState.arrayBuffer, { ignoreEncryption: true });
    splitState.srcDoc = srcDoc;
    splitState.totalPages = srcDoc.getPageCount();

    if (splitState.totalPages === 0) {
      throw new Error('Document contains no pages or could not be read.');
    }

    if (elements.splitFileSubtext) {
      elements.splitFileSubtext.textContent = `${splitState.totalPages} ${splitState.totalPages === 1 ? 'page' : 'pages'} total • ${formatBytes(file.size)}`;
    }

    // Set intelligent default ranges
    if (elements.splitExtractRangeInput) {
      elements.splitExtractRangeInput.value = splitState.totalPages > 1 ? `1-${Math.min(splitState.totalPages, 3)}` : '1';
    }
    if (elements.splitCustomRangesInput) {
      if (splitState.totalPages >= 4) {
        const mid = Math.floor(splitState.totalPages / 2);
        elements.splitCustomRangesInput.value = `1-${mid}, ${mid + 1}-${splitState.totalPages}`;
      } else {
        elements.splitCustomRangesInput.value = '1, 2';
      }
    }
  } catch (err) {
    if (isPasswordProtectedError(err)) {
      alert('🔒 This PDF document is password-protected or encrypted.\nPlease unlock or remove the password before splitting.');
      resetSplitWorkspace();
      return;
    }
    console.error('Failed to load PDF for split:', err);
    alert('Could not open this PDF: ' + (err.message || 'Unknown error'));
    resetSplitWorkspace();
  }
}

export function resetSplitWorkspace() {
  splitState.file = null;
  splitState.arrayBuffer = null;
  splitState.srcDoc = null;
  splitState.totalPages = 0;
  splitState.outputBlob = null;
  splitState.outputUrl = null;
  splitState.isCancelled = false;
  splitState.isProcessing = false;

  if (elements.splitFileInput) elements.splitFileInput.value = '';
  if (elements.splitDropzoneSection) elements.splitDropzoneSection.classList.remove('hidden');
  if (elements.splitWorkspace) elements.splitWorkspace.classList.add('hidden');
  if (elements.splitResultCard) elements.splitResultCard.classList.add('hidden');
  if (elements.splitProgressContainer) elements.splitProgressContainer.classList.add('hidden');
}

export async function executeSplit(switchTab, handleCompressFileSelected) {
  if (!splitState.arrayBuffer || !splitState.srcDoc || splitState.totalPages === 0) {
    alert('Please select a valid PDF file first.');
    return;
  }

  if (splitState.isProcessing) return;
  splitState.isProcessing = true;
  splitState.isCancelled = false;

  const {
    splitModeExtract,
    splitModeFixed,
    splitModeCustom,
    splitExtractRangeInput,
    splitExtractAsZipCheckbox,
    splitEveryNPagesInput,
    splitCustomRangesInput,
    splitOutputPrefix,
    splitProgressContainer,
    splitProgressBar,
    splitProgressText,
    splitProgressPercent,
    splitResultCard,
    splitResultSummary,
    splitDownloadBtn,
    splitPreviewBtn,
    splitShareBtn,
    splitSendToCompressBtn
  } = elements;

  const mode = splitModeFixed && splitModeFixed.checked ? 'fixed' :
               (splitModeCustom && splitModeCustom.checked ? 'custom' : 'extract');

  const prefix = (splitOutputPrefix && splitOutputPrefix.value.trim()) || 'split_document';

  if (splitResultCard) splitResultCard.classList.add('hidden');
  if (splitProgressContainer) splitProgressContainer.classList.remove('hidden');

  function updateProgress(pct, statusText) {
    if (splitProgressBar) splitProgressBar.style.width = `${pct}%`;
    if (splitProgressPercent) splitProgressPercent.textContent = `${Math.round(pct)}%`;
    if (splitProgressText) splitProgressText.textContent = statusText;
  }

  updateProgress(5, 'Preparing document pages...');

  try {
    await ensurePdfLibLoaded().catch(() => {});
    if (!window.PDFLib) {
      throw new Error('PDF-Lib library not loaded.');
    }
    const srcDoc = await PDFLib.PDFDocument.load(splitState.arrayBuffer, { ignoreEncryption: true });

    if (mode === 'extract') {
      const rawInput = splitExtractRangeInput ? splitExtractRangeInput.value.trim() : '';
      const pageSet = parsePageInput(rawInput, splitState.totalPages);
      const sortedPages = Array.from(pageSet).sort((a, b) => a - b);

      if (sortedPages.length === 0) {
        throw new Error('Please specify at least one valid page number to extract (e.g. 1-3, 5).');
      }

      const asZip = splitExtractAsZipCheckbox && splitExtractAsZipCheckbox.checked;

      if (asZip) {
        // Extract each page as an individual PDF, package into ZIP
        const files = [];
        for (let i = 0; i < sortedPages.length; i++) {
          if (splitState.isCancelled) throw new Error('OPERATION_CANCELLED');
          const p = sortedPages[i];
          updateProgress(10 + Math.round((i / sortedPages.length) * 80), `Extracting page ${p} of ${splitState.totalPages}...`);

          const singleDoc = await PDFLib.PDFDocument.create();
          const [copiedPage] = await singleDoc.copyPages(srcDoc, [p - 1]);
          singleDoc.addPage(copiedPage);
          const pdfBytes = await singleDoc.save();

          files.push({
            name: `${prefix}_page_${String(p).padStart(3, '0')}.pdf`,
            data: pdfBytes
          });
        }

        updateProgress(95, 'Building ZIP archive...');
        const zipBlob = createZipArchive(files);
        splitState.outputBlob = zipBlob;
        splitState.outputUrl = URL.createObjectURL(zipBlob);

        if (splitResultSummary) {
          splitResultSummary.textContent = `Extracted ${sortedPages.length} individual PDF pages packaged into a ZIP archive (${formatBytes(zipBlob.size)}).`;
        }
        if (splitDownloadBtn) {
          splitDownloadBtn.href = splitState.outputUrl;
          splitDownloadBtn.download = `${prefix}_pages.zip`;
          splitDownloadBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">download_for_offline</span><span>Download ZIP (${formatBytes(zipBlob.size)})</span>`;
        }
        if (splitPreviewBtn) splitPreviewBtn.classList.add('hidden'); // Cannot preview ZIP directly
        if (splitSendToCompressBtn) splitSendToCompressBtn.classList.add('hidden');
      } else {
        // Extract into a single combined PDF
        updateProgress(30, `Extracting ${sortedPages.length} pages into new document...`);
        const newDoc = await PDFLib.PDFDocument.create();
        const pageIndices = sortedPages.map(p => p - 1);
        const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach(p => newDoc.addPage(p));

        if (splitState.isCancelled) throw new Error('OPERATION_CANCELLED');
        updateProgress(85, 'Saving extracted PDF...');
        const pdfBytes = await newDoc.save();

        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        splitState.outputBlob = pdfBlob;
        splitState.outputUrl = URL.createObjectURL(pdfBlob);

        if (splitResultSummary) {
          splitResultSummary.textContent = `Extracted ${sortedPages.length} ${sortedPages.length === 1 ? 'page' : 'pages'} into a clean PDF (${formatBytes(pdfBlob.size)}).`;
        }
        if (splitDownloadBtn) {
          splitDownloadBtn.href = splitState.outputUrl;
          splitDownloadBtn.download = `${prefix}.pdf`;
          splitDownloadBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">download_for_offline</span><span>Download PDF (${formatBytes(pdfBlob.size)})</span>`;
        }
        if (splitPreviewBtn) {
          splitPreviewBtn.classList.remove('hidden');
          splitPreviewBtn.onclick = () => window.open(splitState.outputUrl, '_blank');
        }
        if (splitSendToCompressBtn) {
          splitSendToCompressBtn.classList.remove('hidden');
          splitSendToCompressBtn.onclick = () => {
            const handoffFile = new File([splitState.outputBlob], `${prefix}.pdf`, {
              type: 'application/pdf',
              lastModified: Date.now()
            });
            if (typeof switchTab === 'function') switchTab('compress');
            if (typeof handleCompressFileSelected === 'function') handleCompressFileSelected(handoffFile);
          };
        }
      }

      trackToolUsage('split_pdf', 'used', sortedPages.length);

    } else if (mode === 'fixed') {
      // Split every N pages
      const n = Math.max(1, parseInt(splitEveryNPagesInput ? splitEveryNPagesInput.value : '2', 10) || 1);
      const totalPages = splitState.totalPages;
      const chunks = [];

      for (let start = 1; start <= totalPages; start += n) {
        const end = Math.min(totalPages, start + n - 1);
        const pages = [];
        for (let p = start; p <= end; p++) pages.push(p);
        chunks.push(pages);
      }

      const files = [];
      for (let i = 0; i < chunks.length; i++) {
        if (splitState.isCancelled) throw new Error('OPERATION_CANCELLED');
        const chunk = chunks[i];
        updateProgress(10 + Math.round((i / chunks.length) * 80), `Generating part ${i + 1} of ${chunks.length} (Pages ${chunk[0]}-${chunk[chunk.length - 1]})...`);

        const partDoc = await PDFLib.PDFDocument.create();
        const indices = chunk.map(p => p - 1);
        const copied = await partDoc.copyPages(srcDoc, indices);
        copied.forEach(p => partDoc.addPage(p));
        const bytes = await partDoc.save();

        files.push({
          name: `${prefix}_part_${String(i + 1).padStart(2, '0')}_pages_${chunk[0]}-${chunk[chunk.length - 1]}.pdf`,
          data: bytes
        });
      }

      updateProgress(95, 'Packaging split files into ZIP archive...');
      const zipBlob = createZipArchive(files);
      splitState.outputBlob = zipBlob;
      splitState.outputUrl = URL.createObjectURL(zipBlob);

      if (splitResultSummary) {
        splitResultSummary.textContent = `Split document into ${chunks.length} PDF parts (every ${n} pages), packaged in a ZIP archive (${formatBytes(zipBlob.size)}).`;
      }
      if (splitDownloadBtn) {
        splitDownloadBtn.href = splitState.outputUrl;
        splitDownloadBtn.download = `${prefix}_split_parts.zip`;
        splitDownloadBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">download_for_offline</span><span>Download ZIP (${formatBytes(zipBlob.size)})</span>`;
      }
      if (splitPreviewBtn) splitPreviewBtn.classList.add('hidden');
      if (splitSendToCompressBtn) splitSendToCompressBtn.classList.add('hidden');

      trackToolUsage('split_pdf', 'used', totalPages);

    } else if (mode === 'custom') {
      // Split by custom range groups
      const rawInput = splitCustomRangesInput ? splitCustomRangesInput.value.trim() : '';
      const groups = parseRangeGroups(rawInput, splitState.totalPages);

      if (groups.length === 0) {
        throw new Error('Please enter valid page groups separated by commas or semicolons (e.g. 1-3, 4-6, 7-10).');
      }

      const files = [];
      let totalExtractedPages = 0;

      for (let i = 0; i < groups.length; i++) {
        if (splitState.isCancelled) throw new Error('OPERATION_CANCELLED');
        const group = groups[i];
        totalExtractedPages += group.length;
        updateProgress(10 + Math.round((i / groups.length) * 80), `Generating group ${i + 1} of ${groups.length} (${group.length} pages)...`);

        const partDoc = await PDFLib.PDFDocument.create();
        const indices = group.map(p => p - 1);
        const copied = await partDoc.copyPages(srcDoc, indices);
        copied.forEach(p => partDoc.addPage(p));
        const bytes = await partDoc.save();

        const rangeLabel = group.length === 1 ? `page_${group[0]}` : `pages_${group[0]}-${group[group.length - 1]}`;
        files.push({
          name: `${prefix}_group_${String(i + 1).padStart(2, '0')}_${rangeLabel}.pdf`,
          data: bytes
        });
      }

      updateProgress(95, 'Packaging custom split files into ZIP archive...');
      const zipBlob = createZipArchive(files);
      splitState.outputBlob = zipBlob;
      splitState.outputUrl = URL.createObjectURL(zipBlob);

      if (splitResultSummary) {
        splitResultSummary.textContent = `Split into ${groups.length} custom range PDF files packaged in a ZIP archive (${formatBytes(zipBlob.size)}).`;
      }
      if (splitDownloadBtn) {
        splitDownloadBtn.href = splitState.outputUrl;
        splitDownloadBtn.download = `${prefix}_custom_parts.zip`;
        splitDownloadBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">download_for_offline</span><span>Download ZIP (${formatBytes(zipBlob.size)})</span>`;
      }
      if (splitPreviewBtn) splitPreviewBtn.classList.add('hidden');
      if (splitSendToCompressBtn) splitSendToCompressBtn.classList.add('hidden');

      trackToolUsage('split_pdf', 'used', totalExtractedPages);
    }

    if (splitShareBtn) {
      splitShareBtn.classList.remove('hidden');
      splitShareBtn.onclick = () => {
        if (splitState.outputBlob) {
          const isZip = splitState.outputBlob.type === 'application/zip';
          const ext = isZip ? '.zip' : '.pdf';
          handleSharePdf(splitState.outputBlob, `${prefix}${ext}`, splitState.outputBlob.type);
        }
      };
    }

    updateProgress(100, 'Complete!');
    if (splitProgressContainer) splitProgressContainer.classList.add('hidden');
    if (splitResultCard) splitResultCard.classList.remove('hidden');

  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      updateProgress(0, 'Operation cancelled.');
      if (splitProgressContainer) splitProgressContainer.classList.add('hidden');
      return;
    }
    console.error('Split failed:', err);
    alert('Split failed: ' + (err.message || 'Unknown error'));
    if (splitProgressContainer) splitProgressContainer.classList.add('hidden');
  } finally {
    splitState.isProcessing = false;
  }
}

export function initSplitTab(switchTab, handleCompressFileSelected) {
  const {
    splitDropzone,
    splitFileInput,
    splitChangeFileBtn,
    splitModeExtract,
    splitModeFixed,
    splitModeCustom,
    splitExtractSection,
    splitFixedSection,
    splitCustomSection,
    executeSplitBtn,
    splitCancelBtn
  } = elements;

  if (splitDropzone && splitFileInput) {
    splitDropzone.addEventListener('mouseenter', () => ensurePdfLibLoaded().catch(() => {}), { once: true, passive: true });
    splitDropzone.addEventListener('click', () => splitFileInput.click());
    splitDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        splitFileInput.click();
      }
    });

    splitDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      ensurePdfLibLoaded().catch(() => {});
      splitDropzone.classList.add('drag-active');
    });

    splitDropzone.addEventListener('dragleave', () => {
      splitDropzone.classList.remove('drag-active');
    });

    splitDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      splitDropzone.classList.remove('drag-active');
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (files.length > 0) {
        handleSplitFileSelected(files[0]);
      } else {
        alert('Please drop a valid PDF file.');
      }
    });

    splitFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSplitFileSelected(e.target.files[0]);
      }
    });
  }

  if (splitChangeFileBtn) {
    splitChangeFileBtn.addEventListener('click', resetSplitWorkspace);
  }

  // Mode radio toggle
  function updateModeSections() {
    const isExtract = splitModeExtract ? splitModeExtract.checked : true;
    const isFixed = splitModeFixed ? splitModeFixed.checked : false;
    const isCustom = splitModeCustom ? splitModeCustom.checked : false;

    if (splitExtractSection) splitExtractSection.classList.toggle('hidden', !isExtract);
    if (splitFixedSection) splitFixedSection.classList.toggle('hidden', !isFixed);
    if (splitCustomSection) splitCustomSection.classList.toggle('hidden', !isCustom);

    if (executeSplitBtn) {
      executeSplitBtn.innerHTML = isExtract
        ? `<span class="material-symbols-outlined text-[18px]">content_copy</span><span>Extract Pages</span>`
        : `<span class="material-symbols-outlined text-[18px]">call_split</span><span>Split Document</span>`;
    }
  }

  if (splitModeExtract) splitModeExtract.addEventListener('change', updateModeSections);
  if (splitModeFixed) splitModeFixed.addEventListener('change', updateModeSections);
  if (splitModeCustom) splitModeCustom.addEventListener('change', updateModeSections);

  if (executeSplitBtn) {
    executeSplitBtn.addEventListener('click', () => executeSplit(switchTab, handleCompressFileSelected));
  }

  if (splitCancelBtn) {
    splitCancelBtn.addEventListener('click', () => {
      splitState.isCancelled = true;
    });
  }
}
