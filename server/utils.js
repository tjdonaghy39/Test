'use strict';

// LSE ETFs trade in pence (GBX), not pounds. Divide by 100 for display only.
function normalisePriceToGBP(price, currency) {
  return currency === 'GBX' ? price / 100 : price;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Extract adjClose (or close fallback) sorted oldest-to-newest
function getAdjClose(history) {
  return history
    .filter(d => d.adjClose != null || d.close != null)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(d => d.adjClose ?? d.close);
}

function getDates(history) {
  return history
    .filter(d => d.adjClose != null || d.close != null)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(d => new Date(d.date).toISOString().split('T')[0]);
}

function normalise01(value, min, max) {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function withRetry(fn, retries = 3, delayMs = 1000) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(r => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

class ConcurrencyLimiter {
  constructor(max) {
    this.max = max;
    this.running = 0;
    this.queue = [];
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          if (this.queue.length > 0) this.queue.shift()();
        }
      };
      if (this.running < this.max) execute();
      else this.queue.push(execute);
    });
  }
}

module.exports = {
  normalisePriceToGBP,
  daysAgo,
  getAdjClose,
  getDates,
  normalise01,
  clamp,
  withRetry,
  ConcurrencyLimiter
};
