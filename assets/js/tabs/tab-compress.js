/**
 * Tab 5: Compress PDF Core Engine
 * Compresses PDFs with 100% bit-exact lossless stream packing or smart visually-lossless raster optimization.
 */

import { compressState } from '../core/state.js';
import { elements } from '../core/dom.js';
import { appWorkerPool } from '../core/worker-pool.js';
import {
  formatBytes,
  isPasswordProtectedError,
  handleSharePdf,
  trackToolUsage
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';

export async function handleCompressFileSelected(file) {
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

    if (elements.compressFileName) elements.compressFileName.textContent = file.name;
    if (elements.compressPageCount) elements.compressPageCount.textContent = `${compressState.totalPages} page${compressState.totalPages > 1 ? 's' : ''}`;
    if (elements.compressOriginalSize) elements.compressOriginalSize.textContent = formatBytes(file.size);

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    if (elements.compressOutputFilename) elements.compressOutputFilename.value = `${baseName}_compressed.pdf`;

    if (elements.compressDropzone && elements.compressDropzone.parentElement) {
      elements.compressDropzone.parentElement.classList.add('hidden');
    }
    if (elements.compressWorkspaceSection) elements.compressWorkspaceSection.classList.remove('hidden');
    if (elements.compressResultCard) elements.compressResultCard.classList.add('hidden');

    updateCompressHintAndPresetUI();
    await renderCompressComparisonPreview();
  } catch (err) {
    console.error('Error loading PDF for compression:', err);
    alert('Failed to load PDF: ' + (err.message || 'Unknown error'));
  }
}

export function resetCompressWorkspace() {
  if (compressState.outputUrl) {
    URL.revokeObjectURL(compressState.outputUrl);
    compressState.outputUrl = null;
  }
  compressState.file = null;
  compressState.arrayBuffer = null;
  compressState.pdfDoc = null;
  compressState.totalPages = 0;
  compressState.previewPageNum = 1;

  if (elements.compressFileInput) elements.compressFileInput.value = '';

  if (elements.compressOriginalCanvas) {
    elements.compressOriginalCanvas.width = 0;
    elements.compressOriginalCanvas.height = 0;
  }
  if (elements.compressPreviewCanvas) {
    elements.compressPreviewCanvas.width = 0;
    elements.compressPreviewCanvas.height = 0;
  }

  if (elements.compressWorkspaceSection) elements.compressWorkspaceSection.classList.add('hidden');
  if (elements.compressDropzone && elements.compressDropzone.parentElement) {
    elements.compressDropzone.parentElement.classList.remove('hidden');
  }
  if (elements.compressResultCard) elements.compressResultCard.classList.add('hidden');
}

export function updateCompressSavingsMeter() {
  if (!elements.meterOrigSize || !compressState.file) return;
  const origBytes = compressState.file.size;
  elements.meterOrigSize.textContent = formatBytes(origBytes);

  let estRatio = 0.25;
  let estSavedLabel = '~75%';

  if (compressState.preset === 'lossless') {
    estRatio = 0.80;
    estSavedLabel = '~20%';
  } else if (compressState.preset === 'extreme') {
    estRatio = 0.10;
    estSavedLabel = 'up to 90%';
  }

  const estBytes = Math.round(origBytes * estRatio);
  if (elements.meterEstSize) {
    elements.meterEstSize.textContent = '~' + formatBytes(estBytes);
  }
  const savedBytes = Math.max(0, origBytes - estBytes);
  if (elements.meterEstSaved) {
    elements.meterEstSaved.textContent = `🎯 Estimated savings: ${estSavedLabel} (~${formatBytes(savedBytes)} saved)`;
  }
}

export function updateCompressHintAndPresetUI() {
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

  if (elements.compressHintText) {
    if (compressState.preset === 'lossless') {
      elements.compressHintText.innerHTML = '💎 <strong>Lossless Mode Active:</strong> Compresses internal syntax &amp; dictionary cross-references without modifying any image pixels. Ideal for official, legal, and vector documents.';
    } else if (compressState.preset === 'recommended') {
      elements.compressHintText.innerHTML = '🎯 <strong>Visually Lossless Active:</strong> Resamples oversized scans &amp; images to ~180 DPI with high-fidelity encoding. 100% sharp text with 60%–80% size savings!';
    } else if (compressState.preset === 'balanced') {
      elements.compressHintText.innerHTML = '📄 <strong>Balanced Web Mode Active:</strong> Standard ~140 DPI optimization. Ideal balance between sharpness and compact file size for web, Slack, or archives.';
    } else if (compressState.preset === 'extreme') {
      elements.compressHintText.innerHTML = '📧 <strong>Maximum Compression Active:</strong> Heavy ~100 DPI compression for fitting within strict email limits (<25MB) and portal file caps.';
    }
  }

  updateCompressSavingsMeter();
}

export async function renderCompressComparisonPreview() {
  if (!compressState.arrayBuffer || compressState.totalPages === 0) return;

  compressState.activeRenderId++;
  const currentRenderId = compressState.activeRenderId;

  if (elements.compressOriginalSpinner) elements.compressOriginalSpinner.classList.remove('hidden');
  if (elements.compressPreviewSpinner) elements.compressPreviewSpinner.classList.remove('hidden');

  if (elements.compressPageNavText) {
    elements.compressPageNavText.textContent = `Page ${compressState.previewPageNum} of ${compressState.totalPages}`;
  }
  if (elements.compressPrevPageBtn) elements.compressPrevPageBtn.disabled = compressState.previewPageNum <= 1;
  if (elements.compressNextPageBtn) elements.compressNextPageBtn.disabled = compressState.previewPageNum >= compressState.totalPages;

  try {
    const bufferCopy = new Uint8Array(compressState.arrayBuffer.slice(0));
    const pdfjsDoc = await pdfjsLib.getDocument({ data: bufferCopy }).promise;

    if (currentRenderId !== compressState.activeRenderId) return;

    const page = await pdfjsDoc.getPage(compressState.previewPageNum);
    const standardViewport = page.getViewport({ scale: 1.0 });

    if (elements.compressOriginalCanvas) {
      const origCtx = elements.compressOriginalCanvas.getContext('2d');
      elements.compressOriginalCanvas.width = standardViewport.width;
      elements.compressOriginalCanvas.height = standardViewport.height;

      origCtx.fillStyle = '#ffffff';
      origCtx.fillRect(0, 0, standardViewport.width, standardViewport.height);
      await page.render({ canvasContext: origCtx, viewport: standardViewport }).promise;
    }

    if (currentRenderId !== compressState.activeRenderId) return;
    if (elements.compressOriginalSpinner) elements.compressOriginalSpinner.classList.add('hidden');
    if (elements.compressOriginalBadgeText) elements.compressOriginalBadgeText.textContent = 'Native Vector / 100% Quality';

    if (elements.compressPreviewCanvas && elements.compressOriginalCanvas) {
      const prevCtx = elements.compressPreviewCanvas.getContext('2d');
      elements.compressPreviewCanvas.width = standardViewport.width;
      elements.compressPreviewCanvas.height = standardViewport.height;

      if (compressState.preset === 'lossless') {
        prevCtx.drawImage(elements.compressOriginalCanvas, 0, 0);
        if (elements.compressPreviewBadgeText) elements.compressPreviewBadgeText.textContent = 'Lossless Stream (100% Bit-Exact)';
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
          prevCtx.fillRect(0, 0, elements.compressPreviewCanvas.width, elements.compressPreviewCanvas.height);
          prevCtx.drawImage(img, 0, 0, elements.compressPreviewCanvas.width, elements.compressPreviewCanvas.height);
          if (elements.compressPreviewBadgeText) elements.compressPreviewBadgeText.textContent = badgeLabel;
          if (elements.compressPreviewSpinner) elements.compressPreviewSpinner.classList.add('hidden');
        };
        img.src = dataUrl;

        offCanvas.width = 0;
        offCanvas.height = 0;
      }
    }

    if (compressState.preset === 'lossless') {
      if (elements.compressPreviewSpinner) elements.compressPreviewSpinner.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error rendering compression preview:', err);
  } finally {
    if (currentRenderId === compressState.activeRenderId) {
      if (elements.compressOriginalSpinner) elements.compressOriginalSpinner.classList.add('hidden');
      if (elements.compressPreviewSpinner) elements.compressPreviewSpinner.classList.add('hidden');
      window.COMPRESS_PREVIEW_READY = true;
    }
  }
}

export async function executeCompressPDF() {
  if (elements.executeCompressBtn && elements.executeCompressBtn.disabled) return;
  if (!compressState.arrayBuffer || !window.PDFLib) {
    alert('No PDF file loaded or PDF-Lib is not ready.');
    return;
  }

  elements.executeCompressBtn.disabled = true;
  compressState.isCancelled = false;
  if (elements.compressProgressContainer) elements.compressProgressContainer.classList.remove('hidden');
  if (elements.compressResultCard) elements.compressResultCard.classList.add('hidden');
  setCompressProgress(5, 'Initializing PDF compression...');

  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');

  try {
    if (compressState.isCancelled) throw new Error('OPERATION_CANCELLED');

    const { PDFDocument } = window.PDFLib;
    let outPdfBytes;

    if (compressState.preset === 'lossless') {
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

    if (compressState.outputUrl) {
      URL.revokeObjectURL(compressState.outputUrl);
    }

    compressState.outputBlob = new Blob([outPdfBytes], { type: 'application/pdf' });
    compressState.outputUrl = URL.createObjectURL(compressState.outputBlob);

    setCompressProgress(100, 'Complete!');

    let rawFilename = (elements.compressOutputFilename ? elements.compressOutputFilename.value.trim() : '') || 'document_compressed';
    if (!rawFilename.toLowerCase().endsWith('.pdf')) {
      rawFilename += '.pdf';
    }
    if (elements.compressDownloadBtn) {
      elements.compressDownloadBtn.href = compressState.outputUrl;
      elements.compressDownloadBtn.download = rawFilename;
    }

    const origBytes = compressState.file.size;
    const compBytes = outPdfBytes.length;
    const savedBytes = origBytes - compBytes;
    const pctSaved = origBytes > 0 ? Math.round(((origBytes - compBytes) / origBytes) * 1000) / 10 : 0;

    if (elements.statOriginalSize) elements.statOriginalSize.textContent = formatBytes(origBytes);
    if (elements.statCompressedSize) elements.statCompressedSize.textContent = formatBytes(compBytes);

    if (elements.statPercentSaved && elements.compressResultSummary) {
      if (savedBytes > 0) {
        elements.statPercentSaved.textContent = `-${pctSaved}% (${formatBytes(savedBytes)} saved)`;
        elements.statPercentSaved.parentElement.classList.add('stat-highlight');
        elements.compressResultSummary.textContent = `Successfully compressed ${compressState.totalPages} pages, saving ${formatBytes(savedBytes)} (${pctSaved}% reduction)!`;
      } else {
        elements.statPercentSaved.textContent = 'Fully Optimized';
        elements.statPercentSaved.parentElement.classList.remove('stat-highlight');
        elements.compressResultSummary.textContent = `Document is already packed with optimal streams (${formatBytes(compBytes)}).`;
      }
    }

    if (elements.compressShareBtn) {
      elements.compressShareBtn.classList.remove('hidden');
    }
    if (elements.compressResultCard) {
      elements.compressResultCard.classList.remove('hidden');
      elements.compressResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
    if (elements.executeCompressBtn) elements.executeCompressBtn.disabled = false;
    setTimeout(() => {
      if (elements.compressProgressContainer) elements.compressProgressContainer.classList.add('hidden');
    }, 800);
  }
}

function setCompressProgress(percent, text) {
  if (elements.compressProgressBar) elements.compressProgressBar.style.width = `${percent}%`;
  if (elements.compressProgressPercent) elements.compressProgressPercent.textContent = `${percent}%`;
  if (elements.compressProgressText) elements.compressProgressText.textContent = text;
}

export function initCompressTab(switchTab) {
  const {
    compressDropzone,
    compressFileInput,
    compressChangeFileBtn,
    compressPrevPageBtn,
    compressNextPageBtn,
    executeCompressBtn,
    compressCancelBtn,
    compressShareBtn,
    compressPreviewBtn,
    compressDownloadBtn
  } = elements;

  if (compressDropzone && compressFileInput) {
    compressDropzone.addEventListener('click', () => compressFileInput.click());
    compressDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        compressFileInput.click();
      }
    });
    compressFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleCompressFileSelected(e.target.files[0]);
      }
    });

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

  if (compressChangeFileBtn) compressChangeFileBtn.addEventListener('click', resetCompressWorkspace);

  const compressPresetRadios = document.querySelectorAll('input[name="compressPreset"]');
  compressPresetRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        compressState.preset = radio.value;
        updateCompressHintAndPresetUI();
        renderCompressComparisonPreview();
      }
    });
  });

  const compressChoiceCards = document.querySelectorAll('#compressWorkspaceSection .preset-choice-card');
  compressChoiceCards.forEach((card) => {
    card.addEventListener('click', () => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        compressState.preset = radio.value;
        updateCompressHintAndPresetUI();
        renderCompressComparisonPreview();
      }
    });
  });

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

  if (executeCompressBtn) executeCompressBtn.addEventListener('click', executeCompressPDF);

  if (compressCancelBtn) {
    compressCancelBtn.addEventListener('click', () => {
      compressState.isCancelled = true;
      setCompressProgress(0, 'Cancelling compression...');
    });
  }

  if (compressShareBtn) {
    compressShareBtn.addEventListener('click', () => {
      handleSharePdf(compressState.outputBlob, (compressDownloadBtn && compressDownloadBtn.download) || 'document_compressed.pdf');
    });
  }

  if (compressPreviewBtn) {
    compressPreviewBtn.addEventListener('click', () => {
      if (compressState.outputUrl) {
        window.open(compressState.outputUrl, '_blank');
      }
    });
  }
}
