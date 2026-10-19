/**
 * Tab 3: Slides to A4 Handout Logic
 * Generates compact multi-slide A4 print handouts with notes and customizable margins.
 */

import { slidesState } from '../core/state.js';
import { elements } from '../core/dom.js';
import {
  formatBytes,
  isPasswordProtectedError,
  handleSharePdf,
  trackToolUsage
} from '../core/utils.js';
import { isValidPdfFile } from '../core/validators.js';
import { ensureAllPdfEngines, ensurePdfLibLoaded } from '../core/engine-loader.js';

export const MARGIN_CONFIG = {
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

export async function handleSlidesFileSelected(file) {
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
  if (elements.slidesResultCard) elements.slidesResultCard.classList.add('hidden');
  if (elements.slidesProgressContainer) elements.slidesProgressContainer.classList.add('hidden');

  if (elements.slidesFileName) elements.slidesFileName.textContent = file.name;
  if (elements.slidesFileSubtext) elements.slidesFileSubtext.textContent = `Loading presentation • ${formatBytes(file.size)}...`;

  const baseName = file.name.replace(/\.pdf$/i, '');
  if (elements.slidesOutputFilename) elements.slidesOutputFilename.value = `${baseName}_A4_handout`;

  if (elements.slidesDropzoneSection) elements.slidesDropzoneSection.classList.add('hidden');
  if (elements.slidesWorkspace) elements.slidesWorkspace.classList.remove('hidden');

  try {
    slidesState.arrayBuffer = await file.arrayBuffer();

    await ensureAllPdfEngines().catch(() => {});
    if (window.PDFLib) {
      const srcDoc = await PDFLib.PDFDocument.load(slidesState.arrayBuffer, { ignoreEncryption: true });
      slidesState.totalSlides = srcDoc.getPageCount();
    }

    if (slidesState.totalSlides === 0) {
      throw new Error('Presentation contains no slides.');
    }

    if (elements.slidesFileSubtext) {
      elements.slidesFileSubtext.textContent = `${slidesState.totalSlides} ${slidesState.totalSlides === 1 ? 'slide' : 'slides'} total • ${formatBytes(file.size)}`;
    }

    updateSlidesCalculation();
    renderA4SheetPreview();

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

export function resetSlidesWorkspace() {
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
  if (elements.slidesFileInput) elements.slidesFileInput.value = '';
  if (elements.slidesWorkspace) elements.slidesWorkspace.classList.add('hidden');
  if (elements.slidesDropzoneSection) elements.slidesDropzoneSection.classList.remove('hidden');
  if (elements.slidesResultCard) elements.slidesResultCard.classList.add('hidden');
}

export function getSlidesPerPageCount() {
  if (slidesState.layout === '2-centered') return 2;
  if (slidesState.layout === '4-grid') return 4;
  if (slidesState.layout === '6-grid') return 6;
  return 3;
}

export function updateSlidesCalculation() {
  const slidesPerPage = getSlidesPerPageCount();
  const total = slidesState.totalSlides;
  if (total === 0) return;

  const totalA4Pages = Math.ceil(total / slidesPerPage);
  if (elements.slidesCalcText) {
    elements.slidesCalcText.innerHTML = `📊 <strong>${total} slides</strong> will fit onto <strong>${totalA4Pages} A4 pages</strong> (${slidesPerPage} slides per page).`;
  }
  if (elements.previewPageIndicator) {
    elements.previewPageIndicator.textContent = `Shows first ${Math.min(slidesPerPage, total)} slides`;
  }
}

export function renderA4SheetPreview() {
  if (!elements.a4SheetPreview) return;
  elements.a4SheetPreview.innerHTML = '';

  const layout = slidesState.layout;
  const margin = slidesState.margin || 'narrow';
  const marginCfg = MARGIN_CONFIG[margin] || MARGIN_CONFIG.narrow;

  elements.a4SheetPreview.style.padding = marginCfg.previewPadding;

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
      elements.a4SheetPreview.appendChild(slot);
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
      elements.a4SheetPreview.appendChild(slot);
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
      elements.a4SheetPreview.appendChild(slot);
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
    elements.a4SheetPreview.appendChild(grid);
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
    elements.a4SheetPreview.appendChild(grid);
  }
}

export async function executeGenerateSlidesA4() {
  if (elements.executeSlidesBtn && elements.executeSlidesBtn.disabled) return;
  if (!slidesState.file || slidesState.totalSlides === 0) {
    alert('Please upload a presentation PDF first.');
    return;
  }

  await ensurePdfLibLoaded().catch(() => {});
  if (!window.PDFLib) {
    alert('PDF-Lib is not loaded.');
    return;
  }

  elements.executeSlidesBtn.disabled = true;
  slidesState.isCancelled = false;
  if (elements.slidesProgressContainer) elements.slidesProgressContainer.classList.remove('hidden');
  if (elements.slidesResultCard) elements.slidesResultCard.classList.add('hidden');
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

    let rawFilename = (elements.slidesOutputFilename ? elements.slidesOutputFilename.value.trim() : '') || 'presentation_A4_handout';
    if (!rawFilename.toLowerCase().endsWith('.pdf')) {
      rawFilename += '.pdf';
    }
    if (elements.slidesDownloadBtn) {
      elements.slidesDownloadBtn.href = slidesState.outputUrl;
      elements.slidesDownloadBtn.download = rawFilename;
    }

    if (elements.slidesResultSummary) {
      elements.slidesResultSummary.textContent = `Formatted ${totalSlides} slides onto ${totalA4Pages} A4 pages (${formatBytes(slidesState.outputBlob.size)}).`;
    }
    if (elements.slidesShareBtn) {
      elements.slidesShareBtn.classList.remove('hidden');
    }
    if (elements.slidesResultCard) {
      elements.slidesResultCard.classList.remove('hidden');
      elements.slidesResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
    if (elements.executeSlidesBtn) elements.executeSlidesBtn.disabled = false;
    setTimeout(() => {
      if (elements.slidesProgressContainer) elements.slidesProgressContainer.classList.add('hidden');
    }, 800);
  }
}

function setSlidesProgress(percent, text) {
  if (elements.slidesProgressBar) elements.slidesProgressBar.style.width = `${percent}%`;
  if (elements.slidesProgressPercent) elements.slidesProgressPercent.textContent = `${percent}%`;
  if (elements.slidesProgressText) elements.slidesProgressText.textContent = text;
}

export function initSlidesTab(switchTab, handleInvertFileSelected) {
  const {
    slidesDropzone,
    slidesFileInput,
    slidesPerLayoutSelect,
    marginSelect,
    slideBorderCheckbox,
    slideNumbersCheckbox,
    slidesChangeFileBtn,
    executeSlidesBtn,
    slidesCancelBtn,
    slidesShareBtn,
    slidesPreviewBtn,
    slidesSendToInvertBtn,
    slidesDownloadBtn,
    slidesOutputFilename
  } = elements;

  if (slidesDropzone && slidesFileInput) {
    slidesDropzone.addEventListener('mouseenter', () => ensureAllPdfEngines().catch(() => {}), { once: true, passive: true });
    slidesDropzone.addEventListener('click', () => slidesFileInput.click());
    slidesDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        slidesFileInput.click();
      }
    });
    slidesFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSlidesFileSelected(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      slidesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureAllPdfEngines().catch(() => {});
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
  }

  if (slidesPerLayoutSelect) {
    slidesPerLayoutSelect.addEventListener('change', (e) => {
      slidesState.layout = e.target.value;
      updateSlidesCalculation();
      renderA4SheetPreview();
    });
  }

  if (marginSelect) {
    marginSelect.addEventListener('change', (e) => {
      slidesState.margin = e.target.value;
      renderA4SheetPreview();
    });
  }

  if (slideBorderCheckbox) {
    slideBorderCheckbox.addEventListener('change', (e) => {
      slidesState.slideBorder = e.target.checked;
      renderA4SheetPreview();
    });
  }

  if (slideNumbersCheckbox) {
    slideNumbersCheckbox.addEventListener('change', (e) => {
      slidesState.slideNumbers = e.target.checked;
      renderA4SheetPreview();
    });
  }

  if (slidesChangeFileBtn) slidesChangeFileBtn.addEventListener('click', resetSlidesWorkspace);
  if (executeSlidesBtn) executeSlidesBtn.addEventListener('click', executeGenerateSlidesA4);

  if (slidesCancelBtn) {
    slidesCancelBtn.addEventListener('click', () => {
      slidesState.isCancelled = true;
      setSlidesProgress(0, 'Cancelling handout generation...');
    });
  }

  if (slidesShareBtn) {
    slidesShareBtn.addEventListener('click', () => {
      handleSharePdf(slidesState.outputBlob, (slidesDownloadBtn && slidesDownloadBtn.download) || 'presentation_A4_handout.pdf');
    });
  }

  if (slidesPreviewBtn) {
    slidesPreviewBtn.addEventListener('click', () => {
      if (slidesState.outputUrl) {
        window.open(slidesState.outputUrl, '_blank');
      }
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
      if (typeof switchTab === 'function') switchTab('invert');
      if (typeof handleInvertFileSelected === 'function') handleInvertFileSelected(file);
    });
  }
}
