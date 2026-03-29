'use strict';

const YahooFinance = require('yahoo-finance2').default;
const { daysAgo, withRetry, ConcurrencyLimiter } = require('./utils');

// Instantiate once — v3 requires `new YahooFinance()` rather than using .default directly
const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

const ETF_TICKERS       = ['IWFQ.L', 'IWFV.L', 'IWFM.L'];
const SENTIMENT_TICKERS = ['^VIX', '^GSPC', '^TNX'];

const limiter = new ConcurrencyLimiter(
  parseInt(process.env.MAX_CONCURRENT_YAHOO_REQUESTS) || 2
);
const RETRY_COUNT = parseInt(process.env.YAHOO_RETRY_COUNT) || 3;
const RETRY_DELAY = parseInt(process.env.YAHOO_RETRY_BASE_DELAY_MS) || 1000;

// chart() is the current supported endpoint (historical() was removed by Yahoo).
// We transform the response into the same {date, adjClose, close, ...} shape
// that the rest of the codebase expects from getAdjClose() / getDates().
async function fetchHistorical(ticker, daysBack) {
  return limiter.run(() =>
    withRetry(async () => {
      const result = await yf.chart(ticker, {
        period1:         daysAgo(daysBack),
        period2:         new Date(),
        interval:        '1d',
        includePrePost:  false
      });

      // chart() returns { quotes: [{date, open, high, low, close, volume, adjclose}] }
      return (result.quotes || []).map(q => ({
        date:     q.date,
        open:     q.open,
        high:     q.high,
        low:      q.low,
        close:    q.close,
        volume:   q.volume,
        adjClose: q.adjclose ?? q.close   // chart() uses lowercase 'adjclose'
      }));
    }, RETRY_COUNT, RETRY_DELAY)
  );
}

async function fetchQuote(ticker) {
  return limiter.run(() =>
    withRetry(() => yf.quote(ticker), RETRY_COUNT, RETRY_DELAY)
  );
}

async function fetchAllData() {
  const results = {};

  // Historical lookback windows
  // ETFs: 130 days gives ~90 trading days + warmup buffer for MACD (needs 34+)
  // GSPC: 300 days to cover 200 trading days needed for 200dMA
  // VIX/TNX: 35 days for recent trend analysis
  const histFetches = [
    ...ETF_TICKERS.map(t => ({ ticker: t, days: 130 })),
    { ticker: '^GSPC', days: 300 },
    { ticker: '^VIX',  days: 35  },
    { ticker: '^TNX',  days: 35  }
  ];

  const histResults = await Promise.allSettled(
    histFetches.map(({ ticker, days }) => fetchHistorical(ticker, days))
  );

  histFetches.forEach(({ ticker }, i) => {
    const r = histResults[i];
    if (r.status === 'fulfilled') {
      results[`${ticker}_history`] = r.value;
    } else {
      console.error(`[dataFetcher] History fetch failed for ${ticker}:`, r.reason?.message);
      results[`${ticker}_history`] = null;
    }
  });

  // Real-time quotes for all tickers
  const allTickers = [...ETF_TICKERS, ...SENTIMENT_TICKERS];
  const quoteResults = await Promise.allSettled(
    allTickers.map(t => fetchQuote(t))
  );

  allTickers.forEach((ticker, i) => {
    const r = quoteResults[i];
    if (r.status === 'fulfilled') {
      results[`${ticker}_quote`] = r.value;
    } else {
      console.error(`[dataFetcher] Quote fetch failed for ${ticker}:`, r.reason?.message);
      results[`${ticker}_quote`] = null;
    }
  });

  return results;
}

module.exports = { fetchAllData, ETF_TICKERS, SENTIMENT_TICKERS };
