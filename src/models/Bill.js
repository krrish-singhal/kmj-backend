import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import Member from './Member.js';
import User from './User.js';

const Bill = createFirestoreModel({
  modelName: 'Bill',
  collectionName: COLLECTIONS.bills,
  refs: {
    memberId: { model: Member, select: 'Fname Mid Address' },
    collectedBy: { model: User, select: 'username name email' },
    voidedBy: { model: User, select: 'username name email' },
    createdBy: { model: User, select: 'username name email' },
  },
});

export default Bill;
