/**
 * Tab 7: PDF to Images Core Engine
 * Renders high-resolution raster images (JPG/PNG) from PDF pages and packages as ZIP.
 */

import { pdfToImagesState } from '../core/state.js';
import { elements } from '../core/dom.js';
import { createZipArchive } from '../core/zip-builder.js';
import {
  formatBytes,
  escapeHtml,
  parsePageInput,
  isPasswordProtectedError,
  trackToolUsage,
  handleSharePdf
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';
import { ensurePdfJsLoaded } from '../core/engine-loader.js';

export async function handlePdfToImagesFileSelected(file) {
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

    await ensurePdfJsLoaded().catch(() => {});
    let pdfjsDoc;
    try {
      const bufferCopy = new Uint8Array(arrayBuffer.slice(0));
      pdfjsDoc = await pdfjsLib.getDocument({ data: bufferCopy }).promise;
    } catch (loadErr) {
      if (isPasswordProtectedError(loadErr)) {
        alert('🔒 This PDF document is password-protected or encrypted. Please remove password protection before converting.');
        return;
      }
      throw loadErr;
    }

    pdfToImagesState.file = file;
    pdfToImagesState.arrayBuffer = arrayBuffer;
    pdfToImagesState.pdfjsDoc = pdfjsDoc;
    pdfToImagesState.totalPages = pdfjsDoc.numPages;
    pdfToImagesState.images = [];
    pdfToImagesState.zipBlob = null;

    if (elements.pdfToImagesFileName) elements.pdfToImagesFileName.textContent = file.name;
    if (elements.pdfToImagesPageCountBadge) {
      elements.pdfToImagesPageCountBadge.textContent = `${pdfjsDoc.numPages} ${pdfjsDoc.numPages === 1 ? 'page' : 'pages'}`;
    }
    if (elements.pdfToImagesFileSizeBadge) {
      elements.pdfToImagesFileSizeBadge.textContent = formatBytes(file.size);
    }

    const basePrefix = file.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (elements.pdfToImagesOutputPrefix) {
      elements.pdfToImagesOutputPrefix.value = basePrefix || 'page';
    }

    if (elements.pdfToImagesDropzoneSection) elements.pdfToImagesDropzoneSection.classList.add('hidden');
    if (elements.pdfToImagesWorkspace) elements.pdfToImagesWorkspace.classList.remove('hidden');
    if (elements.pdfToImagesResultCard) elements.pdfToImagesResultCard.classList.add('hidden');
    if (elements.pdfToImagesProgressContainer) elements.pdfToImagesProgressContainer.classList.add('hidden');
  } catch (err) {
    console.error('Failed to load PDF for images conversion:', err);
    alert('Failed to load PDF: ' + (err.message || 'Unknown error'));
  }
}

export async function convertPdfToImages() {
  if (elements.pdfToImagesExecuteBtn && elements.pdfToImagesExecuteBtn.disabled) return;
  if (!pdfToImagesState.pdfjsDoc) {
    alert('Please upload a PDF document first.');
    return;
  }

  let targetPages = [];
  if (pdfToImagesState.pageMode === 'all') {
    for (let p = 1; p <= pdfToImagesState.totalPages; p++) targetPages.push(p);
  } else {
    const inputStr = elements.pdfToImagesPageRangeInput ? elements.pdfToImagesPageRangeInput.value.trim() : '';
    const pageSet = parsePageInput(inputStr, pdfToImagesState.totalPages);
    targetPages = Array.from(pageSet).sort((a, b) => a - b);
    if (targetPages.length === 0) {
      alert('Please specify valid page numbers to convert (e.g. 1, 3, 5-8).');
      return;
    }
  }

  const mimeType = pdfToImagesState.format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = pdfToImagesState.format === 'png' ? 'png' : 'jpg';
  const scale = pdfToImagesState.scale;
  const prefix = (elements.pdfToImagesOutputPrefix ? elements.pdfToImagesOutputPrefix.value.trim() : '') || 'page';

  if (elements.pdfToImagesExecuteBtn) elements.pdfToImagesExecuteBtn.disabled = true;
  pdfToImagesState.isCancelled = false;
  pdfToImagesState.isConverting = true;
  if (elements.pdfToImagesProgressContainer) elements.pdfToImagesProgressContainer.classList.remove('hidden');
  if (elements.pdfToImagesResultCard) elements.pdfToImagesResultCard.classList.add('hidden');

  await ensurePdfJsLoaded().catch(() => {});
  const total = targetPages.length;
  const generatedImages = [];

  try {
    for (let i = 0; i < total; i++) {
      if (pdfToImagesState.isCancelled) throw new Error('OPERATION_CANCELLED');

      const pageNum = targetPages[i];
      setPdfToImagesProgress(
        Math.round((i / total) * 100),
        `Rendering page ${pageNum} (${i + 1} of ${total})...`
      );

      const page = await pdfToImagesState.pdfjsDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (mimeType === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      if (pdfToImagesState.isCancelled) {
        canvas.width = 0;
        canvas.height = 0;
        throw new Error('OPERATION_CANCELLED');
      }

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
      });

      canvas.width = 0;
      canvas.height = 0;

      const dataUrl = URL.createObjectURL(blob);
      const filename = `${prefix}_page_${String(pageNum).padStart(3, '0')}.${ext}`;

      generatedImages.push({
        pageNum,
        name: filename,
        blob,
        dataUrl,
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height),
        size: blob.size,
      });

      setPdfToImagesProgress(
        Math.round(((i + 1) / total) * 100),
        `Converted page ${pageNum} (${i + 1} of ${total})`
      );
    }

    pdfToImagesState.images = generatedImages;
    renderPdfToImagesGallery();

    if (elements.pdfToImagesProgressContainer) elements.pdfToImagesProgressContainer.classList.add('hidden');
    if (elements.pdfToImagesResultCard) elements.pdfToImagesResultCard.classList.remove('hidden');
    if (elements.pdfToImagesResultSummary) {
      elements.pdfToImagesResultSummary.textContent = `Successfully converted ${generatedImages.length} ${generatedImages.length === 1 ? 'page' : 'pages'} to high-resolution ${ext.toUpperCase()} images!`;
    }

    if (elements.pdfToImagesShareBtn) {
      elements.pdfToImagesShareBtn.classList.remove('hidden');
    }

    trackToolUsage('pdftoimages');
    if (elements.pdfToImagesResultCard) {
      elements.pdfToImagesResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      console.log('PDF to images conversion cancelled.');
      if (elements.pdfToImagesProgressContainer) elements.pdfToImagesProgressContainer.classList.add('hidden');
    } else {
      console.error('Error converting PDF to images:', err);
      alert('Failed to convert PDF to images: ' + (err.message || 'Unknown error'));
      if (elements.pdfToImagesProgressContainer) elements.pdfToImagesProgressContainer.classList.add('hidden');
    }
  } finally {
    if (elements.pdfToImagesExecuteBtn) elements.pdfToImagesExecuteBtn.disabled = false;
    pdfToImagesState.isConverting = false;
  }
}

export function renderPdfToImagesGallery() {
  if (!elements.pdfToImagesGallery) return;
  elements.pdfToImagesGallery.innerHTML = '';

  pdfToImagesState.images.forEach((img) => {
    const card = document.createElement('div');
    card.className = 'pdftoimages-card';

    card.innerHTML = `
      <div class="pdftoimages-thumb-wrapper" title="Click to preview full size">
        <div class="pdftoimages-page-badge">Page ${img.pageNum}</div>
        <img src="${img.dataUrl}" class="pdftoimages-thumb" alt="${escapeHtml(img.name)}" loading="lazy">
      </div>
      <div class="pdftoimages-card-meta">
        <div class="pdftoimages-card-title" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
        <div class="pdftoimages-card-details">${img.width} × ${img.height} px &bull; ${formatBytes(img.size)}</div>
      </div>
      <div class="pdftoimages-card-actions">
        <a href="${img.dataUrl}" download="${escapeHtml(img.name)}" class="btn btn-primary btn-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Download
        </a>
      </div>
    `;

    const thumbWrapper = card.querySelector('.pdftoimages-thumb-wrapper');
    if (thumbWrapper) {
      thumbWrapper.addEventListener('click', () => {
        showPdfImagePreviewModal(img);
      });
    }

    elements.pdfToImagesGallery.appendChild(card);
  });
}

export function showPdfImagePreviewModal(img) {
  const previewModal = document.getElementById('previewModal');
  const previewContainer = document.getElementById('previewContainer');
  if (previewModal && previewContainer) {
    previewContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding:1rem;gap:0.75rem;">
        <div style="font-weight:600;font-size:0.95rem;color:var(--text-main);">${escapeHtml(img.name)} (${img.width} × ${img.height} px &bull; ${formatBytes(img.size)})</div>
        <img src="${img.dataUrl}" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.25);" alt="${escapeHtml(img.name)}">
      </div>
    `;
    previewModal.classList.remove('hidden');
  } else if (img && img.dataUrl) {
    window.open(img.dataUrl, '_blank');
  }
}

export async function downloadAllPdfImagesZip() {
  if (!pdfToImagesState.images || pdfToImagesState.images.length === 0) {
    alert('No converted images available.');
    return;
  }

  try {
    if (elements.pdfToImagesDownloadZipBtn) {
      elements.pdfToImagesDownloadZipBtn.disabled = true;
      elements.pdfToImagesDownloadZipBtn.textContent = 'Generating ZIP...';
    }

    const zipFiles = [];
    for (const img of pdfToImagesState.images) {
      const arrayBuf = await img.blob.arrayBuffer();
      zipFiles.push({
        name: img.name,
        data: new Uint8Array(arrayBuf),
      });
    }

    const zipBlob = createZipArchive(zipFiles);
    pdfToImagesState.zipBlob = zipBlob;

    const prefix = (elements.pdfToImagesOutputPrefix ? elements.pdfToImagesOutputPrefix.value.trim() : '') || 'converted_images';
    const zipFilename = `${prefix}_images.zip`;

    const downloadUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = zipFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

    trackToolUsage('pdftoimages_zip_downloaded');
  } catch (err) {
    console.error('Failed to create ZIP:', err);
    alert('Failed to generate ZIP archive: ' + (err.message || 'Unknown error'));
  } finally {
    if (elements.pdfToImagesDownloadZipBtn) {
      elements.pdfToImagesDownloadZipBtn.disabled = false;
      elements.pdfToImagesDownloadZipBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        📦 Download All as ZIP
      `;
    }
  }
}

export async function sharePdfImages() {
  if (!pdfToImagesState.images || pdfToImagesState.images.length === 0) {
    alert('No converted images to share.');
    return;
  }

  const prefix = (elements.pdfToImagesOutputPrefix ? elements.pdfToImagesOutputPrefix.value.trim() : '') || 'converted_images';

  if (pdfToImagesState.zipBlob) {
    handleSharePdf(pdfToImagesState.zipBlob, `${prefix}_images.zip`, 'application/zip');
  } else if (pdfToImagesState.images && pdfToImagesState.images.length > 0) {
    const firstImg = pdfToImagesState.images[0];
    handleSharePdf(firstImg.blob, firstImg.name, firstImg.blob.type || 'image/jpeg');
  }
}

export function resetPdfToImages() {
  pdfToImagesState.file = null;
  pdfToImagesState.arrayBuffer = null;
  pdfToImagesState.pdfjsDoc = null;
  pdfToImagesState.totalPages = 0;
  pdfToImagesState.images.forEach((img) => {
    if (img.dataUrl) URL.revokeObjectURL(img.dataUrl);
  });
  pdfToImagesState.images = [];
  pdfToImagesState.zipBlob = null;
  if (elements.pdfToImagesGallery) elements.pdfToImagesGallery.innerHTML = '';
  if (elements.pdfToImagesFileInput) elements.pdfToImagesFileInput.value = '';
  if (elements.pdfToImagesWorkspace) elements.pdfToImagesWorkspace.classList.add('hidden');
  if (elements.pdfToImagesResultCard) elements.pdfToImagesResultCard.classList.add('hidden');
  if (elements.pdfToImagesProgressContainer) elements.pdfToImagesProgressContainer.classList.add('hidden');
  if (elements.pdfToImagesDropzoneSection) elements.pdfToImagesDropzoneSection.classList.remove('hidden');
}

function setPdfToImagesProgress(percent, text) {
  if (elements.pdfToImagesProgressBar) elements.pdfToImagesProgressBar.style.width = `${percent}%`;
  if (elements.pdfToImagesProgressPercent) elements.pdfToImagesProgressPercent.textContent = `${percent}%`;
  if (elements.pdfToImagesProgressText) elements.pdfToImagesProgressText.textContent = text;
}

export function initPdfToImagesTab() {
  const {
    pdfToImagesDropzone,
    pdfToImagesFileInput,
    pdfToImagesChangeFileBtn,
    pdfToImagesPageModeAll,
    pdfToImagesPageModeCustom,
    pdfToImagesCustomRangeContainer,
    pdfToImagesPageRangeInput,
    pdfToImagesExecuteBtn,
    pdfToImagesCancelBtn,
    pdfToImagesDownloadZipBtn,
    pdfToImagesShareBtn,
    pdfToImagesResetBtn
  } = elements;

  if (pdfToImagesDropzone && pdfToImagesFileInput) {
    pdfToImagesDropzone.addEventListener('mouseenter', () => ensurePdfJsLoaded().catch(() => {}), { once: true, passive: true });
    pdfToImagesDropzone.addEventListener('click', () => pdfToImagesFileInput.click());
    pdfToImagesDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pdfToImagesFileInput.click();
      }
    });
    pdfToImagesFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePdfToImagesFileSelected(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      pdfToImagesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensurePdfJsLoaded().catch(() => {});
        pdfToImagesDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      pdfToImagesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        pdfToImagesDropzone.classList.remove('drag-active');
      });
    });

    pdfToImagesDropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handlePdfToImagesFileSelected(e.dataTransfer.files[0]);
      }
    });
  }

  if (pdfToImagesChangeFileBtn) pdfToImagesChangeFileBtn.addEventListener('click', resetPdfToImages);

  const pdfToImagesFormatCards = document.querySelectorAll('#pdfToImagesWorkspace .preset-choice-card[data-format]');
  pdfToImagesFormatCards.forEach((card) => {
    card.addEventListener('click', () => {
      const format = card.dataset.format;
      if (!format) return;
      pdfToImagesState.format = format;
      pdfToImagesFormatCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  const pdfToImagesScaleCards = document.querySelectorAll('#pdfToImagesWorkspace .preset-choice-card[data-scale]');
  pdfToImagesScaleCards.forEach((card) => {
    card.addEventListener('click', () => {
      const scaleVal = parseFloat(card.dataset.scale);
      if (isNaN(scaleVal)) return;
      pdfToImagesState.scale = scaleVal;
      pdfToImagesScaleCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  if (pdfToImagesPageModeAll) {
    pdfToImagesPageModeAll.addEventListener('change', () => {
      if (pdfToImagesPageModeAll.checked) {
        pdfToImagesState.pageMode = 'all';
        if (pdfToImagesCustomRangeContainer) pdfToImagesCustomRangeContainer.classList.add('hidden');
      }
    });
  }

  if (pdfToImagesPageModeCustom) {
    pdfToImagesPageModeCustom.addEventListener('change', () => {
      if (pdfToImagesPageModeCustom.checked) {
        pdfToImagesState.pageMode = 'custom';
        if (pdfToImagesCustomRangeContainer) {
          pdfToImagesCustomRangeContainer.classList.remove('hidden');
          if (pdfToImagesPageRangeInput) pdfToImagesPageRangeInput.focus();
        }
      }
    });
  }

  if (pdfToImagesExecuteBtn) pdfToImagesExecuteBtn.addEventListener('click', convertPdfToImages);

  if (pdfToImagesCancelBtn) {
    pdfToImagesCancelBtn.addEventListener('click', () => {
      pdfToImagesState.isCancelled = true;
      setPdfToImagesProgress(0, 'Cancelling conversion...');
    });
  }

  if (pdfToImagesDownloadZipBtn) pdfToImagesDownloadZipBtn.addEventListener('click', downloadAllPdfImagesZip);
  if (pdfToImagesShareBtn) pdfToImagesShareBtn.addEventListener('click', sharePdfImages);
  if (pdfToImagesResetBtn) pdfToImagesResetBtn.addEventListener('click', resetPdfToImages);
}
