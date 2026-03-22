import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import Member from './Member.js';
import User from './User.js';

const Account = createFirestoreModel({
  modelName: 'Account',
  collectionName: COLLECTIONS.accounts,
  refs: {
    memberId: { model: Member, select: 'Fname Mid Address' },
    collectedBy: { model: User, select: 'username name email' },
    createdBy: { model: User, select: 'username name email' },
  },
});

// Keep discriminator exports for backwards compatibility.
const AccountLand = Account;
const AccountMadrassa = Account;
const AccountNercha = Account;
const AccountSadhu = Account;

export { Account, AccountLand, AccountMadrassa, AccountNercha, AccountSadhu };
export default Account;
