/**
 * Contact Routes
 */

import express from 'express';
import {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  deleteWarrantyFile,
  getContactStats,
} from '../controllers/contactController.js';
import { verifyToken, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);
router.use(authorize('admin'));

router.get('/stats', getContactStats);
router.route('/').get(getContacts).post(createContact);
router.route('/:id').get(getContact).put(updateContact).delete(deleteContact);
router.delete('/:id/files/:fileId', deleteWarrantyFile);

export default router;
