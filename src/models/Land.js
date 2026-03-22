import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import User from './User.js';

const Land = createFirestoreModel({
  modelName: 'Land',
  collectionName: COLLECTIONS.lands,
  refs: {
    createdBy: { model: User, select: 'name email username' },
  },
});

export default Land;
