/* =================================================================
   cards.js — Signal card rendering and interaction
   ================================================================= */

let expandedTicker = null;

function signalClass(signal) {
  if (!signal) return '';
  const s = signal.toLowerCase().replace(/ /g, '-');
  return s;
}

function retClass(val) {
  if (val == null) return 'neu';
  return val > 0 ? 'pos' : val < 0 ? 'neg' : 'neu';
}

function formatReturn(val) {
  if (val == null) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function formatPrice(etf) {
  if (etf.priceGBP == null) return '—';
  return `£${etf.priceGBP.toFixed(2)}`;
}

// Score bar: total score range roughly -4 to +8, map to 0–100%
function scorePercent(total) {
  const min = -4, max = 8;
  return Math.max(0, Math.min(100, ((total - min) / (max - min)) * 100));
}

function scoreBarColor(total) {
  if (total >= 5)   return '#00e676';
  if (total >= 3.5) return '#00c853';
  if (total >= 2)   return '#ffd600';
  return '#ff1744';
}

function renderCards(etfs, sentiment, onExpand) {
  const container = document.getElementById('signal-cards');
  container.innerHTML = '';

  etfs.forEach(etf => {
    const cls    = signalClass(etf.signal);
    const isExp  = expandedTicker === etf.ticker;
    const pct    = scorePercent(etf.scores.total);
    const barClr = scoreBarColor(etf.scores.total);

    const reasonsHTML = etf.reasons.map(r => {
      const isOverride = r.startsWith('OVERRIDE:');
      return `<li class="${isOverride ? 'override' : ''}">${escHtml(r)}</li>`;
    }).join('');

    const card = document.createElement('div');
    card.className = `signal-card ${cls}${isExp ? ' expanded' : ''}`;
    card.dataset.ticker = etf.ticker;

    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-ticker">${etf.ticker}</div>
          <div class="card-name">${etf.name}</div>
        </div>
        <div class="signal-badge">
          <span class="signal-label ${cls}">${etf.signal ?? '—'}</span>
          <span class="confidence">${etf.confidence ?? ''}</span>
        </div>
      </div>

      <div class="card-price">
        <span class="price-main">${formatPrice(etf)}</span>
        <span class="market-state">${etf.marketState ?? '—'}</span>
      </div>

      <div class="card-returns">
        ${['1W','1M','3M'].map(p => `
          <div class="return-item">
            <span class="ret-period">${p}</span>
            <span class="ret-value ${retClass(etf.returns[p])}">${formatReturn(etf.returns[p])}</span>
          </div>
        `).join('')}
      </div>

      <div class="score-bar-wrap">
        <div class="score-bar-label">
          <span>Signal Score</span>
          <span>${etf.scores.total}</span>
        </div>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${pct}%;background:${barClr}"></div>
        </div>
      </div>

      <div class="card-technicals">
        <div class="tech-item"><span>RSI (14)</span><span class="tech-val">${etf.technicals.rsi14 ?? '—'}</span></div>
        <div class="tech-item"><span>MACD hist</span><span class="tech-val">${etf.technicals.macd?.histogram?.toFixed(3) ?? '—'}</span></div>
        <div class="tech-item"><span>vs 50dMA</span><span class="tech-val">${etf.technicals.priceVs50dma != null ? etf.technicals.priceVs50dma + '%' : '—'}</span></div>
        <div class="tech-item"><span>vs 200dMA</span><span class="tech-val">${etf.technicals.priceVs200dma != null ? etf.technicals.priceVs200dma + '%' : '—'}</span></div>
      </div>

      <div class="card-reasons">
        <ul>${reasonsHTML}</ul>
      </div>

      <div class="expand-hint">Click to ${isExp ? 'collapse' : 'expand'}</div>
    `;

    card.addEventListener('click', () => {
      const wasExpanded = expandedTicker === etf.ticker;
      expandedTicker = wasExpanded ? null : etf.ticker;
      // Re-render cards to reflect expanded state
      renderCards(etfs, sentiment, onExpand);
      // Show/hide detail charts
      if (expandedTicker) onExpand(etf);
      else                onExpand(null);
    });

    container.appendChild(card);
  });
}

function updateSentimentPanel(sentiment) {
  if (!sentiment) return;

  // VIX
  const vixEl   = document.getElementById('vix-value');
  const vixBand = document.getElementById('vix-band');
  const sentVix = document.getElementById('sent-vix');
  if (sentiment.vix.value != null) {
    vixEl.textContent   = sentiment.vix.value;
    vixBand.textContent = `${sentiment.vix.band}${sentiment.vix.trendBonus !== 0 ? (sentiment.vix.trendBonus > 0 ? ' ↓ receding' : ' ↑ spiking') : ''}`;
    sentVix.className   = 'sentiment-card ' + (
      sentiment.vix.score >= 1 ? 'low' : sentiment.vix.score === -1 ? 'moderate' : 'high'
    );
  }

  // GSPC
  const gspcRatio = document.getElementById('gspc-ratio');
  const gspcSub   = document.getElementById('gspc-sub');
  if (sentiment.gspc.ratio != null) {
    const pct = ((sentiment.gspc.ratio - 1) * 100).toFixed(1);
    gspcRatio.textContent = `${pct > 0 ? '+' : ''}${pct}%`;
    gspcSub.textContent   = `vs 200dMA (${sentiment.gspc.value?.toLocaleString()})${sentiment.gspc.bearCross ? ' ⚠ Bear cross!' : ''}`;
    gspcRatio.style.color = sentiment.gspc.score >= 1 ? 'var(--green)' : sentiment.gspc.score <= -1 ? 'var(--red)' : 'var(--text)';
  }

  // TNX
  const tnxEl  = document.getElementById('tnx-value');
  const tnxSub = document.getElementById('tnx-sub');
  if (sentiment.tnx.value != null) {
    tnxEl.textContent  = `${sentiment.tnx.value}%`;
    const chg = sentiment.tnx.change21d;
    tnxSub.textContent = `21d change: ${chg >= 0 ? '+' : ''}${chg}pp — ${sentiment.tnx.label.replace(/_/g, ' ')}`;
    tnxEl.style.color  = sentiment.tnx.growthScore > 0 ? 'var(--green)' : sentiment.tnx.growthScore < 0 ? 'var(--red)' : 'var(--text)';
  }

  // Composite
  const compEl  = document.getElementById('composite-value');
  const compLbl = document.getElementById('composite-label');
  compEl.textContent  = sentiment.composite;
  compLbl.textContent = sentiment.label.replace(/_/g, ' ');
  compEl.style.color  = sentiment.composite >= 2 ? 'var(--green)' : sentiment.composite <= -2 ? 'var(--red)' : 'var(--text)';
}

function updateRegimeBadge(regime) {
  const el = document.getElementById('regime-badge');
  el.className = 'regime-badge ' + (regime === 'RISK_ON' ? 'risk-on' : regime === 'RISK_OFF' ? 'risk-off' : 'neutral');
  el.textContent = regime?.replace(/_/g, ' ') ?? '—';
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
