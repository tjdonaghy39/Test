/* =================================================================
   app.js — Main orchestrator: fetch cycle, UI wiring, auto-refresh
   ================================================================= */

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

let state        = null;
let refreshTimer = null;
let chartsInited = false;

// ── Data fetching ─────────────────────────────────────────────────

async function fetchSignals() {
  const res = await fetch('/api/signals');
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
  return res.json();
}

// ── UI helpers ────────────────────────────────────────────────────

function showBanner(type, msg) {
  const el = document.getElementById('banner');
  el.className = `banner ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

function hideBanner() {
  document.getElementById('banner').style.display = 'none';
}

function updateTimestamp(iso, cacheAge, isStale) {
  const el = document.getElementById('last-updated');
  const ts = iso ? new Date(iso).toLocaleString() : '—';
  el.textContent = `Updated: ${ts}${cacheAge ? ` (${formatAge(cacheAge)} ago)` : ''}${isStale ? ' ⚠ stale' : ''}`;
}

function formatAge(secs) {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

function setSpinner(on) {
  document.getElementById('refresh-spinner').style.display = on ? 'inline' : 'none';
}

// ── Detail chart panel ────────────────────────────────────────────

function handleExpand(etf) {
  const section    = document.getElementById('detail-section');
  const tickerSpan = document.getElementById('detail-ticker');

  if (!etf) {
    section.style.display = 'none';
    destroyDetailCharts();
    return;
  }

  tickerSpan.textContent = etf.ticker;
  section.style.display  = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showDetailCharts(etf);
}

document.getElementById('close-detail').addEventListener('click', () => {
  // Collapse expanded card and hide detail section
  if (state) renderCards(state.etfs, state.sentiment, handleExpand);
  handleExpand(null);
  // Clear the expandedTicker in cards.js (reset it by setting via global)
  window._clearExpanded && window._clearExpanded();
});

// ── Main refresh cycle ────────────────────────────────────────────

async function refresh() {
  setSpinner(true);
  try {
    const data = await fetchSignals();
    state = data;

    updateRegimeBadge(data.marketRegime);
    updateSentimentPanel(data.sentiment);
    renderCards(data.etfs, data.sentiment, handleExpand);

    if (!chartsInited) {
      initPerfChart(data.etfs);
      chartsInited = true;
    } else {
      updatePerfChart(data.etfs);
    }

    updateTimestamp(data.timestamp, data.cacheAge, data.stale);

    if (data.stale) {
      showBanner('warning', `⚠ Using cached data — live fetch failed. Last updated: ${new Date(data.timestamp).toLocaleString()}`);
    } else {
      hideBanner();
    }
  } catch (err) {
    console.error('[refresh]', err);
    showBanner('error', `Unable to load data: ${err.message}. Retrying in 60s…`);
    // Retry sooner on error
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 60_000);
    return;
  } finally {
    setSpinner(false);
  }

  // Schedule next refresh
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, REFRESH_INTERVAL);
}

// ── Tab visibility: skip ticks when hidden, refresh on return ─────

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});

// ── Manual refresh button ─────────────────────────────────────────

document.getElementById('refresh-btn').addEventListener('click', () => {
  clearTimeout(refreshTimer);
  refresh();
});

// ── Boot ──────────────────────────────────────────────────────────

refresh();
