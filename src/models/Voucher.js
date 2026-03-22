import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import User from './User.js';

const Voucher = createFirestoreModel({
  modelName: 'Voucher',
  collectionName: COLLECTIONS.vouchers,
  refs: {
    createdBy: { model: User, select: 'name email username' },
  },
});

export default Voucher;
