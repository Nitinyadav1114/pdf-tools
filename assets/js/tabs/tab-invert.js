/**
 * Tab 4: Invert Colors Controller
 * Inverts dark PDF presentations to crisp white hardcopy sheets, saving toner and printer ink.
 */

import { invertState } from '../core/state.js';
import { elements } from '../core/dom.js';
import { appWorkerPool } from '../core/worker-pool.js';
import {
  formatBytes,
  parsePageInput,
  isPasswordProtectedError,
  handleSharePdf,
  trackToolUsage
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';

export async function handleInvertFileSelected(file) {
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
    if (elements.invertFileName) elements.invertFileName.textContent = file.name;
    if (elements.invertFileSubtext) elements.invertFileSubtext.textContent = 'Analyzing PDF...';
    if (elements.invertDropzoneSection) elements.invertDropzoneSection.classList.add('hidden');
    if (elements.invertWorkspace) elements.invertWorkspace.classList.remove('hidden');
    if (elements.invertResultCard) elements.invertResultCard.classList.add('hidden');

    const arrayBuffer = await file.arrayBuffer();
    invertState.file = file;
    invertState.arrayBuffer = arrayBuffer;

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    if (elements.invertOutputFilename) elements.invertOutputFilename.value = `${baseName}_inverted.pdf`;

    if (window.PDFLib) {
      const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      invertState.pdfDoc = doc;
      invertState.totalPages = doc.getPageCount();
      if (elements.invertFileSubtext) {
        elements.invertFileSubtext.textContent = `${invertState.totalPages} pages • ${formatBytes(file.size)}`;
      }
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

export function resetInvertWorkspace() {
  invertState.file = null;
  invertState.arrayBuffer = null;
  invertState.pdfDoc = null;
  invertState.totalPages = 0;
  invertState.previewPageNum = 1;
  invertState.originalCanvasCache = null;
  invertState.isCancelled = false;

  if (elements.invertOriginalCanvas) {
    elements.invertOriginalCanvas.width = 0;
    elements.invertOriginalCanvas.height = 0;
  }
  if (elements.invertPreviewCanvas) {
    elements.invertPreviewCanvas.width = 0;
    elements.invertPreviewCanvas.height = 0;
  }
  if (elements.invertDisplayCanvas) {
    elements.invertDisplayCanvas.width = 0;
    elements.invertDisplayCanvas.height = 0;
  }

  if (invertState.outputUrl) {
    URL.revokeObjectURL(invertState.outputUrl);
    invertState.outputUrl = null;
    invertState.outputBlob = null;
  }
  if (elements.invertFileInput) elements.invertFileInput.value = '';
  if (elements.invertWorkspace) elements.invertWorkspace.classList.add('hidden');
  if (elements.invertDropzoneSection) elements.invertDropzoneSection.classList.remove('hidden');
  if (elements.invertResultCard) elements.invertResultCard.classList.add('hidden');
}

export function invertPixelsNegative(data) {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    data[i] = 255 - data[i];         // Red
    data[i + 1] = 255 - data[i + 1]; // Green
    data[i + 2] = 255 - data[i + 2]; // Blue
  }
}

export function invertPixelsGrayscale(data) {
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

export function isPageDark(data) {
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

export function invertPixelsPreserveHue(data) {
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

export function applyInvertAlgorithm(imageData, mode) {
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

export async function renderInvertComparisonPreview() {
  if (!invertState.arrayBuffer || !window.pdfjsLib) return;

  const renderId = ++invertState.activeRenderId;
  if (elements.invertOriginalSpinner) elements.invertOriginalSpinner.classList.remove('hidden');
  if (elements.invertPreviewSpinner) elements.invertPreviewSpinner.classList.remove('hidden');

  try {
    const bufferClone = new Uint8Array(invertState.arrayBuffer.slice(0));
    const loadingTask = pdfjsLib.getDocument({ data: bufferClone });
    const pdf = await loadingTask.promise;
    if (renderId !== invertState.activeRenderId) return;

    const pageNum = Math.max(1, Math.min(invertState.previewPageNum, pdf.numPages));
    const page = await pdf.getPage(pageNum);
    if (renderId !== invertState.activeRenderId) return;

    const viewport = page.getViewport({ scale: 1.5 });

    if (elements.invertOriginalCanvas) {
      elements.invertOriginalCanvas.width = viewport.width;
      elements.invertOriginalCanvas.height = viewport.height;
      const origCtx = elements.invertOriginalCanvas.getContext('2d');
      origCtx.fillStyle = '#ffffff';
      origCtx.fillRect(0, 0, viewport.width, viewport.height);
      await page.render({ canvasContext: origCtx, viewport }).promise;
      if (renderId !== invertState.activeRenderId) return;

      invertState.originalCanvasCache = origCtx.getImageData(0, 0, viewport.width, viewport.height);
    }

    if (elements.invertOriginalSpinner) elements.invertOriginalSpinner.classList.add('hidden');

    await updateInvertedPreviewCanvas();
    window.INVERT_PREVIEW_READY = true;
  } catch (err) {
    if (renderId === invertState.activeRenderId) {
      console.error('Error rendering comparison preview:', err);
    }
  } finally {
    if (renderId === invertState.activeRenderId) {
      if (elements.invertOriginalSpinner) elements.invertOriginalSpinner.classList.add('hidden');
      if (elements.invertPreviewSpinner) elements.invertPreviewSpinner.classList.add('hidden');
    }
  }
}

export async function updateInvertedPreviewCanvas() {
  if (!invertState.originalCanvasCache || !elements.invertPreviewCanvas || !elements.invertOriginalCanvas) return;

  elements.invertPreviewCanvas.width = elements.invertOriginalCanvas.width;
  elements.invertPreviewCanvas.height = elements.invertOriginalCanvas.height;
  const prevCtx = elements.invertPreviewCanvas.getContext('2d');
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
        if (elements.invertPreviewSpinner) elements.invertPreviewSpinner.classList.add('hidden');
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
    if (elements.invertPreviewSpinner) elements.invertPreviewSpinner.classList.add('hidden');
    refreshInvertDisplay();
  }
}

export function refreshInvertDisplay() {
  if (!elements.invertDisplayCanvas) return;
  const isShowingInverted = !elements.btnShowOriginal || !elements.btnShowOriginal.classList.contains('active');
  const sourceCanvas = isShowingInverted ? elements.invertPreviewCanvas : elements.invertOriginalCanvas;
  if (!sourceCanvas || sourceCanvas.width === 0) return;

  elements.invertDisplayCanvas.width = sourceCanvas.width;
  elements.invertDisplayCanvas.height = sourceCanvas.height;
  const ctx = elements.invertDisplayCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  if (elements.invertDisplayCaption) {
    if (isShowingInverted) {
      elements.invertDisplayCaption.innerHTML = 'Viewing: <strong>Hardcopy Print-Ready (White Paper)</strong>';
    } else {
      elements.invertDisplayCaption.innerHTML = 'Viewing: <strong>Original Screen Version (Dark Background)</strong>';
    }
  }
}

export function updateInvertNavButtons() {
  const total = invertState.totalPages || 1;
  const current = invertState.previewPageNum;
  if (elements.invertPageNavText) elements.invertPageNavText.textContent = `Page ${current} of ${total}`;
  if (elements.invertPrevPageBtn) elements.invertPrevPageBtn.disabled = current <= 1;
  if (elements.invertNextPageBtn) elements.invertNextPageBtn.disabled = current >= total;
}

export function updateInvertHint() {
  if (!elements.invertHintText) return;
  const mode = invertState.mode;
  if (mode === 'grayscale-invert') {
    elements.invertHintText.innerHTML = '🖨️ <strong>Monochrome Ink Saver:</strong> Converts dark backgrounds into pure white paper and turns all text &amp; charts to black/grayscale.';
  } else if (mode === 'dark-only') {
    elements.invertHintText.innerHTML = '🌓 <strong>Smart Auto Invert:</strong> Automatically inverts dark slides into white pages, but leaves pages that are already white untouched.';
  } else if (mode === 'preserve-hue') {
    elements.invertHintText.innerHTML = '🎨 <strong>Color Preserving:</strong> Inverts brightness while retaining color hues (e.g. blue remains blue, red remains red on white paper).';
  } else {
    elements.invertHintText.innerHTML = '🖨️ <strong>Smart Negative:</strong> Inverts dark backgrounds to clean white paper and light text to dark, saving up to 90% toner.';
  }
}

export async function executeInvertPdf() {
  if (elements.executeInvertBtn && elements.executeInvertBtn.disabled) return;
  if (!invertState.file || invertState.totalPages === 0) {
    alert('Please upload a PDF document first.');
    return;
  }

  if (!window.PDFLib || !window.pdfjsLib) {
    alert('PDF libraries are not loaded.');
    return;
  }

  elements.executeInvertBtn.disabled = true;
  invertState.isCancelled = false;
  if (elements.invertProgressContainer) elements.invertProgressContainer.classList.remove('hidden');
  if (elements.invertResultCard) elements.invertResultCard.classList.add('hidden');
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

    let rawFilename = (elements.invertOutputFilename ? elements.invertOutputFilename.value.trim() : '') || 'document_inverted';
    if (!rawFilename.toLowerCase().endsWith('.pdf')) {
      rawFilename += '.pdf';
    }
    if (elements.invertDownloadBtn) {
      elements.invertDownloadBtn.href = invertState.outputUrl;
      elements.invertDownloadBtn.download = rawFilename;
    }

    if (elements.invertResultSummary) {
      elements.invertResultSummary.textContent = `Successfully inverted ${pagesToInvertSet.size} of ${totalPages} pages (${formatBytes(invertState.outputBlob.size)}). Ready for printing!`;
    }
    if (elements.invertShareBtn && typeof navigator !== 'undefined' && navigator.share) {
      elements.invertShareBtn.classList.remove('hidden');
    }
    if (elements.invertResultCard) {
      elements.invertResultCard.classList.remove('hidden');
      elements.invertResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    trackToolUsage('invert_colors');
  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setInvertProgress(0, 'Document inversion cancelled.');
      return;
    }
    console.error('Error inverting PDF:', err);
    alert('Failed to invert PDF: ' + (err.message || 'Unknown error'));
  } finally {
    offCanvas.width = 0;
    offCanvas.height = 0;
    invertState.isCancelled = false;
    if (elements.executeInvertBtn) elements.executeInvertBtn.disabled = false;
    setTimeout(() => {
      if (elements.invertProgressContainer) elements.invertProgressContainer.classList.add('hidden');
    }, 800);
  }
}

function setInvertProgress(percent, text) {
  if (elements.invertProgressBar) elements.invertProgressBar.style.width = `${percent}%`;
  if (elements.progressPercent) elements.invertProgressPercent.textContent = `${percent}%`;
  if (elements.invertProgressText) elements.invertProgressText.textContent = text;
}

export function initInvertTab(switchTab) {
  const {
    invertDropzone,
    invertFileInput,
    invertChangeFileBtn,
    invertModeSelect,
    invertQualitySelect,
    invertPagesSelect,
    invertCustomRangeGroup,
    invertCustomPagesInput,
    invertPrevPageBtn,
    invertNextPageBtn,
    executeInvertBtn,
    invertCancelBtn,
    invertShareBtn,
    invertPreviewBtn,
    btnShowOriginal,
    btnShowInverted,
    invertDownloadBtn
  } = elements;

  if (invertDropzone && invertFileInput) {
    invertDropzone.addEventListener('click', () => invertFileInput.click());
    invertDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        invertFileInput.click();
      }
    });
    invertFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleInvertFileSelected(e.target.files[0]);
      }
    });

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

  if (invertChangeFileBtn) invertChangeFileBtn.addEventListener('click', resetInvertWorkspace);

  if (invertModeSelect) {
    invertModeSelect.addEventListener('change', (e) => {
      invertState.mode = e.target.value;
      updateInvertHint();
      updateInvertedPreviewCanvas();
    });
  }

  const invertModeCards = document.querySelectorAll('#invertWorkspace .preset-choice-card');
  invertModeCards.forEach((card) => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      if (!mode) return;
      invertState.mode = mode;
      invertModeCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      if (invertModeSelect) invertModeSelect.value = mode;
      updateInvertHint();
      updateInvertedPreviewCanvas();
    });
  });

  if (btnShowOriginal && btnShowInverted) {
    btnShowOriginal.addEventListener('click', () => {
      btnShowOriginal.classList.add('active');
      btnShowInverted.classList.remove('active');
      refreshInvertDisplay();
    });
    btnShowInverted.addEventListener('click', () => {
      btnShowInverted.classList.add('active');
      btnShowOriginal.classList.remove('active');
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
      if (invertState.pagesMode === 'custom') {
        if (invertCustomRangeGroup) invertCustomRangeGroup.classList.remove('hidden');
        if (invertCustomPagesInput) invertCustomPagesInput.focus();
      } else {
        if (invertCustomRangeGroup) invertCustomRangeGroup.classList.add('hidden');
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
      if (invertState.previewPageNum < (invertState.totalPages || 1)) {
        invertState.previewPageNum++;
        updateInvertNavButtons();
        renderInvertComparisonPreview();
      }
    });
  }

  if (executeInvertBtn) executeInvertBtn.addEventListener('click', executeInvertPdf);

  if (invertCancelBtn) {
    invertCancelBtn.addEventListener('click', () => {
      invertState.isCancelled = true;
      setInvertProgress(0, 'Cancelling document inversion...');
    });
  }

  if (invertShareBtn) {
    invertShareBtn.addEventListener('click', () => {
      handleSharePdf(invertState.outputBlob, (invertDownloadBtn && invertDownloadBtn.download) || 'document_inverted.pdf');
    });
  }

  if (invertPreviewBtn) {
    invertPreviewBtn.addEventListener('click', () => {
      if (invertState.outputUrl) {
        window.open(invertState.outputUrl, '_blank');
      }
    });
  }
}
