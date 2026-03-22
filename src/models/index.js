/**
 * Models Index
 * Central export point for all Mongoose models
 */

import User from './User.js';
import Member from './Member.js';
import Bill from './Bill.js';
import {
  Account,
  AccountLand,
  AccountMadrassa,
  AccountNercha,
  AccountSadhu,
} from './Account.js';
import EidAnual from './EidAnual.js';
import Notice from './Notice.js';
import Counter from './Counter.js';

// Named exports for individual models
export {
  User,
  Member,
  Bill,
  Account,
  AccountLand,
  AccountMadrassa,
  AccountNercha,
  AccountSadhu,
  EidAnual,
  Notice,
  Counter,
};

// Default export as object
export default {
  User,
  Member,
  Bill,
  Account,
  AccountLand,
  AccountMadrassa,
  AccountNercha,
  AccountSadhu,
  EidAnual,
  Notice,
  Counter,
};
