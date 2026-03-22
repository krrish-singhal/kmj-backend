/**
 * Simple stored-counts for Firestore to avoid expensive count aggregations.
 *
 * Stored docs:
 * - stats/membersCount  { total: number }
 * - stats/billsCount    { total: number }
 */

import { getFirestore, getFieldValue } from '../config/firebase.js';
import { createTtlCache } from './ttlCache.js';

const statsCache = createTtlCache(10_000);

const statsDocRef = (key) => {
  const db = getFirestore();
  return db.collection('stats').doc(String(key));
};

export const getStoredCount = async (key) => {
  const cacheKey = `stats:${key}`;
  return statsCache.wrap(
    cacheKey,
    async () => {
      const snap = await statsDocRef(key).get();
      const total = snap.exists ? Number(snap.data()?.total) : NaN;
      return Number.isFinite(total) ? total : null;
    },
    10_000
  );
};

export const incrementStoredCount = async (key, delta) => {
  const by = Number(delta);
  if (!Number.isFinite(by) || by === 0) return;

  const FieldValue = getFieldValue();
  await statsDocRef(key).set(
    {
      total: FieldValue.increment(by),
      updatedAt: new Date(),
    },
    { merge: true }
  );

  // Invalidate cached reads for this key
  statsCache.set(`stats:${key}`, null, 1);
};
