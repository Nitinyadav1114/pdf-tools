/**
 * PDF Tools - Tactile Web Audio & Mobile Haptics
 * Pure client-side synthetic micro-sound effects via Web Audio API
 * and tactile physical feedback via navigator.vibrate.
 * 100% offline, zero external MP3s, zero network payload.
 */

let audioCtx = null;
let soundEnabled = true;

const STORAGE_KEY = 'pdf_sound_enabled';

/**
 * Lazily acquires or resumes the Web Audio context.
 * Complies with strict browser autoplay policies by resuming on user interaction.
 */
function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch (e) {
        audioCtx = null;
      }
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Initializes tactile feedback, binds DOM listeners, restores user preferences.
 */
export function initTactileFeedback() {
  if (typeof window === 'undefined') return;

  // Restore persisted sound preference
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    soundEnabled = saved !== null ? saved === 'true' : true;
  } catch (e) {
    soundEnabled = true;
  }

  updateSoundButtonUI();

  // Attach click listener to header sound toggle button
  const soundBtn = document.getElementById('soundToggleBtn');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      toggleSound();
    });
  }

  // Pre-unlock AudioContext on first user interaction
  const unlockAudio = () => {
    getAudioContext();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true, once: true });
  window.addEventListener('keydown', unlockAudio, { passive: true, once: true });

  // Attach global delegated interaction listeners
  attachGlobalDelegates();

  // Expose global helpers
  window.playAudioCue = playAudioCue;
  window.triggerHaptic = triggerHaptic;
  window.toggleSound = toggleSound;
  window.isSoundEnabled = isSoundEnabled;
  window.setSoundEnabled = setSoundEnabled;
  window.updateSoundButtonUI = updateSoundButtonUI;
  window.showDropzoneSuccessBadge = showDropzoneSuccessBadge;
}

/**
 * Displays an ephemeral spring badge confirming files dropped into a dropzone.
 * @param {HTMLElement} dropzoneEl - Target dropzone element
 * @param {number} count - Number of files received
 */
export function showDropzoneSuccessBadge(dropzoneEl, count = 1) {
  if (!dropzoneEl || typeof dropzoneEl.querySelector !== 'function') return;

  // Clear existing badge if any
  const existing = dropzoneEl.querySelector('.dropzone-success-pulse-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.className = 'dropzone-success-pulse-badge';
  const label = count > 1 ? `${count} files received` : `1 file received`;
  badge.innerHTML = `
    <span class="badge-dot-wrapper">
      <span class="badge-dot-ping"></span>
      <span class="badge-dot-core"></span>
    </span>
    <span class="badge-text">${label} • Preparing workspace...</span>
  `;
  dropzoneEl.appendChild(badge);

  setTimeout(() => {
    badge.classList.add('fade-out');
    setTimeout(() => {
      if (badge.parentNode) badge.parentNode.removeChild(badge);
    }, 400);
  }, 1300);
}

/**
 * Attaches passive global delegates for common tactile events.
 */
function attachGlobalDelegates() {
  if (typeof document === 'undefined') return;

  // 1. File Drops & Selection
  document.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      playAudioCue('pop');
      triggerHaptic('medium');
      const dropzone = e.target && typeof e.target.closest === 'function' ? e.target.closest('.dropzone') : null;
      if (dropzone) {
        showDropzoneSuccessBadge(dropzone, e.dataTransfer.files.length);
      }
    }
  }, { passive: true });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.matches && e.target.matches('input[type="file"]') && e.target.files && e.target.files.length > 0) {
      playAudioCue('pop');
      triggerHaptic('medium');
      const dropzone = (typeof e.target.closest === 'function' ? e.target.closest('.dropzone') : null) || 
                       (e.target.parentElement && e.target.parentElement.classList.contains('dropzone') ? e.target.parentElement : null);
      if (dropzone) {
        showDropzoneSuccessBadge(dropzone, e.target.files.length);
      }
    }
  }, { passive: true });

  // 2. Buttons & Micro-interactions
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;

    // Delete / Remove actions
    if (target.closest('.btn-delete, .btn-remove, .remove-file-btn, .btn-trash, #clearAllBtn, #removeAllBtn, [data-action="delete"]')) {
      playAudioCue('delete');
      triggerHaptic('warning');
      return;
    }

    // Download / Export actions
    if (target.closest('.download-btn, [download], .btn-download, [data-action="download"]')) {
      playAudioCue('success');
      triggerHaptic('success');
      return;
    }

    // Action execution buttons (Merge, Compress, Invert, etc.)
    if (target.closest('#mergeBtn, #removeBtn, #generateSlidesBtn, #invertBtn, #compressBtn, #generatePdfBtn, #pdfToImagesBtn, #splitBtn, .btn-action-primary, .action-cta-btn')) {
      playAudioCue('click');
      triggerHaptic('light');
      return;
    }

    // Navigation pills and switches
    if (target.closest('.nav-pill, .tab-pill, [data-tab], .mobile-drawer-tool-item, .theme-toggle-btn')) {
      playAudioCue('toggle');
      triggerHaptic('light');
      return;
    }
  }, { passive: true });
}

/**
 * Synthesizes crisp, subtle micro-audio cues with procedural envelopes.
 * @param {'click' | 'pop' | 'success' | 'delete' | 'toggle'} type
 * @returns {boolean} Whether the cue was synthesized
 */
export function playAudioCue(type = 'click') {
  if (!soundEnabled) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  const now = ctx.currentTime;

  try {
    switch (type) {
      case 'click': {
        // Ultra-short mechanical tick: 850Hz -> 300Hz in 18ms
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(850, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.018);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.019);
        return true;
      }
      case 'pop': {
        // Buoyant file drop pop: 380Hz -> 680Hz in 35ms
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.035);

        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
        return true;
      }
      case 'success': {
        // Crisp two-tone chime chord: D5 (587.33Hz) + A5 (880.00Hz)
        [587.33, 880.00].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const startTime = now + (idx * 0.04);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);

          gain.gain.setValueAtTime(0.09, startTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.3);
        });
        return true;
      }
      case 'delete': {
        // Subtle downward tick: 320Hz -> 180Hz in 25ms
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.025);

        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.026);
        return true;
      }
      case 'toggle': {
        // Soft UI toggle blip: 1100Hz -> 750Hz in 15ms
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.015);

        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.016);
        return true;
      }
      default:
        return false;
    }
  } catch (err) {
    return false;
  }
}

/**
 * Triggers lightweight physical vibration on supported mobile devices.
 * @param {'light' | 'medium' | 'success' | 'warning'} intensity
 * @returns {boolean} Whether haptics were triggered
 */
export function triggerHaptic(intensity = 'light') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false;

  try {
    switch (intensity) {
      case 'light':
        navigator.vibrate(12);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'success':
        navigator.vibrate([15, 35, 25]);
        break;
      case 'warning':
      case 'delete':
        navigator.vibrate([30, 40, 25]);
        break;
      default:
        navigator.vibrate(15);
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Toggles sound enabled state, persists preference, and alerts user.
 * @returns {boolean} New sound enabled state
 */
export function toggleSound() {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem(STORAGE_KEY, String(soundEnabled));
  } catch (e) {}

  updateSoundButtonUI();

  if (soundEnabled) {
    playAudioCue('pop');
    triggerHaptic('light');
    if (typeof window.showToast === 'function') {
      window.showToast('Tactile audio enabled 🔔', 'info');
    }
  } else {
    triggerHaptic('light');
    if (typeof window.showToast === 'function') {
      window.showToast('Audio muted 🔕', 'info');
    }
  }
  return soundEnabled;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(enabled) {
  soundEnabled = !!enabled;
  try {
    localStorage.setItem(STORAGE_KEY, String(soundEnabled));
  } catch (e) {}
  updateSoundButtonUI();
  return soundEnabled;
}

export function updateSoundButtonUI() {
  if (typeof document === 'undefined') return;
  const soundBtn = document.getElementById('soundToggleBtn');
  if (!soundBtn) return;

  const onIcon = soundBtn.querySelector('.sound-icon-on');
  const offIcon = soundBtn.querySelector('.sound-icon-off');

  soundBtn.setAttribute('aria-label', soundEnabled ? 'Mute sound effects' : 'Enable sound effects');
  soundBtn.title = soundEnabled ? 'Mute audio cues & haptics' : 'Enable audio cues & haptics';

  if (onIcon && offIcon) {
    if (soundEnabled) {
      onIcon.classList.remove('hidden');
      offIcon.classList.add('hidden');
    } else {
      onIcon.classList.add('hidden');
      offIcon.classList.remove('hidden');
    }
  }
}
