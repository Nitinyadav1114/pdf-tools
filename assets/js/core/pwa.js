/**
 * PWA Install Prompt & Offline Notification Controller
 * Manages both headerInstallBtn and pwaInstallBanner with seamless fallback instructions.
 */
import { elements } from './dom.js';

let deferredPrompt = null;

// Capture beforeinstallprompt from browser at top level
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwaInstallBanner') || elements.pwaInstallBanner;
    const dismissedTime = localStorage.getItem('pdf_pwa_banner_dismissed');
    const isDismissedRecently = dismissedTime && (Date.now() - parseInt(dismissedTime, 10) < 7 * 24 * 60 * 60 * 1000);
    if (banner && !isDismissedRecently) {
      banner.classList.remove('hidden');
    }
  });

  // Listen to successful app installation
  window.addEventListener('appinstalled', () => {
    localStorage.setItem('pdf_pwa_installed', 'true');
    const banner = document.getElementById('pwaInstallBanner') || elements.pwaInstallBanner;
    const headerBtn = document.getElementById('headerInstallBtn') || elements.headerInstallBtn;
    if (banner) banner.classList.add('hidden');
    if (headerBtn) headerBtn.style.display = 'none';
    closeInstallModal();
  });
}

// Modal open/close helpers
export function openInstallModal() {
  const modal = document.getElementById('pwaInstallModal') || elements.pwaInstallModal;
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

export function closeInstallModal() {
  const modal = document.getElementById('pwaInstallModal') || elements.pwaInstallModal;
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

// Unified install trigger
export async function triggerInstallFlow() {
  if (deferredPrompt) {
    try {
      const banner = document.getElementById('pwaInstallBanner') || elements.pwaInstallBanner;
      if (banner) banner.classList.add('hidden');
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('pdf_pwa_installed', 'true');
      }
      deferredPrompt = null;
    } catch (err) {
      openInstallModal();
    }
  } else {
    // Browser didn't provide beforeinstallprompt (e.g. desktop, Safari, Firefox, or already installed)
    openInstallModal();
  }
}

export function initPWAInstallBanner() {
  const banner = elements.pwaInstallBanner;
  const installBtn = elements.pwaInstallBtn;
  const dismissBtn = elements.pwaDismissBtn;
  const headerInstallBtn = elements.headerInstallBtn;
  const closeModalBtn = elements.closeInstallModalBtn;
  const confirmModalBtn = elements.confirmInstallModalBtn;
  const installModal = elements.pwaInstallModal;

  // Check if running in standalone mode (already installed as PWA)
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
  if (isStandalone) {
    const hBtn = document.getElementById('headerInstallBtn') || headerInstallBtn;
    if (hBtn) hBtn.style.display = 'none';
  }

  // Wire Header Install Button
  const hBtn = document.getElementById('headerInstallBtn') || headerInstallBtn;
  if (hBtn) {
    hBtn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerInstallFlow();
    });
  }

  // Wire Banner Install Button
  const pBtn = document.getElementById('pwaInstallBtn') || installBtn;
  if (pBtn) {
    pBtn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerInstallFlow();
    });
  }

  // Wire Dismiss Button
  const dBtn = document.getElementById('pwaDismissBtn') || dismissBtn;
  if (dBtn) {
    dBtn.addEventListener('click', () => {
      const b = document.getElementById('pwaInstallBanner') || banner;
      if (b) b.classList.add('hidden');
      localStorage.setItem('pdf_pwa_banner_dismissed', Date.now().toString());
    });
  }

  // Wire Modal Close Buttons
  const cBtn = document.getElementById('closeInstallModalBtn') || closeModalBtn;
  if (cBtn) cBtn.addEventListener('click', closeInstallModal);
  const okBtn = document.getElementById('confirmInstallModalBtn') || confirmModalBtn;
  if (okBtn) okBtn.addEventListener('click', closeInstallModal);

  // Close modal on backdrop click
  const modalEl = document.getElementById('pwaInstallModal') || installModal;
  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeInstallModal();
    });
  }

  // Close modal on Escape key
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeInstallModal();
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.openInstallModal = openInstallModal;
  window.closeInstallModal = closeInstallModal;
  window.triggerInstallFlow = triggerInstallFlow;
}
