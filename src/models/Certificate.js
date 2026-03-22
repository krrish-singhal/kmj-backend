import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import User from './User.js';
import Counter from './Counter.js';

const Certificate = createFirestoreModel({
  modelName: 'Certificate',
  collectionName: COLLECTIONS.certificates,
  refs: {
    createdBy: { model: User, select: 'name email username' },
  },
  beforeCreate: async (doc) => {
    // Generate a stable certificate number if missing.
    if (!doc.certificateNumber && doc.type) {
      const year = new Date().getFullYear();
      const prefix = String(doc.type).substring(0, 3).toUpperCase();
      const seq = await Counter.getNextSequence(`certificate_${String(doc.type).toLowerCase()}`);
      doc.certificateNumber = `${prefix}/${year}/${String(seq).padStart(4, '0')}`;
    }
    if (!doc.issueDate) doc.issueDate = new Date();
    if (doc.isDeleted === undefined) doc.isDeleted = false;
  },
});

export default Certificate;
