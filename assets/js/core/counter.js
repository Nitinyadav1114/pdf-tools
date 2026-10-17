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
const DEFAULT_ENDPOINT = 'https://pdf-counter.nitinyadav1114.workers.dev';

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
 * Update the DOM elements displaying the stats
 */
export function updateStatsUI(stats, animateProcessed = false) {
  if (!stats) return;
  const visitorsEl = document.getElementById('statVisitorsCount');
  const processedEl = document.getElementById('statProcessedCount');

  if (visitorsEl && typeof stats.visitors === 'number') {
    visitorsEl.textContent = formatStatNumber(stats.visitors);
  }

  if (processedEl && typeof stats.processed === 'number') {
    processedEl.textContent = formatStatNumber(stats.processed);
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
  if (typeof window !== 'undefined' && window.PDF_TOOLS_COUNTER_ENDPOINT) {
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
  // Optimistic UI update: increment locally first for instant feedback
  currentStats.processed += amount;
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
      body: JSON.stringify({ amount }),
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
      incrementProcessedCounter(1);
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
