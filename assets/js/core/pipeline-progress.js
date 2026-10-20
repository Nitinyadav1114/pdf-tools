/**
 * PDF Tools - Step-by-Step Pipeline Progress Indicator
 * Enhances progress bars with modern multi-stage milestone steppers,
 * shimmering progress glow, and dynamic pipeline stage counters.
 */

export const PIPELINE_CONFIGS = {
  merge: {
    containerId: 'progressContainer',
    barId: 'progressBar',
    percentId: 'progressPercent',
    textId: 'progressText',
    stages: [
      { name: 'Read & Parse', threshold: 25 },
      { name: 'Merge Pages', threshold: 80 },
      { name: 'Finalize PDF', threshold: 100 }
    ]
  },
  remove: {
    containerId: 'removeProgressContainer',
    barId: 'removeProgressBar',
    percentId: 'removeProgressPercent',
    textId: 'removeProgressText',
    stages: [
      { name: 'Parse Structure', threshold: 20 },
      { name: 'Filter & Rotate', threshold: 80 },
      { name: 'Export Clean PDF', threshold: 100 }
    ]
  },
  slides: {
    containerId: 'slidesProgressContainer',
    barId: 'slidesProgressBar',
    percentId: 'slidesProgressPercent',
    textId: 'slidesProgressText',
    stages: [
      { name: 'Rasterize Slides', threshold: 35 },
      { name: 'A4 Grid Layout', threshold: 80 },
      { name: 'Compile Handout', threshold: 100 }
    ]
  },
  invert: {
    containerId: 'invertProgressContainer',
    barId: 'invertProgressBar',
    percentId: 'invertProgressPercent',
    textId: 'invertProgressText',
    stages: [
      { name: 'Analyze Contrast', threshold: 20 },
      { name: 'Invert Matrix', threshold: 85 },
      { name: 'Rebuild PDF', threshold: 100 }
    ]
  },
  compress: {
    containerId: 'compressProgressContainer',
    barId: 'compressProgressBar',
    percentId: 'compressProgressPercent',
    textId: 'compressProgressText',
    stages: [
      { name: 'Analyze Streams', threshold: 25 },
      { name: 'Optimize & DPI', threshold: 85 },
      { name: 'Save Output', threshold: 100 }
    ]
  },
  images: {
    containerId: 'imagesProgressContainer',
    barId: 'imagesProgressBar',
    percentId: 'imagesProgressPercent',
    textId: 'imagesProgressText',
    stages: [
      { name: 'Decode Photos', threshold: 30 },
      { name: 'Fit & Orient', threshold: 80 },
      { name: 'Generate PDF', threshold: 100 }
    ]
  },
  pdftoimages: {
    containerId: 'pdfToImagesProgressContainer',
    barId: 'pdfToImagesProgressBar',
    percentId: 'pdfToImagesProgressPercent',
    textId: 'pdfToImagesProgressText',
    stages: [
      { name: 'Rasterize Pages', threshold: 35 },
      { name: 'Encode Blobs', threshold: 80 },
      { name: 'Package ZIP', threshold: 100 }
    ]
  },
  split: {
    containerId: 'splitProgressContainer',
    barId: 'splitProgressBar',
    percentId: 'splitProgressPercent',
    textId: 'splitProgressText',
    stages: [
      { name: 'Parse Ranges', threshold: 20 },
      { name: 'Extract Pages', threshold: 80 },
      { name: 'Export Parts', threshold: 100 }
    ]
  }
};

const pipelineInstances = new Map();

export function initPipelineProgress() {
  if (typeof document === 'undefined') return;

  Object.entries(PIPELINE_CONFIGS).forEach(([toolKey, cfg]) => {
    const container = document.getElementById(cfg.containerId);
    if (!container) return;

    container.classList.add('pipeline-progress-card');

    // 1. Inject Stepper Row if not present
    if (!container.querySelector('.pipeline-stepper-row')) {
      const header = container.querySelector('.progress-header') || container.firstElementChild;
      const stepperRow = document.createElement('div');
      stepperRow.className = 'pipeline-stepper-row';

      cfg.stages.forEach((stage, idx) => {
        const stepNum = idx + 1;
        const pill = document.createElement('div');
        pill.className = `pipeline-step-pill ${stepNum === 1 ? 'step-active' : 'step-pending'}`;
        pill.dataset.stepIndex = idx;
        pill.innerHTML = `
          <span class="step-indicator">
            <span class="step-num">${stepNum}</span>
            <svg class="step-check hidden w-3.5 h-3.5" aria-hidden="true"><use href="#lucide-check"></use></svg>
          </span>
          <span class="step-label">${escapeHtml(stage.name)}</span>
        `;
        stepperRow.appendChild(pill);

        if (idx < cfg.stages.length - 1) {
          const connector = document.createElement('div');
          connector.className = 'pipeline-step-connector';
          connector.dataset.connectorIndex = idx;
          stepperRow.appendChild(connector);
        }
      });

      if (header) {
        container.insertBefore(stepperRow, header);
      } else {
        container.prepend(stepperRow);
      }
    }

    // 2. Inject Subtext under progressText if not present
    const textEl = document.getElementById(cfg.textId);
    if (textEl && !container.querySelector('.pipeline-subtext')) {
      const parent = textEl.parentElement;
      if (parent) {
        const subtext = document.createElement('span');
        subtext.className = 'pipeline-subtext';
        subtext.textContent = `Stage 1 of ${cfg.stages.length} • Initializing...`;
        textEl.after(subtext);
      }
    }

    // 3. Inject Shimmer Highlight inside progress-bar-fill if not present
    const bar = document.getElementById(cfg.barId);
    if (bar && !bar.querySelector('.progress-shimmer-highlight')) {
      bar.classList.add('relative', 'overflow-hidden');
      const shimmer = document.createElement('div');
      shimmer.className = 'progress-shimmer-highlight';
      bar.appendChild(shimmer);
    }

    // 4. Attach MutationObserver to keep stepper states in sync with any width/percent changes
    const percentEl = document.getElementById(cfg.percentId);
    if (percentEl) {
      const observer = new MutationObserver(() => {
        const text = percentEl.textContent || '0%';
        const match = text.match(/(\d+)/);
        const pct = match ? parseInt(match[1], 10) : 0;
        updateStepperState(container, cfg, pct);
      });
      observer.observe(percentEl, { childList: true, characterData: true, subtree: true });
      pipelineInstances.set(toolKey, { container, cfg, observer });
    }
  });

  // Export to window for testing / direct tab use
  window.updatePipelineProgress = updatePipelineProgress;
  window.resetPipelineProgress = resetPipelineProgress;
}

export function updatePipelineProgress(toolKey, percent, statusText = '', subText = '') {
  const cfg = PIPELINE_CONFIGS[toolKey];
  if (!cfg) return;

  const bar = document.getElementById(cfg.barId);
  const percentEl = document.getElementById(cfg.percentId);
  const textEl = document.getElementById(cfg.textId);
  const container = document.getElementById(cfg.containerId);

  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  if (bar) bar.style.width = `${clamped}%`;
  if (percentEl) percentEl.textContent = `${clamped}%`;
  if (textEl && statusText) textEl.textContent = statusText;

  if (container) {
    updateStepperState(container, cfg, clamped, subText);
  }

  if (clamped >= 100) {
    if (typeof window.playAudioCue === 'function') {
      window.playAudioCue('success');
    }
    if (typeof window.triggerHaptic === 'function') {
      window.triggerHaptic('success');
    }
    if (typeof window.triggerSuccessBurst === 'function') {
      window.triggerSuccessBurst({ origin: container });
    }
  }
}

function updateStepperState(container, cfg, percent, customSubtext = '') {
  const pills = container.querySelectorAll('.pipeline-step-pill');
  const connectors = container.querySelectorAll('.pipeline-step-connector');
  const subtextEl = container.querySelector('.pipeline-subtext');

  // Determine active stage based on thresholds
  let activeIndex = 0;
  if (percent >= cfg.stages[1].threshold) {
    activeIndex = 2;
  } else if (percent >= cfg.stages[0].threshold) {
    activeIndex = 1;
  } else {
    activeIndex = 0;
  }

  pills.forEach((pill, idx) => {
    const isCompleted = (percent >= 100) || (idx < activeIndex);
    const isActive = !isCompleted && (idx === activeIndex);
    const isPending = !isCompleted && !isActive;

    pill.classList.toggle('step-completed', isCompleted);
    pill.classList.toggle('step-active', isActive);
    pill.classList.toggle('step-pending', isPending);

    const numSpan = pill.querySelector('.step-num');
    const checkSvg = pill.querySelector('.step-check');

    if (numSpan && checkSvg) {
      if (isCompleted) {
        numSpan.classList.add('hidden');
        checkSvg.classList.remove('hidden');
      } else {
        numSpan.classList.remove('hidden');
        checkSvg.classList.add('hidden');
      }
    }
  });

  connectors.forEach((conn, idx) => {
    const isConnDone = idx < activeIndex || percent >= 100;
    conn.classList.toggle('connector-completed', isConnDone);
  });

  if (subtextEl) {
    if (customSubtext) {
      subtextEl.textContent = customSubtext;
    } else {
      const stageName = cfg.stages[activeIndex] ? cfg.stages[activeIndex].name : 'Processing';
      if (percent >= 100) {
        subtextEl.textContent = 'All stages complete • Ready to download';
      } else {
        subtextEl.textContent = `Stage ${activeIndex + 1} of ${cfg.stages.length} • ${stageName}`;
      }
    }
  }
}

export function resetPipelineProgress(toolKey) {
  const cfg = PIPELINE_CONFIGS[toolKey];
  if (!cfg) return;

  const container = document.getElementById(cfg.containerId);
  if (!container) return;

  updateStepperState(container, cfg, 0, 'Stage 1 of 3 • Initializing...');
  const bar = document.getElementById(cfg.barId);
  const percentEl = document.getElementById(cfg.percentId);
  if (bar) bar.style.width = '0%';
  if (percentEl) percentEl.textContent = '0%';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
