/**
 * Inventory Routes
 */

import express from 'express';
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryStats,
} from '../controllers/inventoryController.js';
import { verifyToken, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);
router.use(authorize('admin'));

router.get('/stats', getInventoryStats);
router.route('/').get(getInventoryItems).post(createInventoryItem);
router.route('/:id').get(getInventoryItem).put(updateInventoryItem).delete(deleteInventoryItem);

export default router;
