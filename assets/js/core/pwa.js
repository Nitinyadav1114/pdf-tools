/**
 * Mobile PWA Install Prompt & Offline Notification Controller
 */
import { elements } from './dom.js';

export function initPWAInstallBanner() {
  const banner = elements.pwaInstallBanner;
  const installBtn = elements.pwaInstallBtn;
  const dismissBtn = elements.pwaDismissBtn;
  if (!banner || !installBtn || !dismissBtn) return;

  let deferredPrompt = null;
  const dismissedTime = localStorage.getItem('pdf_pwa_banner_dismissed');
  const isDismissedRecently = dismissedTime && (Date.now() - parseInt(dismissedTime, 10) < 7 * 24 * 60 * 60 * 1000);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isDismissedRecently) {
      banner.classList.remove('hidden');
    }
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    banner.classList.add('hidden');
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('pdf_pwa_installed', 'true');
    }
    deferredPrompt = null;
  });

  dismissBtn.addEventListener('click', () => {
    banner.classList.add('hidden');
    localStorage.setItem('pdf_pwa_banner_dismissed', Date.now().toString());
  });
}
