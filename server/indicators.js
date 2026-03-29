'use strict';

const ti = require('technicalindicators');
const { getAdjClose, getDates } = require('./utils');

function calcRSI(closes, period = 14) {
  if (closes.length < period + 2) return null;
  const values = ti.RSI.calculate({ values: closes, period });
  return values.length > 0 ? values[values.length - 1] : null;
}

function calcRSIHistory(closes, period = 14) {
  if (closes.length < period + 2) return [];
  return ti.RSI.calculate({ values: closes, period });
}

function calcMACD(closes) {
  if (closes.length < 34) return null;
  const values = ti.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  return {
    macd:          last.MACD   ?? null,
    signal:        last.signal ?? null,
    histogram:     last.histogram ?? null,
    prevHistogram: prev.histogram ?? null,
    history: values.map(v => ({
      macd:      v.MACD      ?? null,
      signal:    v.signal    ?? null,
      histogram: v.histogram ?? null
    }))
  };
}

function calcROC(closes, period) {
  if (closes.length < period + 1) return null;
  const current = closes[closes.length - 1];
  const past    = closes[closes.length - 1 - period];
  if (!past || past === 0) return null;
  return (current / past) - 1;
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcIndicators(history) {
  if (!history || history.length === 0) return null;

  const closes = getAdjClose(history);
  const dates  = getDates(history);
  if (closes.length < 20) return null;

  const rsi14        = calcRSI(closes);
  const rsiHistory   = calcRSIHistory(closes);
  const macd         = calcMACD(closes);
  const roc5         = calcROC(closes, 5);    // ~1 week
  const roc21        = calcROC(closes, 21);   // ~1 month
  const roc63        = calcROC(closes, 63);   // ~3 months
  const ma50         = calcSMA(closes, 50);
  const ma200        = calcSMA(closes, 200);
  const currentPrice = closes[closes.length - 1];

  return {
    closes,
    dates,
    currentPrice,
    rsi14,
    rsiHistory,
    rsiDates: dates.slice(dates.length - rsiHistory.length),
    macd,
    roc5,
    roc21,
    roc63,
    ma50,
    ma200,
    priceVs50dma:  ma50  ? (currentPrice - ma50)  / ma50  : null,
    priceVs200dma: ma200 ? (currentPrice - ma200) / ma200 : null
  };
}

module.exports = { calcIndicators };
