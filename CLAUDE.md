# CLAUDE.md

This file provides guidance for AI assistants (such as Claude Code) working in this repository.

## Repository Overview

**Name:** ETF Rotation Signal
**Owner:** tjdonaghy39
**Remote:** `tjdonaghy39/Test` on GitHub
**Stack:** Node.js 18+ · Express · yahoo-finance2 · technicalindicators · vanilla JS · Chart.js

A full-stack web application that analyses three iShares World Factor ETFs (IWFQ.L / IWFV.L / IWFM.L) and generates BUY / HOLD / SELL signals using relative performance, technical momentum indicators, and market sentiment overlays.

---

## Repository Structure

```
Test/
├── package.json               # npm project (CommonJS, no build step)
├── .env                       # Runtime config (PORT, cache TTL, retry settings)
├── .gitignore
├── CLAUDE.md                  # This file
├── README.md
│
├── server/
│   ├── index.js               # Express entry point, routes, rate limiting
│   ├── cache.js               # In-memory TTL cache (Map-based, 15-min default)
│   ├── utils.js               # Shared helpers: GBX/GBP, dates, retry, concurrency
│   ├── dataFetcher.js         # yahoo-finance2 calls with retry + concurrency limit
│   ├── indicators.js          # RSI, MACD, ROC, SMA wrappers (null-safe)
│   ├── sentimentScorer.js     # VIX bands/trend, GSPC vs 200dMA, TNX scoring
│   └── signalEngine.js        # Composite scoring → BUY/HOLD/SELL with reasons
│
└── public/                    # Static files served by Express
    ├── index.html             # Single-page dashboard
    ├── css/
    │   └── styles.css
    └── js/
        ├── app.js             # Fetch cycle, auto-refresh, visibility API
        ├── charts.js          # Chart.js: perf chart, RSI sub-chart, MACD chart
        └── cards.js           # Signal card rendering, sentiment panel updates
```

---

## Running the App

```bash
npm install
npm start          # production
npm run dev        # with --watch auto-restart (Node 18+)
```

Open `http://localhost:3000`. The API auto-refreshes every 15 minutes in the browser.

---

## Architecture & Key Design Decisions

### Data source

`yahoo-finance2` is used instead of Google Finance (no public API). LSE tickers use the `.L` suffix:
- `IWFQ.L` — iShares MSCI World Quality Factor UCITS ETF
- `IWFV.L` — iShares MSCI World Value Factor UCITS ETF
- `IWFM.L` — iShares MSCI World Momentum Factor UCITS ETF

Sentiment tickers: `^VIX`, `^GSPC`, `^TNX`

### GBX vs GBP (critical)

LSE ETFs return prices in **pence (GBX)**, not pounds. Divide by 100 for display only. Return calculations use percentage changes so currency unit doesn't matter. `utils.normalisePriceToGBP()` handles this.

### Signal scoring

Each ETF receives a `totalScore` (roughly −4 to +8) from four components:

| Component | Weight / range | Source |
|---|---|---|
| Relative performance | 0–3 | 1W/1M/3M ROC, min-max scaled vs peers |
| Momentum | 0–3 | ROC rank + acceleration bonus |
| Technical | −2 to +2 | RSI zone + MACD histogram + price vs 50dMA |
| Sentiment adjustment | −3 to +3 | VIX+GSPC+TNX composite, half-weight overlay |

**Thresholds:** `≥5` = STRONG BUY, `≥3.5` = BUY, `≥2` = HOLD (medium), `≥0.5` = HOLD (low), `<0.5` = SELL

**Emergency overrides:**
1. `^GSPC` crosses below its 200dMA → all signals forced to SELL
2. VIX > 30 → BUY signals suppressed to HOLD
3. ETF price >5% below its own 200dMA → score capped at 3.4 (prevents BUY)
4. All ETFs weak in RISK_OFF regime → suppress residual BUYs to HOLD

### Fast trend detection

Short-term ROC acceleration (`ROC_5 > ROC_21 or ROC_63`) fires a signal before MACD crossovers confirm, satisfying the "earlier than standard indicators" requirement. VIX trend (current vs 5-day average) detects sentiment shifts before band thresholds are crossed.

### Caching

Results are cached in memory for 15 minutes (`CACHE_TTL_MINUTES` in `.env`). On fetch failure, stale cached data is returned with `stale: true` and a warning banner is shown in the UI.

### TNX is factor-aware

Rising yields hurt quality/momentum (IWFQ, IWFM) but are relatively neutral-to-supportive for value (IWFV). The TNX score is applied differently per ticker in `signalEngine.js`.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/signals` | Full signal response (ETFs + sentiment + scores) |
| GET | `/api/health` | Cache age and last fetch timestamp |

Frontend calls `/api/signals` on load and every 15 minutes.

---

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `CACHE_TTL_MINUTES` | `15` | How long to cache results |
| `MAX_CONCURRENT_YAHOO_REQUESTS` | `2` | Concurrency limiter for Yahoo Finance |
| `YAHOO_RETRY_COUNT` | `3` | Retries per Yahoo Finance call |
| `YAHOO_RETRY_BASE_DELAY_MS` | `1000` | Base retry delay (doubles each attempt) |

---

## Git Workflow

### Branches

- `main` — stable/default. Do not push directly.
- `claude/<description>` — AI-assisted development branches.

### Current development branch

`claude/add-claude-documentation-ka0jd`

### Commit conventions

Imperative mood, one logical change per commit (e.g. `Add ROC acceleration signal`, `Fix GBX display rounding`).

### Push workflow

```bash
git push -u origin <branch-name>
```

Retry up to 4× on network failure with exponential backoff (2s, 4s, 8s, 16s).

### Pull requests

Do **not** create a pull request unless explicitly requested.

---

## When to Ask vs. Act

**Act freely:**
- Editing server or frontend files
- Running the server locally
- Committing and pushing on the designated branch

**Ask first:**
- Changing signal scoring weights or thresholds (affects trading decisions)
- Switching data provider from Yahoo Finance
- Force-pushing, resetting commits, creating PRs
- Pushing to `main`

---

## Development Notes

- No build tool, transpiler, or test framework is configured. Tests should be added if the project matures.
- Chart.js is loaded from CDN — no bundler needed.
- The server is stateless between restarts (cache is in-memory). No database is used.
- yahoo-finance2 can be brittle (Yahoo's auth layer changes). If fetches fail consistently, check the package's GitHub issues for crumb/cookie workarounds.
