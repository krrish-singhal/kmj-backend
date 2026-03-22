import { createFirestoreModel } from '../db/firestore/model.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import User from './User.js';

const Contact = createFirestoreModel({
  modelName: 'Contact',
  collectionName: COLLECTIONS.contacts,
  refs: {
    createdBy: { model: User, select: 'name email username' },
  },
  beforeCreate: async (doc) => {
    if (doc.isDeleted === undefined) doc.isDeleted = false;
  },
});

export default Contact;
