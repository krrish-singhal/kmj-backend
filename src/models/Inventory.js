import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import User from './User.js';

const Inventory = createFirestoreModel({
  modelName: 'Inventory',
  collectionName: COLLECTIONS.inventory,
  refs: {
    createdBy: { model: User, select: 'name email username' },
  },
});

export default Inventory;
