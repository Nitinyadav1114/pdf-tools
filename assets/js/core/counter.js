/**
 * Global Community Impact Counter Client Module
 * Communicates with Cloudflare Worker KV to display real-time anonymous statistics.
 * 
 * Features:
 * - Session-level visit deduplication (avoids wasting KV write quota on reloads)
 * - Auto-sync on successful tool usage events (Tabs 1-7)
 * - Graceful offline and fail-safe fallback (preserves PWA 100% offline guarantee)
 */

const SESSION_VISIT_KEY = 'pdf_tools_visited_session';
const LOCAL_CACHE_KEY = 'pdf_tools_stats_cache';

// Configurable endpoint (can be overridden via window.PDF_TOOLS_COUNTER_ENDPOINT)
const DEFAULT_ENDPOINT = 'https://pdf-counter.nitinyadav0dev.workers.dev';

// Baseline fallback numbers if worker is unconfigured or user is completely offline
const FALLBACK_STATS = {
  visitors: 1480,
  processed: 3920
};

let currentStats = { ...FALLBACK_STATS };

/**
 * Format raw numbers with thousands separators and optional '+' suffix
 */
export function formatStatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '1,000+';
  return num.toLocaleString() + '+';
}

/**
 * Renders or updates an Apple-style mechanical odometer ticker
 */
export function renderOdometer(container, targetNumber) {
  if (!container || typeof targetNumber !== 'number' || isNaN(targetNumber)) return;

  const formattedStr = targetNumber.toLocaleString() + '+';
  container.setAttribute('aria-label', formattedStr);

  let wrap = container.querySelector('.odometer-wrap');
  if (!wrap) {
    container.innerHTML = '';
    wrap = document.createElement('span');
    wrap.className = 'odometer-wrap';
    container.appendChild(wrap);
  }

  const chars = formattedStr.split('');
  const existingStrips = wrap.querySelectorAll('.odometer-strip');
  const digitChars = chars.filter((c) => /\d/.test(c));

  // If existing strips match the digit count, smoothly update their target digits
  if (existingStrips.length === digitChars.length && existingStrips.length > 0) {
    let digitIdx = 0;
    chars.forEach((char) => {
      if (/\d/.test(char)) {
        const strip = existingStrips[digitIdx];
        if (strip) {
          strip.style.transitionDelay = `${digitIdx * 35}ms`;
          strip.style.setProperty('--digit', char);
        }
        digitIdx++;
      }
    });
    return;
  }

  // Otherwise, construct digit boxes and animate from 0 to target
  wrap.innerHTML = '';
  let digitIdx = 0;
  chars.forEach((char) => {
    if (/\d/.test(char)) {
      const digit = parseInt(char, 10);
      const digitBox = document.createElement('span');
      digitBox.className = 'odometer-digit-box';

      const strip = document.createElement('span');
      strip.className = 'odometer-strip';
      strip.style.setProperty('--digit', '0');
      strip.style.transitionDelay = `${digitIdx * 45}ms`;

      for (let i = 0; i <= 9; i++) {
        const span = document.createElement('span');
        span.textContent = i;
        strip.appendChild(span);
      }

      digitBox.appendChild(strip);
      wrap.appendChild(digitBox);
      digitIdx++;

      // Trigger the slide
      requestAnimationFrame(() => {
        strip.style.setProperty('--digit', String(digit));
      });
    } else {
      const symbolSpan = document.createElement('span');
      symbolSpan.className = 'odometer-symbol';
      symbolSpan.textContent = char;
      wrap.appendChild(symbolSpan);
    }
  });
}

/**
 * Update the DOM elements displaying the stats
 */
export function updateStatsUI(stats, animateProcessed = false) {
  if (!stats) return;
  const visitorsEl = document.getElementById('statVisitorsCount');
  const processedEl = document.getElementById('statProcessedCount');

  if (visitorsEl && typeof stats.visitors === 'number') {
    renderOdometer(visitorsEl, stats.visitors);
  }

  if (processedEl && typeof stats.processed === 'number') {
    renderOdometer(processedEl, stats.processed);
    if (animateProcessed) {
      processedEl.classList.remove('stat-pulse-highlight');
      // Trigger reflow to restart CSS animation
      void processedEl.offsetWidth;
      processedEl.classList.add('stat-pulse-highlight');
    }
  }
}

/**
 * Get active API endpoint
 */
function getEndpoint() {
  if (typeof window !== 'undefined' && window.PDF_TOOLS_COUNTER_ENDPOINT !== undefined) {
    return window.PDF_TOOLS_COUNTER_ENDPOINT;
  }
  return DEFAULT_ENDPOINT;
}

/**
 * Persist stats to local cache for offline instant display
 */
function cacheStats(stats) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(stats));
  } catch (_) {
    // Ignore storage quota errors
  }
}

/**
 * Load cached stats if available
 */
function getCachedStats() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.visitors === 'number' && typeof parsed.processed === 'number') {
        return parsed;
      }
    }
  } catch (_) {
    // Ignore
  }
  return { ...FALLBACK_STATS };
}

/**
 * Increment the global processed PDF counter
 */
export async function incrementProcessedCounter(amount = 1) {
  const safeAmount = Math.max(1, Math.min(100, parseInt(amount, 10) || 1));

  // Optimistic UI update: increment locally first for instant feedback
  currentStats.processed += safeAmount;
  updateStatsUI(currentStats, true);
  cacheStats(currentStats);

  // If offline, do not attempt network fetch
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return currentStats;
  }

  const endpoint = getEndpoint();
  if (!endpoint) return currentStats;

  try {
    const res = await fetch(`${endpoint}/api/processed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: safeAmount }),
      // Short timeout to avoid hanging when network is sluggish
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.processed === 'number') {
        currentStats = { ...currentStats, ...data };
        updateStatsUI(currentStats, false);
        cacheStats(currentStats);
      }
    }
  } catch (err) {
    // Silent fail-safe: offline PWA guarantee
  }

  return currentStats;
}

/**
 * Get current stats snapshot
 */
export function getCounterStats() {
  return { ...currentStats };
}

if (typeof window !== 'undefined') {
  window.incrementProcessedCounter = incrementProcessedCounter;
  window.getCounterStats = getCounterStats;

  // Listen to internal tool_usage events dispatched across tabs
  window.addEventListener('tool_usage', (event) => {
    if (event && event.detail && event.detail.eventType === 'used') {
      const count = Math.max(1, parseInt(event.detail.count, 10) || 1);
      incrementProcessedCounter(count);
    }
  });
}

/**
 * Initialize the impact counter
 */
export async function initCounter() {
  // 1. Load cached stats immediately so the UI is never blank
  currentStats = getCachedStats();
  updateStatsUI(currentStats, false);

  // If user is offline, retain cached values
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  const endpoint = getEndpoint();
  if (!endpoint) return;

  const hasVisitedThisSession = sessionStorage.getItem(SESSION_VISIT_KEY) === '1';

  try {
    let res;
    if (!hasVisitedThisSession) {
      // First visit in this session: increment visitor counter once
      sessionStorage.setItem(SESSION_VISIT_KEY, '1');
      res = await fetch(`${endpoint}/api/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
    } else {
      // Subsequent page refresh/tab switches: lightweight read-only fetch
      res = await fetch(`${endpoint}/api/stats`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
    }

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.visitors === 'number' && typeof data.processed === 'number') {
        currentStats = { ...currentStats, ...data };
        updateStatsUI(currentStats, false);
        cacheStats(currentStats);
      }
    }
  } catch (_) {
    // Silent fallback if Cloudflare Worker is not yet reached or offline
  }
}
