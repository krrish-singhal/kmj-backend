import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import User from './User.js';

const Notice = createFirestoreModel({
  modelName: 'Notice',
  collectionName: COLLECTIONS.notices,
  refs: {
    author: { model: User, select: 'username email name' },
  },
});

export default Notice;
