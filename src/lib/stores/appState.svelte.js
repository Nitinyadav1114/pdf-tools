/**
 * Svelte 5 Reactive App State (Runes)
 * Fine-grained state management with zero boilerplate.
 */

// Global sound manager (100% Web Audio API synthesized, 0 external audio files)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      try {
        audioCtx = new AudioCtx();
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

export function createAppState() {
  let currentTab = $state('home');
  let theme = $state(
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'dark'
  );
  let soundEnabled = $state(true);
  let commandPaletteOpen = $state(false);

  let lightbox = $state({
    open: false,
    title: '',
    pageNum: 1,
    totalPages: 1,
    imageUrl: '',
    zoom: 1,
    rotation: 0
  });

  let toast = $state({
    visible: false,
    message: '',
    type: 'info'
  });

  let stats = $state({
    visitors: 1481,
    processed: 3934
  });

  function switchTab(tabId) {
    currentTab = tabId;
    if (typeof window !== 'undefined') {
      window.location.hash = tabId;
    }
    playAudioCue('toggle');
    triggerHaptic('light');
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('theme-dark');
        document.body.classList.remove('theme-light');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.add('theme-light');
        document.body.classList.remove('theme-dark');
      }
    }
    playAudioCue('toggle');
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      playAudioCue('success');
    }
  }

  function playAudioCue(type = 'click') {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'toggle') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'success') {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else {
        osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    } catch (e) {}
  }

  function triggerHaptic(type = 'light') {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (type === 'success') {
          navigator.vibrate([15, 60, 15]);
        } else {
          navigator.vibrate(10);
        }
      } catch (e) {}
    }
  }

  function showToast(message, type = 'info') {
    toast.message = message;
    toast.type = type;
    toast.visible = true;
    setTimeout(() => {
      toast.visible = false;
    }, 3500);
  }

  function openLightbox(options) {
    lightbox.open = true;
    lightbox.title = options.title || 'Page Preview';
    lightbox.pageNum = options.pageNum || 1;
    lightbox.totalPages = options.totalPages || 1;
    lightbox.imageUrl = options.imageUrl || '';
    lightbox.zoom = 1;
    lightbox.rotation = 0;
    playAudioCue('toggle');
  }

  function closeLightbox() {
    lightbox.open = false;
  }

  function incrementProcessed(count = 1) {
    stats.processed += count;
  }

  return {
    get currentTab() { return currentTab; },
    get theme() { return theme; },
    get soundEnabled() { return soundEnabled; },
    get commandPaletteOpen() { return commandPaletteOpen; },
    set commandPaletteOpen(val) { commandPaletteOpen = val; },
    get lightbox() { return lightbox; },
    get toast() { return toast; },
    get stats() { return stats; },
    switchTab,
    toggleTheme,
    toggleSound,
    playAudioCue,
    triggerHaptic,
    showToast,
    openLightbox,
    closeLightbox,
    incrementProcessed
  };
}

export const appState = createAppState();
