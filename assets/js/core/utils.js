/**
 * Shared Application Utilities
 * Formatting, string escaping, sharing, privacy tracking, and theme management.
 */

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

/**
 * Web Share API Helper with fallback
 */
export async function handleSharePdf(blob, filename) {
  if (!blob) return;
  const safeFilename = filename || 'document.pdf';
  try {
    if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare) {
      const file = new File([blob], safeFilename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: safeFilename,
          text: 'Sharing processed PDF from PDF Tools.'
        });
        return;
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn('File share failed, falling back to URL share:', err);
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: safeFilename,
        url: window.location.href
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share fallback failed:', err);
      }
    }
  } else {
    alert('Sharing is not supported on this device. Please use the Download button.');
  }
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
 * Initialize Light / Dark theme toggling
 */
export function initTheme() {
  const savedTheme = localStorage.getItem('pdf_merger_theme') || 'theme-light';
  document.body.className = savedTheme;
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.contains('theme-light');
      const newTheme = isLight ? 'theme-dark' : 'theme-light';
      document.body.className = newTheme;
      localStorage.setItem('pdf_merger_theme', newTheme);
    });
  }
}

if (typeof window !== 'undefined') {
  window.trackToolUsage = trackToolUsage;
}
