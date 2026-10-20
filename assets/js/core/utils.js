/**
 * Shared Application Utilities
 * Formatting, string escaping, sharing, privacy tracking, and theme management.
 */

export {
  ensurePdfLibLoaded,
  ensurePdfJsLoaded,
  ensureAllPdfEngines,
  preloadEngineForTool,
  initEnginePreloader
} from './engine-loader.js';

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown date';
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Parse page input string (e.g. "1, 2, 7, 8" or "1-3, 5") into Set of 1-based page numbers
 */
export function parsePageInput(inputStr, totalPages) {
  const set = new Set();
  if (!inputStr || !inputStr.trim()) return set;
  const parts = inputStr.split(/[\s,]+/);
  for (const part of parts) {
    if (!part) continue;
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(totalPages, Math.max(start, end));
        for (let p = min; p <= max; p++) set.add(p);
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        set.add(p);
      }
    }
  }
  return set;
}

/**
 * Format array/set of page numbers into comma-separated ranges e.g. "1, 2, 7, 8"
 */
export function formatPageSet(pageSet) {
  const sorted = Array.from(pageSet).sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  return sorted.join(', ');
}

export function isPasswordProtectedError(err) {
  if (!err) return false;
  const msg = String(err.message || err.name || '').toLowerCase();
  return (
    msg.includes('password') ||
    msg.includes('encrypted') ||
    msg.includes('decrypt') ||
    msg.includes('security handler')
  );
}

export function validatePageInput(inputStr, totalPages) {
  if (!inputStr || !inputStr.trim() || !totalPages) return { outOfBounds: [] };
  const parts = inputStr.split(/[\s,]+/);
  const outOfBounds = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const s = parseInt(startStr, 10);
      const e = parseInt(endStr, 10);
      if (!isNaN(s) && s > totalPages) outOfBounds.push(s);
      if (!isNaN(e) && e > totalPages) outOfBounds.push(e);
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p > totalPages) outOfBounds.push(p);
    }
  }
  return { outOfBounds: Array.from(new Set(outOfBounds)) };
}

let activeShareBlob = null;
let activeShareFilename = 'document.pdf';
let activeShareMime = 'application/pdf';

/**
 * Universal Share Modal Controller
 */
export function openShareModal(blob, filename, mimeType = 'application/pdf') {
  activeShareBlob = blob;
  activeShareFilename = filename || 'document.pdf';
  activeShareMime = mimeType || (blob && blob.type) || 'application/pdf';

  const modal = document.getElementById('appShareModal');
  const nameEl = document.getElementById('shareModalFileName');
  const sizeEl = document.getElementById('shareModalFileSize');
  const extEl = document.getElementById('shareModalFileExt');
  const nativeBtn = document.getElementById('shareModalNativeBtn');
  const feedbackEl = document.getElementById('shareModalCopyFeedback');

  if (feedbackEl) feedbackEl.classList.add('hidden');
  if (nameEl) nameEl.textContent = activeShareFilename;
  if (sizeEl) sizeEl.textContent = blob ? formatBytes(blob.size) : '0 KB';
  if (extEl) {
    const ext = (activeShareFilename.split('.').pop() || 'PDF').toUpperCase();
    extEl.textContent = ext;
  }

  // Check if system share is supported for text/url
  if (nativeBtn) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      nativeBtn.classList.remove('hidden');
    } else {
      nativeBtn.classList.add('hidden');
    }
  }

  if (modal) modal.classList.remove('hidden');
}

export function closeShareModal() {
  const modal = document.getElementById('appShareModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Initialize Share Modal event listeners
 */
export function initShareModal() {
  const modal = document.getElementById('appShareModal');
  const closeBtn = document.getElementById('closeShareModalBtn');
  const downloadBtn = document.getElementById('shareModalDownloadBtn');
  const copyLinkBtn = document.getElementById('shareModalCopyLinkBtn');
  const whatsAppBtn = document.getElementById('shareModalWhatsAppBtn');
  const emailBtn = document.getElementById('shareModalEmailBtn');
  const telegramBtn = document.getElementById('shareModalTelegramBtn');
  const nativeBtn = document.getElementById('shareModalNativeBtn');
  const feedbackEl = document.getElementById('shareModalCopyFeedback');

  if (closeBtn) closeBtn.addEventListener('click', closeShareModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeShareModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShareModal();
  });

  // Direct Save / Download
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (!activeShareBlob) return;
      const url = URL.createObjectURL(activeShareBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeShareFilename || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  // Copy Web App Link
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      const shareUrl = window.location.origin + window.location.pathname;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = shareUrl;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        if (feedbackEl) {
          feedbackEl.textContent = '✓ Link copied to clipboard!';
          feedbackEl.classList.remove('hidden');
          setTimeout(() => feedbackEl.classList.add('hidden'), 3000);
        }
      } catch (err) {
        console.warn('Copy link error:', err);
      }
    });
  }

  // WhatsApp Web / Mobile
  if (whatsAppBtn) {
    whatsAppBtn.addEventListener('click', () => {
      const siteUrl = window.location.origin + window.location.pathname;
      const msg = `I just processed "${activeShareFilename}" using PDF Tools (100% private in-browser PDF suite)! Try it here: ${siteUrl}`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    });
  }

  // Email (Mailto)
  if (emailBtn) {
    emailBtn.addEventListener('click', () => {
      const siteUrl = window.location.origin + window.location.pathname;
      const subject = `Processed Document: ${activeShareFilename}`;
      const body = `Hi,\n\nI processed "${activeShareFilename}" using PDF Tools (100% Private In-Browser Suite - zero file uploads).\n\nCheck out the web app here:\n${siteUrl}\n`;
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  // Telegram
  if (telegramBtn) {
    telegramBtn.addEventListener('click', () => {
      const siteUrl = window.location.origin + window.location.pathname;
      const msg = `Processed "${activeShareFilename}" privately using PDF Tools`;
      window.open(`https://t.me/share/url?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    });
  }

  // Native OS Share Sheet Fallback
  if (nativeBtn) {
    nativeBtn.addEventListener('click', async () => {
      const siteUrl = window.location.origin + window.location.pathname;
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: activeShareFilename,
            text: `Processed "${activeShareFilename}" with PDF Tools`,
            url: siteUrl
          });
        } catch (err) {
          if (err.name !== 'AbortError') console.warn('Device share error:', err);
        }
      }
    });
  }
}

/**
 * Universal Web Share API Helper with graceful multi-platform modal fallback
 */
export async function handleSharePdf(blob, filename, mimeType = 'application/pdf') {
  if (!blob) return;
  const safeFilename = filename || 'document.pdf';
  const safeMime = mimeType || blob.type || 'application/pdf';

  // 1. If native file sharing is supported (Safari iOS/macOS, Android Chrome), invoke native share sheet
  if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
    try {
      const file = new File([blob], safeFilename, { type: safeMime, lastModified: Date.now() });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: safeFilename,
          text: `Processed "${safeFilename}" with PDF Tools (100% Private In-Browser Suite).`
        });
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // User closed sheet
      console.warn('Native file share failed, opening Share Modal:', err);
    }
  }

  // 2. Fallback: Open Universal Share Modal for instant save, copy, and messaging
  openShareModal(blob, safeFilename, safeMime);
}

/**
 * Privacy-preserving tool usage analytics
 */
export function trackToolUsage(toolName, eventType = 'used', count = 1) {
  const safeCount = Math.max(1, parseInt(count, 10) || 1);
  const eventPath = `/tool-${toolName}`;
  const eventTitle = `${eventType === 'used' ? 'Used' : 'Viewed'} ${toolName}${safeCount > 1 ? ` (${safeCount} files)` : ''}`;

  // 1. GoatCounter Event Tracking (if configured)
  try {
    if (typeof window !== 'undefined' && window.goatcounter && typeof window.goatcounter.count === 'function') {
      window.goatcounter.count({
        path: eventPath,
        title: eventTitle,
        event: true
      });
    }
  } catch (e) {
    // Ignore analytics failures silently
  }

  // 2. Google Analytics 4 (if configured)
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'tool_usage', {
        tool_name: toolName,
        event_type: eventType,
        count: safeCount
      });
    }
  } catch (e) {
    // Ignore
  }

  // 3. Custom DOM Event for extensibility and unit testing
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tool_usage', {
        detail: { toolName, eventType, count: safeCount, timestamp: Date.now() }
      }));
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Toggle Light / Dark theme with modern View Transitions circular ripple morph
 */
export function toggleThemeWithTransition(event) {
  const isLight = document.body.classList.contains('theme-light');
  const newTheme = isLight ? 'theme-dark' : 'theme-light';

  function applyThemeChange() {
    document.body.classList.toggle('theme-dark', newTheme === 'theme-dark');
    document.body.classList.toggle('theme-light', newTheme !== 'theme-dark');
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('dark', newTheme === 'theme-dark');
    }
    localStorage.setItem('pdf_merger_theme', newTheme);
  }

  // Check if browser supports View Transitions API and user hasn't requested reduced motion
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || prefersReducedMotion) {
    applyThemeChange();
    return;
  }

  // Origin coordinates of toggle click/tap
  let x = window.innerWidth / 2;
  let y = 40;
  if (event && event.clientX) {
    x = event.clientX;
    y = event.clientY;
  } else {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
  }

  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = document.startViewTransition(() => {
    applyThemeChange();
  });

  if (transition && transition.ready) {
    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 480,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    }).catch(() => {});
  }
}

/**
 * Initialize Light / Dark theme toggling
 */
export function initTheme() {
  const savedTheme = localStorage.getItem('pdf_merger_theme') || 'theme-light';
  document.body.classList.toggle('theme-dark', savedTheme === 'theme-dark');
  document.body.classList.toggle('theme-light', savedTheme !== 'theme-dark');
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.toggle('dark', savedTheme === 'theme-dark');
  }
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', (e) => {
      toggleThemeWithTransition(e);
    });
  }
}

if (typeof window !== 'undefined') {
  window.trackToolUsage = trackToolUsage;
}

/**
 * Toast Notification Engine
 * Non-blocking, glassmorphic toast notifications replacing intrusive browser alerts.
 */
let toastContainerEl = null;

function ensureToastContainer() {
  if (typeof document === 'undefined') return null;
  if (!toastContainerEl || !document.body.contains(toastContainerEl)) {
    toastContainerEl = document.getElementById('toastContainer');
    if (!toastContainerEl) {
      toastContainerEl = document.createElement('div');
      toastContainerEl.id = 'toastContainer';
      toastContainerEl.setAttribute('role', 'region');
      toastContainerEl.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(toastContainerEl);
    }
  }
  return toastContainerEl;
}

const TOAST_ICONS = {
  success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

export function showToast(message, type = 'info', duration = 3800) {
  const container = ensureToastContainer();
  if (!container) return;

  const validTypes = ['success', 'error', 'warning', 'info'];
  const toastType = validTypes.includes(type) ? type : 'info';

  const card = document.createElement('div');
  card.className = `toast-card toast-${toastType}`;
  card.setAttribute('role', toastType === 'error' ? 'alert' : 'status');
  card.setAttribute('aria-live', 'polite');

  const iconMarkup = TOAST_ICONS[toastType] || TOAST_ICONS.info;
  const escapedText = escapeHtml(String(message));

  card.innerHTML = `
    ${iconMarkup}
    <div class="toast-message">${escapedText}</div>
    <button type="button" class="toast-close-btn" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  let dismissTimer = null;

  const dismiss = () => {
    if (dismissTimer) clearTimeout(dismissTimer);
    card.classList.remove('show');
    card.classList.add('hide');
    setTimeout(() => {
      if (card.parentElement) card.parentElement.removeChild(card);
    }, 320);
  };

  const closeBtn = card.querySelector('.toast-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
  }

  container.appendChild(card);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.classList.add('show');
    });
  });

  if (duration > 0) {
    dismissTimer = setTimeout(dismiss, duration);
  }

  return dismiss;
}

if (typeof window !== 'undefined') {
  window.showToast = showToast;
  // Non-blocking fallback for unhandled alerts
  const origAlert = window.alert;
  window.alert = function (msg) {
    if (typeof showToast === 'function') {
      showToast(msg, 'warning');
    } else if (origAlert) {
      origAlert(msg);
    }
  };
}

