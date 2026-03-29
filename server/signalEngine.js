'use strict';

const { fetchAllData, ETF_TICKERS } = require('./dataFetcher');
const { calcIndicators }             = require('./indicators');
const { scoreSentiment }             = require('./sentimentScorer');
const { normalisePriceToGBP, normalise01, clamp } = require('./utils');

const ETF_NAMES = {
  'IWFQ.L': 'iShares MSCI World Quality Factor UCITS ETF',
  'IWFV.L': 'iShares MSCI World Value Factor UCITS ETF',
  'IWFM.L': 'iShares MSCI World Momentum Factor UCITS ETF'
};

const VALUE_TICKER = 'IWFV.L';

// ---------------------------------------------------------------------------
// Relative performance score (0–3 per ETF)
// Compares each ETF's 1W / 1M / 3M returns against peers using min-max scaling
// ---------------------------------------------------------------------------
function relativePerformanceScores(indicators) {
  const periods = [
    { key: 'roc5',  weight: 0.25 },
    { key: 'roc21', weight: 0.35 },
    { key: 'roc63', weight: 0.40 }
  ];

  const scores = Object.fromEntries(ETF_TICKERS.map(t => [t, 0]));

  for (const { key, weight } of periods) {
    const values = ETF_TICKERS.map(t => indicators[t]?.[key] ?? null);
    const valid  = values.filter(v => v !== null);
    if (valid.length < 2) continue;

    const min = Math.min(...valid);
    const max = Math.max(...valid);

    ETF_TICKERS.forEach((t, i) => {
      if (values[i] !== null) {
        scores[t] += normalise01(values[i], min, max) * weight * 3;
      }
    });
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Momentum score based on ROC rankings and acceleration (0–3 per ETF)
// ROC_5 > ROC_21 means short-term outpacing medium-term → emerging trend
// ---------------------------------------------------------------------------
function momentumScores(indicators) {
  const scores = Object.fromEntries(ETF_TICKERS.map(t => [t, 0]));

  function applyRank(key, multiplier) {
    const ranked = ETF_TICKERS
      .map(t => ({ t, v: indicators[t]?.[key] ?? -Infinity }))
      .sort((a, b) => b.v - a.v);
    const pts = [1.0, 0.5, 0.0];
    ranked.forEach(({ t }, i) => { scores[t] += pts[i] * multiplier; });
  }

  applyRank('roc5',  1.0);
  applyRank('roc21', 1.0);

  // Acceleration bonus: short-term ROC outpacing longer windows
  ETF_TICKERS.forEach(t => {
    const ind = indicators[t];
    if (!ind) return;
    if (ind.roc5 != null && ind.roc21 != null && ind.roc5 > ind.roc21) scores[t] += 0.5;
    if (ind.roc5 != null && ind.roc63 != null && ind.roc5 > ind.roc63) scores[t] += 0.5;
  });

  return scores;
}

// ---------------------------------------------------------------------------
// Technical score: RSI + MACD + price vs MAs (clamped to -2…+2)
// ---------------------------------------------------------------------------
function technicalScore(ind) {
  if (!ind) return 0;
  let score = 0;

  if (ind.rsi14 != null) {
    if      (ind.rsi14 > 70) score -= 1;   // overbought
    else if (ind.rsi14 > 55) score += 1;   // healthy momentum
    else if (ind.rsi14 < 35) score -= 1;   // weak momentum
  }

  if (ind.macd) {
    const { histogram, prevHistogram } = ind.macd;
    if (histogram != null && prevHistogram != null) {
      if      (histogram > 0 && histogram > prevHistogram) score += 1;  // bullish acceleration
      else if (histogram < 0 && histogram < prevHistogram) score -= 1;  // bearish acceleration
    }
  }

  if (ind.priceVs50dma != null) {
    if      (ind.priceVs50dma >  0.02) score += 0.5;
    else if (ind.priceVs50dma < -0.02) score -= 0.5;
  }

  return clamp(score, -2, 2);
}

// ---------------------------------------------------------------------------
// Human-readable reasons for the signal
// ---------------------------------------------------------------------------
function generateReasons(ticker, ind, relScore, sentiment, signal) {
  const reasons = [];

  if (relScore > 2.0)      reasons.push('Strongest relative performer vs peers across 1W/1M/3M');
  else if (relScore > 1.2) reasons.push('Above-average relative performance vs peers');
  else if (relScore < 0.8) reasons.push('Lagging peers — weakest relative performance');

  if (ind?.roc21 != null) {
    const pct = (ind.roc21 * 100).toFixed(1);
    reasons.push(`1-month return: ${pct > 0 ? '+' : ''}${pct}%`);
  }
  if (ind?.roc63 != null) {
    const pct = (ind.roc63 * 100).toFixed(1);
    reasons.push(`3-month return: ${pct > 0 ? '+' : ''}${pct}%`);
  }

  if (ind?.rsi14 != null) {
    const r = ind.rsi14.toFixed(0);
    if      (ind.rsi14 > 70) reasons.push(`RSI ${r} — overbought, momentum may stall soon`);
    else if (ind.rsi14 > 55) reasons.push(`RSI ${r} — healthy upward momentum zone`);
    else if (ind.rsi14 < 35) reasons.push(`RSI ${r} — momentum weakening`);
    else                     reasons.push(`RSI ${r} — neutral zone`);
  }

  if (ind?.macd) {
    const { histogram, prevHistogram } = ind.macd;
    if      (histogram > 0 && histogram > prevHistogram) reasons.push('MACD histogram positive and widening — bullish acceleration');
    else if (histogram > 0 && histogram < prevHistogram) reasons.push('MACD positive but decelerating — watch for reversal');
    else if (histogram < 0 && histogram < prevHistogram) reasons.push('MACD histogram negative and widening — bearish momentum');
    else if (histogram < 0)                              reasons.push('MACD negative but histogram recovering');
  }

  // ROC acceleration — the fastest trend signal
  if (ind?.roc5 != null && ind?.roc21 != null) {
    if (ind.roc5 > ind.roc21 * 1.5) reasons.push('Short-term momentum accelerating above medium-term pace — emerging trend');
    else if (ind.roc5 < 0 && ind.roc21 > 0) reasons.push('Recent week negative despite positive 1-month — momentum decelerating');
  }

  // Sentiment context
  const { vix, gspc, tnx, emergencyBearCross } = sentiment;
  if      (emergencyBearCross)             reasons.push('ALERT: S&P 500 crossed below its 200-day MA — bear regime');
  else if (gspc.score >= 2)                reasons.push('S&P 500 well above 200dMA — supportive bull regime');
  else if (gspc.score <= -1)               reasons.push('S&P 500 below 200dMA — bear market headwinds');

  if      (vix.band === 'CRISIS')          reasons.push(`VIX ${vix.value} — extreme fear, very high market risk`);
  else if (vix.band === 'HIGH')            reasons.push(`VIX ${vix.value} — elevated fear, risk appetite suppressed`);
  else if (vix.trendBonus === -1)          reasons.push(`VIX spiking — fear rising fast, monitor closely`);
  else if (vix.trendBonus ===  1)          reasons.push(`VIX declining — fear receding, conditions improving`);
  else if (vix.band === 'LOW')             reasons.push(`VIX ${vix.value} — low fear, supportive risk environment`);

  if (ticker !== VALUE_TICKER && tnx.label === 'SHARPLY_RISING')  reasons.push('Rising yields headwind for quality/momentum factor');
  if (ticker !== VALUE_TICKER && tnx.label === 'SHARPLY_FALLING') reasons.push('Falling yields tailwind for quality/momentum factor');
  if (ticker === VALUE_TICKER && tnx.label === 'SHARPLY_RISING')  reasons.push('Rising yields relatively supportive for value factor');

  return reasons;
}

// ---------------------------------------------------------------------------
// Main signal engine
// ---------------------------------------------------------------------------
async function getSignals() {
  const rawData   = await fetchAllData();
  const sentiment = scoreSentiment(rawData);

  // Calculate technical indicators for each ETF
  const indicators = {};
  for (const ticker of ETF_TICKERS) {
    const history = rawData[`${ticker}_history`];
    indicators[ticker] = history ? calcIndicators(history) : null;
  }

  const relScores  = relativePerformanceScores(indicators);
  const momScores  = momentumScores(indicators);

  const etfs = ETF_TICKERS.map(ticker => {
    const ind   = indicators[ticker];
    const quote = rawData[`${ticker}_quote`];

    const rel    = relScores[ticker] ?? 0;
    const mom    = momScores[ticker] ?? 0;
    const tech   = technicalScore(ind);

    // Factor-aware TNX adjustment: value ETF benefits from rising yields;
    // quality/momentum ETFs benefit from falling yields
    const tnxScore  = ticker === VALUE_TICKER
      ? sentiment.tnx.valueScore
      : sentiment.tnx.growthScore;

    // Sentiment adjustment is a half-weight overlay — modulates, not dominates
    const sentAdj = clamp((sentiment.composite + tnxScore) * 0.5, -3, 3);
    let totalScore = rel + mom + tech + sentAdj;

    // Downgrade if price is significantly below 200dMA (bear trend confirmation)
    if (ind?.priceVs200dma != null && ind.priceVs200dma < -0.05) {
      totalScore = Math.min(totalScore, 3.4);
    }

    // Determine signal and confidence before overrides
    let signal, confidence;
    if      (totalScore >= 5.0) { signal = 'STRONG BUY'; confidence = 'HIGH';   }
    else if (totalScore >= 3.5) { signal = 'BUY';        confidence = 'MEDIUM'; }
    else if (totalScore >= 2.0) { signal = 'HOLD';       confidence = 'MEDIUM'; }
    else if (totalScore >= 0.5) { signal = 'HOLD';       confidence = 'LOW';    }
    else                        { signal = 'SELL';        confidence = 'LOW';    }

    // Emergency overrides (applied last)
    let override = null;
    if (sentiment.emergencyBearCross) {
      signal    = 'SELL';
      confidence = 'HIGH';
      override  = 'S&P 500 crossed below 200dMA — market in bear regime, rotating out';
    } else if (sentiment.extremeFear) {
      // VIX > 30: suppress all BUY signals — no forced selling into panic
      if (signal === 'STRONG BUY' || signal === 'BUY') {
        signal    = 'HOLD';
        confidence = 'LOW';
        override  = `VIX ${sentiment.vix.value} — extreme fear, BUY suppressed to protect capital`;
      }
    }

    const reasons = generateReasons(ticker, ind, rel, sentiment, signal);
    if (override) reasons.unshift(`OVERRIDE: ${override}`);

    const price    = quote?.regularMarketPrice ?? null;
    const currency = quote?.currency ?? null;

    return {
      ticker,
      name:        ETF_NAMES[ticker],
      currency,
      price,
      priceGBP:    price && currency ? parseFloat(normalisePriceToGBP(price, currency).toFixed(2)) : null,
      marketState: quote?.marketState ?? null,
      returns: {
        '1W': ind?.roc5  != null ? parseFloat((ind.roc5  * 100).toFixed(2)) : null,
        '1M': ind?.roc21 != null ? parseFloat((ind.roc21 * 100).toFixed(2)) : null,
        '3M': ind?.roc63 != null ? parseFloat((ind.roc63 * 100).toFixed(2)) : null
      },
      technicals: {
        rsi14:         ind?.rsi14         != null ? parseFloat(ind.rsi14.toFixed(1))                          : null,
        macd:          ind?.macd               ? {
          macd:      parseFloat((ind.macd.macd      ?? 0).toFixed(4)),
          signal:    parseFloat((ind.macd.signal    ?? 0).toFixed(4)),
          histogram: parseFloat((ind.macd.histogram ?? 0).toFixed(4))
        } : null,
        priceVs50dma:  ind?.priceVs50dma  != null ? parseFloat((ind.priceVs50dma  * 100).toFixed(2)) : null,
        priceVs200dma: ind?.priceVs200dma != null ? parseFloat((ind.priceVs200dma * 100).toFixed(2)) : null
      },
      scores: {
        relative:          parseFloat(rel.toFixed(2)),
        momentum:          parseFloat(mom.toFixed(2)),
        technical:         parseFloat(tech.toFixed(2)),
        sentimentAdjusted: parseFloat(sentAdj.toFixed(2)),
        total:             parseFloat(totalScore.toFixed(2))
      },
      signal,
      confidence,
      reasons,
      chartData: {
        dates:    ind?.dates       ?? [],
        prices:   ind?.closes      ?? [],
        rsiDates: ind?.rsiDates    ?? [],
        rsi:      ind?.rsiHistory  ?? [],
        macdHistory: ind?.macd?.history ?? []
      }
    };
  });

  // If all ETFs are weak in a risk-off regime, suppress any residual BUY signals
  const allWeak = etfs.every(e => (e.scores.total ?? 0) < 1.5);
  if (allWeak && sentiment.regime === 'RISK_OFF') {
    etfs.forEach(e => {
      if (e.signal === 'BUY' || e.signal === 'STRONG BUY') {
        e.signal     = 'HOLD';
        e.confidence = 'LOW';
        e.reasons.unshift('All factors weak in risk-off regime — rotation not recommended');
      }
    });
  }

  return {
    timestamp:    new Date().toISOString(),
    marketRegime: sentiment.regime,
    sentiment: {
      vix:       sentiment.vix,
      gspc:      { value: sentiment.gspc.value, ma200: sentiment.gspc.ma200, ratio: sentiment.gspc.ratio, score: sentiment.gspc.score, bearCross: sentiment.gspc.bearCross },
      tnx:       sentiment.tnx,
      composite: sentiment.composite,
      label:     sentiment.label
    },
    etfs
  };
}

module.exports = { getSignals };
