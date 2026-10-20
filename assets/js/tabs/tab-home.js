/**
 * Home / Tool Hub Landing Page Logic
 * Orchestrates the all-tools visual grid, universal dropzone,
 * and smart tool router modal.
 */

import { elements } from '../core/dom.js';
import { formatBytes, trackToolUsage, showToast } from '../core/utils.js';
import { isValidPdfFile, isValidImageFile } from '../core/validators.js';
import { ensureAllPdfEngines, preloadEngineForTool } from '../core/engine-loader.js';

let pendingFile = null;

export function initHomeTab(switchTab, handlers = {}) {
  const {
    handleMergeFilesAdded,
    handleCompressFileSelected,
    handleRemoveFileSelected,
    handleSplitFileSelected,
    handleSlidesFileSelected,
    handleInvertFileSelected,
    handlePdfToImagesFileSelected,
    handleImageFilesAdded
  } = handlers;

  const homeDropzone = elements.homeDropzone;
  const homeFileInput = elements.homeFileInput;
  const modal = document.getElementById('homeUniversalModal');
  const modalCloseBtn = document.getElementById('closeHomeModalBtn');
  const modalFileName = document.getElementById('homeModalFileName');
  const modalFileSize = document.getElementById('homeModalFileSize');

  function openUniversalModal(file) {
    pendingFile = file;
    ensureAllPdfEngines().catch(() => {});
    if (modalFileName) modalFileName.textContent = file.name;
    if (modalFileSize) modalFileSize.textContent = formatBytes(file.size);
    if (modal) modal.classList.remove('hidden');
  }

  function closeUniversalModal() {
    pendingFile = null;
    if (modal) modal.classList.add('hidden');
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeUniversalModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeUniversalModal();
    });
  }

  async function routeDroppedFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;

    // Check if image files
    const imageFiles = files.filter(f => /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name) || f.type.startsWith('image/'));
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');

    if (imageFiles.length === 0 && pdfFiles.length === 0) {
      showToast('Please upload valid PDF documents or images (JPG, PNG, WebP).', 'warning');
      return;
    }

    if (imageFiles.length > 0 && pdfFiles.length === 0) {
      if (typeof handleImageFilesAdded === 'function') {
        handleImageFilesAdded(imageFiles);
      }
      if (typeof switchTab === 'function') switchTab('images');
      return;
    }

    if (pdfFiles.length >= 2) {
      // Multiple PDFs -> default to Merge
      if (typeof handleMergeFilesAdded === 'function') {
        handleMergeFilesAdded(pdfFiles);
      }
      if (typeof switchTab === 'function') switchTab('merge');
      return;
    }

    if (pdfFiles.length === 1) {
      const file = pdfFiles[0];
      const isGenuine = await isValidPdfFile(file);
      if (!isGenuine) {
        showToast(`Security Warning: "${file.name}" is not a genuine PDF document. Upload rejected.`, 'error');
        return;
      }
      openUniversalModal(file);
    }
  }

  // Setup Home Universal Dropzone
  if (homeDropzone && homeFileInput) {
    homeDropzone.addEventListener('mouseenter', () => ensureAllPdfEngines().catch(() => {}), { once: true, passive: true });
    homeDropzone.addEventListener('click', (e) => {
      if (e.target.closest('.browse-link') || e.target === homeDropzone || homeDropzone.contains(e.target)) {
        homeFileInput.click();
      }
    });

    homeFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        routeDroppedFiles(e.target.files);
        homeFileInput.value = '';
      }
    });

    let homeDragCounter = 0;
    homeDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureAllPdfEngines().catch(() => {});
      homeDragCounter++;
      homeDropzone.classList.add('drag-active');
    });

    homeDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    homeDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      homeDragCounter = Math.max(0, homeDragCounter - 1);
      if (homeDragCounter === 0) {
        homeDropzone.classList.remove('drag-active');
      }
    });

    homeDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      homeDragCounter = 0;
      homeDropzone.classList.remove('drag-active');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        routeDroppedFiles(e.dataTransfer.files);
      }
    });
  }

  // Universal Modal Action Buttons
  const actionConfigs = [
    { id: 'homeActionMerge', tab: 'merge', handler: (f) => handleMergeFilesAdded && handleMergeFilesAdded([f]) },
    { id: 'homeActionCompress', tab: 'compress', handler: (f) => handleCompressFileSelected && handleCompressFileSelected(f) },
    { id: 'homeActionRemove', tab: 'remove', handler: (f) => handleRemoveFileSelected && handleRemoveFileSelected(f) },
    { id: 'homeActionSplit', tab: 'split', handler: (f) => handleSplitFileSelected && handleSplitFileSelected(f) },
    { id: 'homeActionPdfToImages', tab: 'pdftoimages', handler: (f) => handlePdfToImagesFileSelected && handlePdfToImagesFileSelected(f) },
    { id: 'homeActionInvert', tab: 'invert', handler: (f) => handleInvertFileSelected && handleInvertFileSelected(f) },
    { id: 'homeActionSlides', tab: 'slides', handler: (f) => handleSlidesFileSelected && handleSlidesFileSelected(f) },
  ];

  actionConfigs.forEach(({ id, tab, handler }) => {
    const btn = document.getElementById(id);
    if (btn) {
      ['mouseenter', 'focus'].forEach(evt => {
        btn.addEventListener(evt, () => preloadEngineForTool(tab), { once: true, passive: true });
      });

      btn.addEventListener('click', () => {
        const fileToProcess = pendingFile;
        closeUniversalModal();
        if (fileToProcess && typeof handler === 'function') {
          handler(fileToProcess);
        }
        if (typeof switchTab === 'function') {
          switchTab(tab);
        }
      });
    }
  });

  // Delegated launcher listener for all [data-launch-tab] buttons and cards
  document.addEventListener('mouseover', (e) => {
    const launcher = e.target.closest('[data-launch-tab]');
    if (launcher && launcher.dataset.launchTab) {
      preloadEngineForTool(launcher.dataset.launchTab);
    }
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const launcher = e.target.closest('[data-launch-tab]');
    if (launcher && launcher.dataset.launchTab) {
      e.preventDefault();
      const targetTab = launcher.dataset.launchTab;
      if (typeof switchTab === 'function') {
        switchTab(targetTab);
      }
    }
  });

  // 3D Perspective Tilt & Cursor Spotlight Tracking (60/120 FPS Throttled)
  const supportsHover = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (supportsHover && !prefersReducedMotion) {
    const toolCards = document.querySelectorAll('.home-tool-card');
    toolCards.forEach(card => {
      let rect = null;
      let rafId = null;

      card.addEventListener('mouseenter', () => {
        rect = card.getBoundingClientRect();
      }, { passive: true });

      card.addEventListener('mousemove', (e) => {
        if (!rect) rect = card.getBoundingClientRect();
        if (rafId) return;

        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (!rect) return;
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotateX = ((y - centerY) / centerY) * -5;
          const rotateY = ((x - centerX) / centerX) * 5;
          card.style.setProperty('--mouse-x', `${((x / rect.width) * 100).toFixed(1)}%`);
          card.style.setProperty('--mouse-y', `${((y / rect.height) * 100).toFixed(1)}%`);
          card.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
        });
      }, { passive: true });

      card.addEventListener('mouseleave', () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        rect = null;
        card.style.transform = '';
        card.style.setProperty('--mouse-x', '50%');
        card.style.setProperty('--mouse-y', '0%');
      }, { passive: true });
    });
  }
}
