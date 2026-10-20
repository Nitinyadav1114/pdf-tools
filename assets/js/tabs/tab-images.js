/**
 * Tab 6: Images to PDF Converter
 * Converts multiple JPG, PNG, and WebP images into a single clean PDF document.
 */

import { imagesState } from '../core/state.js';
import { elements } from '../core/dom.js';
import {
  formatBytes,
  escapeHtml,
  handleSharePdf,
  trackToolUsage,
  showToast
} from '../core/utils.js';
import { isValidImageFile } from '../core/validators.js';
import { ensurePdfLibLoaded } from '../core/engine-loader.js';

export async function handleImageFilesAdded(fileList) {
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

  if (validImages.length > 0) {
    ensurePdfLibLoaded().catch(() => {});
  }

  if (invalidImages.length > 0 && validImages.length === 0) {
    showToast(`Security Warning: Excluded invalid or non-image files: [${invalidImages.join(', ')}]`, 'error');
    return;
  } else if (invalidImages.length > 0) {
    showToast(`Security Notice: Excluded invalid image file(s): ${invalidImages.join(', ')}`, 'info');
  }

  if (validImages.length === 0) {
    showToast('Please select valid image files (JPG, PNG, WebP, GIF, BMP).', 'warning');
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

export function renderImagesGrid() {
  const total = imagesState.images.length;
  if (total === 0) {
    if (elements.imagesDropzoneSection) elements.imagesDropzoneSection.classList.remove('hidden');
    if (elements.imagesManageSection) elements.imagesManageSection.classList.add('hidden');
    if (elements.imagesResultCard) elements.imagesResultCard.classList.add('hidden');
    return;
  }

  if (elements.imagesDropzoneSection) elements.imagesDropzoneSection.classList.add('hidden');
  if (elements.imagesManageSection) elements.imagesManageSection.classList.remove('hidden');

  const totalBytes = imagesState.images.reduce((sum, item) => sum + (item.size || 0), 0);
  if (elements.imagesCountBadge) elements.imagesCountBadge.textContent = `${total} image${total > 1 ? 's' : ''}`;
  if (elements.imagesSizeBadge) elements.imagesSizeBadge.textContent = `${formatBytes(totalBytes)} total`;

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

  if (elements.imagesGrid) {
    elements.imagesGrid.innerHTML = html;

    elements.imagesGrid.querySelectorAll('.btn-image-rotate').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        rotateImage(btn.dataset.id, 90);
      });
    });

    elements.imagesGrid.querySelectorAll('.btn-image-prev').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveImage(btn.dataset.id, -1);
      });
    });

    elements.imagesGrid.querySelectorAll('.btn-image-next').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveImage(btn.dataset.id, 1);
      });
    });

    elements.imagesGrid.querySelectorAll('.btn-image-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage(btn.dataset.id);
      });
    });
  }
}

export function rotateImage(id, delta = 90) {
  const item = imagesState.images.find((x) => x.id === id);
  if (!item) return;
  item.rotation = (item.rotation + delta) % 360;
  if (elements.imagesGrid) {
    const card = elements.imagesGrid.querySelector(`.image-card[data-id="${id}"]`);
    if (card) {
      const img = card.querySelector('.image-thumb');
      if (img) img.style.transform = `rotate(${item.rotation}deg)`;
    }
  }
}

export function rotateAllImages(delta = 90) {
  imagesState.images.forEach((item) => {
    item.rotation = (item.rotation + delta) % 360;
  });
  renderImagesGrid();
}

export function moveImage(id, direction) {
  const idx = imagesState.images.findIndex((x) => x.id === id);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= imagesState.images.length) return;
  const [moved] = imagesState.images.splice(idx, 1);
  imagesState.images.splice(targetIdx, 0, moved);
  renderImagesGrid();
}

export function removeImage(id) {
  const idx = imagesState.images.findIndex((x) => x.id === id);
  if (idx === -1) return;
  const [removed] = imagesState.images.splice(idx, 1);
  if (removed && removed.dataUrl) {
    URL.revokeObjectURL(removed.dataUrl);
  }
  renderImagesGrid();
}

export function clearAllImages() {
  imagesState.images.forEach((item) => {
    if (item.dataUrl) URL.revokeObjectURL(item.dataUrl);
  });
  imagesState.images = [];
  renderImagesGrid();
}

export async function executeImagesToPDF() {
  if (elements.executeImagesBtn && elements.executeImagesBtn.disabled) return;
  if (!imagesState.images || imagesState.images.length === 0) {
    showToast('Please add at least one image to convert.', 'warning');
    return;
  }

  imagesState.isCancelled = false;
  elements.executeImagesBtn.disabled = true;
  if (elements.imagesProgressContainer) elements.imagesProgressContainer.classList.remove('hidden');
  if (elements.imagesResultCard) elements.imagesResultCard.classList.add('hidden');
  setImagesProgress(0, 'Preparing PDF document...');

  const offCanvas = document.createElement('canvas');
  const ctx = offCanvas.getContext('2d');

  try {
    await ensurePdfLibLoaded().catch(() => {});
    if (!window.PDFLib) {
      throw new Error('PDF-Lib engine is not loaded.');
    }
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

    let filename = (elements.imagesOutputFilename ? elements.imagesOutputFilename.value.trim() : 'converted_images') || 'converted_images';
    if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

    if (elements.imagesDownloadBtn) {
      elements.imagesDownloadBtn.href = imagesState.outputUrl;
      elements.imagesDownloadBtn.download = filename;
    }
    if (elements.imagesResultSummary) {
      elements.imagesResultSummary.textContent = `Successfully converted ${total} image${total > 1 ? 's' : ''} into a ${formatBytes(pdfBytes.length)} PDF document.`;
    }

    if (elements.imagesShareBtn) {
      elements.imagesShareBtn.classList.remove('hidden');
    }
    if (elements.imagesResultCard) {
      elements.imagesResultCard.classList.remove('hidden');
      elements.imagesResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    trackToolUsage('images_to_pdf', 'used', total || (imagesState.images ? imagesState.images.length : 1));
  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setImagesProgress(0, 'Conversion cancelled.');
      return;
    }
    console.error('Error converting images to PDF:', err);
    showToast('Failed to convert images: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    offCanvas.width = 0;
    offCanvas.height = 0;
    imagesState.isCancelled = false;
    if (elements.executeImagesBtn) elements.executeImagesBtn.disabled = false;
    setTimeout(() => {
      if (elements.imagesProgressContainer) elements.imagesProgressContainer.classList.add('hidden');
    }, 800);
  }
}

function setImagesProgress(percent, text) {
  if (elements.imagesProgressBar) elements.imagesProgressBar.style.width = `${percent}%`;
  if (elements.imagesProgressPercent) elements.imagesProgressPercent.textContent = `${percent}%`;
  if (elements.imagesProgressText) elements.imagesProgressText.textContent = text;
}

export function initImagesTab(switchTab, handleCompressFileSelected) {
  const {
    imagesDropzone,
    imagesFileInput,
    imagesRotateAllBtn,
    imagesAddMoreBtn,
    imagesClearAllBtn,
    imagesOrientationSelect,
    imagesMarginSelect,
    imagesFitSelect,
    executeImagesBtn,
    imagesCancelBtn,
    imagesShareBtn,
    imagesPreviewBtn,
    imagesSendToCompressBtn,
    imagesDownloadBtn,
    imagesOutputFilename
  } = elements;

  if (window.Sortable && elements.imagesGrid) {
    new Sortable(elements.imagesGrid, {
      animation: 200,
      handle: '.image-thumb-wrapper, .image-card-meta',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      filter: '.btn-image-action',
      preventOnFilter: false,
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      onEnd: () => {
        const domIds = Array.from(elements.imagesGrid.children).map((card) => card.dataset.id);
        imagesState.images.sort((a, b) => domIds.indexOf(a.id) - domIds.indexOf(b.id));
        renderImagesGrid();
      },
    });
  }

  if (imagesDropzone && imagesFileInput) {
    imagesDropzone.addEventListener('mouseenter', () => ensurePdfLibLoaded().catch(() => {}), { once: true, passive: true });
    imagesDropzone.addEventListener('click', () => imagesFileInput.click());
    imagesDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        imagesFileInput.click();
      }
    });
    imagesFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleImageFilesAdded(e.target.files);
        imagesFileInput.value = '';
      }
    });

    let imagesDragCounter = 0;
    imagesDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensurePdfLibLoaded().catch(() => {});
      imagesDragCounter++;
      imagesDropzone.classList.add('drag-active');
    });

    imagesDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    imagesDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      imagesDragCounter = Math.max(0, imagesDragCounter - 1);
      if (imagesDragCounter === 0) {
        imagesDropzone.classList.remove('drag-active');
      }
    });

    imagesDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      imagesDragCounter = 0;
      imagesDropzone.classList.remove('drag-active');
    });

    imagesDropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleImageFilesAdded(e.dataTransfer.files);
      }
    });
  }

  if (imagesRotateAllBtn) imagesRotateAllBtn.addEventListener('click', () => rotateAllImages(90));
  if (imagesAddMoreBtn && imagesFileInput) imagesAddMoreBtn.addEventListener('click', () => imagesFileInput.click());
  if (imagesClearAllBtn) {
    imagesClearAllBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to remove all images?')) {
        clearAllImages();
      }
    });
  }

  const imagesPageSizeCards = document.querySelectorAll('#imagesPageSizeGrid .preset-choice-card');
  imagesPageSizeCards.forEach((card) => {
    card.addEventListener('click', () => {
      const size = card.dataset.size;
      if (!size) return;
      imagesState.pageSize = size;
      imagesPageSizeCards.forEach((c) => c.classList.remove('active'));
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

  if (executeImagesBtn) executeImagesBtn.addEventListener('click', executeImagesToPDF);

  if (imagesCancelBtn) {
    imagesCancelBtn.addEventListener('click', () => {
      imagesState.isCancelled = true;
      setImagesProgress(0, 'Cancelling image conversion...');
    });
  }

  if (imagesShareBtn) {
    imagesShareBtn.addEventListener('click', () => {
      handleSharePdf(imagesState.outputBlob, (imagesDownloadBtn && imagesDownloadBtn.download) || 'converted_images.pdf');
    });
  }

  if (imagesPreviewBtn) {
    imagesPreviewBtn.addEventListener('click', () => {
      if (imagesState.outputUrl) {
        window.open(imagesState.outputUrl, '_blank');
      }
    });
  }

  if (imagesSendToCompressBtn) {
    imagesSendToCompressBtn.addEventListener('click', () => {
      if (!imagesState.outputBlob) return;
      let baseName = (imagesOutputFilename ? imagesOutputFilename.value.trim() : 'converted_images') || 'converted_images';
      if (!baseName.toLowerCase().endsWith('.pdf')) baseName += '.pdf';
      const file = new File([imagesState.outputBlob], baseName, {
        type: 'application/pdf',
        lastModified: Date.now(),
      });
      if (typeof switchTab === 'function') switchTab('compress');
      if (typeof handleCompressFileSelected === 'function') handleCompressFileSelected(file);
    });
  }
}
