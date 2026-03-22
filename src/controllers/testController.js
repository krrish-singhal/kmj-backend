import { getFirestore } from "../config/firebase.js";
import { COLLECTIONS } from "../db/firestore/collectionNames.js";
import { logger } from "../utils/logger.js";

export const testCollections = async (req, res) => {
  try {
    const db = getFirestore();

    const configured = Object.values(COLLECTIONS);
    const collectionNames = Array.from(new Set(configured));

    logger.info(
      `Test collections: checking ${collectionNames.length} collections`,
    );

    const samples = {};

    for (const name of collectionNames) {
      const ref = db.collection(name);
      // Count + sample (limit 1)
      const snap = await ref.limit(1).get();
      const sample = snap.empty
        ? null
        : { _id: snap.docs[0].id, ...snap.docs[0].data() };
      // Firestore count aggregation is available but to keep compatibility we do a lightweight estimate via a small query.
      // For accurate counts in production, add a dedicated stats endpoint / counter.
      const countSnap = await ref.count().get();
      const count = countSnap.data().count;

      samples[name] = {
        count,
        sampleDocument: sample,
      };
    }

    res.json({
      success: true,
      collections: collectionNames,
      samples,
    });
  } catch (error) {
    logger.error(
      `Test collections failed: ${error?.message || "unknown error"}`,
    );
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
