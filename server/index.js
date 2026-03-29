'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const cache = require('./cache');
const { getSignals } = require('./signalEngine');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple in-memory rate limiter: 20 req/min per IP for API routes
const rateLimits = new Map();
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const key = req.ip;
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  if (entry.count >= 20) return res.status(429).json({ error: 'Too many requests' });
  entry.count++;
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/signals', async (req, res) => {
  try {
    const cached = cache.get('signals');
    if (cached) {
      const cacheAge = Math.floor((Date.now() - cached.fetchedAt) / 1000);
      return res.json({ ...cached.data, cacheAge });
    }

    const data = await getSignals();
    cache.set('signals', data);
    return res.json({ ...data, cacheAge: 0 });
  } catch (err) {
    console.error('[/api/signals] Error:', err.message);
    const stale = cache.getStale('signals');
    if (stale) {
      const cacheAge = Math.floor((Date.now() - stale.fetchedAt) / 1000);
      return res.json({ ...stale.data, stale: true, error: 'Using cached data — live fetch failed', cacheAge });
    }
    return res.status(503).json({ error: 'Data unavailable. Please retry shortly.', stale: true });
  }
});

app.get('/api/health', (req, res) => {
  const stale = cache.getStale('signals');
  res.json({
    status: 'ok',
    cacheAge: stale ? Math.floor((Date.now() - stale.fetchedAt) / 1000) : null,
    lastFetched: stale ? new Date(stale.fetchedAt).toISOString() : null
  });
});

app.listen(PORT, () => {
  console.log(`ETF Rotation Signal app → http://localhost:${PORT}`);
});
