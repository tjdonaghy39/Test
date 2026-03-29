'use strict';

const { getAdjClose, clamp } = require('./utils');

// ---------------------------------------------------------------------------
// VIX scoring
// ---------------------------------------------------------------------------
function scoreVIX(vixQuote, vixHistory) {
  const vix = vixQuote?.regularMarketPrice;
  if (vix == null) return { value: null, band: 'UNKNOWN', score: 0, trendBonus: 0 };

  let band, score;
  if      (vix < 12) { band = 'COMPLACENT'; score =  1; }
  else if (vix < 17) { band = 'LOW';        score =  2; }
  else if (vix < 20) { band = 'MODERATE';   score =  1; }
  else if (vix < 25) { band = 'ELEVATED';   score = -1; }
  else if (vix < 30) { band = 'HIGH';       score = -2; }
  else               { band = 'CRISIS';     score = -3; }

  // VIX trend: compare current level to 5-day average to detect spikes/recoveries
  let trendBonus = 0;
  if (vixHistory && vixHistory.length >= 5) {
    const closes = getAdjClose(vixHistory);
    const avg5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (avg5 > 0) {
      const ratio = vix / avg5;
      if      (ratio > 1.15) trendBonus = -1;  // VIX spiking — fear rising fast
      else if (ratio < 0.85) trendBonus =  1;  // VIX collapsing — fear receding fast
    }
  }

  return { value: parseFloat(vix.toFixed(2)), band, score, trendBonus };
}

// ---------------------------------------------------------------------------
// S&P 500 vs 200-day MA
// ---------------------------------------------------------------------------
function scoreGSPC(gspcQuote, gspcHistory) {
  const price = gspcQuote?.regularMarketPrice;
  if (!price || !gspcHistory || gspcHistory.length < 205) {
    return { value: price ?? null, ma200: null, ratio: null, score: 0, bearCross: false };
  }

  const closes = getAdjClose(gspcHistory);
  if (closes.length < 205) {
    return { value: price, ma200: null, ratio: null, score: 0, bearCross: false };
  }

  const recentSlice = closes.slice(-200);
  const ma200 = recentSlice.reduce((a, b) => a + b, 0) / 200;
  const ratio = price / ma200;

  let score;
  if      (ratio > 1.05) score =  2;
  else if (ratio > 1.00) score =  1;
  else if (ratio > 0.98) score =  0;
  else if (ratio > 0.95) score = -1;
  else                   score = -2;

  // Detect if S&P crossed below its 200dMA within the last 5 trading days
  const lookback = closes.slice(-205);
  const ma200_5dAgo = lookback.slice(0, 200).reduce((a, b) => a + b, 0) / 200;
  const price5dAgo = lookback[200];
  const wasAbove = price5dAgo > ma200_5dAgo;
  const nowBelow = price < ma200;
  const bearCross = wasAbove && nowBelow;

  return {
    value:    parseFloat(price.toFixed(2)),
    ma200:    parseFloat(ma200.toFixed(2)),
    ratio:    parseFloat(ratio.toFixed(4)),
    score,
    bearCross
  };
}

// ---------------------------------------------------------------------------
// US 10-year yield trend
// Factor-aware: rising yields hurt quality/momentum, help value (relatively)
// ---------------------------------------------------------------------------
function scoreTNX(tnxHistory) {
  if (!tnxHistory || tnxHistory.length < 21) {
    return { value: null, change21d: null, growthScore: 0, valueScore: 0, label: 'UNKNOWN' };
  }

  const closes = getAdjClose(tnxHistory);
  if (closes.length < 21) {
    return { value: null, change21d: null, growthScore: 0, valueScore: 0, label: 'UNKNOWN' };
  }

  const current = closes[closes.length - 1];
  const ago21   = closes[closes.length - 21];
  const change  = current - ago21;

  let growthScore, valueScore, label;
  if      (change >  0.5) { growthScore = -2; valueScore =  1; label = 'SHARPLY_RISING'; }
  else if (change >  0.2) { growthScore = -1; valueScore =  0; label = 'RISING'; }
  else if (change > -0.2) { growthScore =  0; valueScore =  0; label = 'STABLE'; }
  else if (change > -0.5) { growthScore =  1; valueScore = -1; label = 'FALLING'; }
  else                    { growthScore =  2; valueScore = -1; label = 'SHARPLY_FALLING'; }

  return {
    value:       parseFloat(current.toFixed(3)),
    change21d:   parseFloat(change.toFixed(3)),
    growthScore,
    valueScore,
    label
  };
}

// ---------------------------------------------------------------------------
// Composite sentiment
// ---------------------------------------------------------------------------
function scoreSentiment(rawData) {
  const vix  = scoreVIX(rawData['^VIX_quote'],  rawData['^VIX_history']);
  const gspc = scoreGSPC(rawData['^GSPC_quote'], rawData['^GSPC_history']);
  const tnx  = scoreTNX(rawData['^TNX_history']);

  // Composite uses a neutral TNX score (growthScore) for overall regime;
  // factor-specific TNX score is applied per-ETF in the signal engine
  const composite = clamp(
    vix.score + vix.trendBonus + gspc.score + tnx.growthScore,
    -6, 6
  );

  let label, regime;
  if      (composite >=  4) { label = 'BULLISH';        regime = 'RISK_ON';  }
  else if (composite >=  2) { label = 'MILDLY_BULLISH'; regime = 'RISK_ON';  }
  else if (composite >= -1) { label = 'NEUTRAL';        regime = 'NEUTRAL';  }
  else if (composite >= -3) { label = 'CAUTIOUS';       regime = 'RISK_OFF'; }
  else                      { label = 'BEARISH';        regime = 'RISK_OFF'; }

  return {
    vix,
    gspc,
    tnx,
    composite,
    label,
    regime,
    emergencyBearCross: gspc.bearCross,
    extremeFear: vix.value != null && vix.value > 30
  };
}

module.exports = { scoreSentiment };
