import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import User from './User.js';
import Inventory from './Inventory.js';

const Report = createFirestoreModel({
  modelName: 'Report',
  collectionName: COLLECTIONS.reports,
  refs: {
    createdBy: { model: User, select: 'name email username' },
    inventoryItem: { model: Inventory, select: 'name department title' },
  },
});

export default Report;
