'use strict';

/**
 * generate-signals.js
 * Run by GitHub Actions on a schedule. Fetches live data, computes signals,
 * and writes the result to docs/data/signals.json for GitHub Pages to serve.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { getSignals } = require('../server/signalEngine');

const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'data', 'signals.json');

async function main() {
  console.log('Fetching ETF data and computing signals…');

  let signals;
  try {
    signals = await getSignals();
  } catch (err) {
    console.error('Failed to fetch signals:', err.message);

    // If an existing file exists, leave it untouched so stale data persists
    if (fs.existsSync(OUTPUT_PATH)) {
      console.log('Keeping existing signals.json (fetch failed).');
      process.exit(0);
    }
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(signals, null, 2));
  console.log(`signals.json written → ${OUTPUT_PATH}`);
  console.log(`Market regime: ${signals.marketRegime}`);
  signals.etfs.forEach(e => console.log(`  ${e.ticker}: ${e.signal} (score ${e.scores.total})`));

  // Yahoo Finance leaves open keep-alive connections — force exit so the
  // process doesn't hang indefinitely waiting for them to close.
  process.exit(0);
}

main();
