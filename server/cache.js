'use strict';

const store = new Map();

function getTTL() {
  return (parseInt(process.env.CACHE_TTL_MINUTES) || 15) * 60 * 1000;
}

module.exports = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > getTTL()) return null;
    return entry;
  },

  // Returns cached entry even if expired (for fallback on fetch failure)
  getStale(key) {
    return store.get(key) || null;
  },

  set(key, data) {
    store.set(key, { data, fetchedAt: Date.now() });
  },

  invalidate(key) {
    store.delete(key);
  }
};
