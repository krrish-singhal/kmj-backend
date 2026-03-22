import { getFirestore } from '../config/firebase.js';
import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';

const Counter = createFirestoreModel({
  modelName: 'Counter',
  collectionName: COLLECTIONS.counters,
  statics: {
    async getNextSequence(sequenceName) {
      const db = getFirestore();
      const ref = db.collection(COLLECTIONS.counters).doc(String(sequenceName));

      const nextVal = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? snap.data() : {};
        const prev = Number(current.sequenceValue ?? current.sequence ?? 0);
        const updated = prev + 1;
        tx.set(
          ref,
          {
            sequenceValue: updated,
            // keep legacy compatibility
            sequence: updated,
            lastResetDate: current.lastResetDate || new Date(),
            updatedAt: new Date(),
            createdAt: current.createdAt || new Date(),
          },
          { merge: true }
        );
        return updated;
      });

      return nextVal;
    },

    async getCurrentSequence(sequenceName) {
      const db = getFirestore();
      const snap = await db.collection(COLLECTIONS.counters).doc(String(sequenceName)).get();
      if (!snap.exists) return 0;
      const data = snap.data();
      return Number(data.sequenceValue ?? data.sequence ?? 0);
    },

    async resetSequence(sequenceName, value = 0) {
      const db = getFirestore();
      const ref = db.collection(COLLECTIONS.counters).doc(String(sequenceName));
      await ref.set(
        {
          sequenceValue: value,
          sequence: value,
          lastResetDate: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
      const snap = await ref.get();
      return { _id: snap.id, ...snap.data() };
    },

    async setSequence(sequenceName, value) {
      return this.resetSequence(sequenceName, value);
    },

    async initializeCounters() {
      // No-op initializer for Firestore (counters are created on first use).
      return true;
    },

    async checkAndResetCounters() {
      // Optional in Firestore; keep as no-op.
      return true;
    },

    async getAllCounters() {
      const docs = await this.find({}).sort({ _id: 1 }).lean();
      return docs;
    },
  },
});

export default Counter;
