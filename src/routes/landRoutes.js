/**
 * Land Routes
 */

import express from 'express';
import {
  getLands,
  getLand,
  createLand,
  updateLand,
  deleteLand,
} from '../controllers/landController.js';
import { verifyToken, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);
router.use(authorize('admin'));

router.route('/').get(getLands).post(createLand);
router.route('/:id').get(getLand).put(updateLand).delete(deleteLand);

export default router;
