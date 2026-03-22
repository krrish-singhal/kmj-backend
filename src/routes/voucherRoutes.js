/**
 * Voucher Routes
 */

import express from 'express';
import {
  getVouchers,
  getVoucher,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  getVoucherStats,
} from '../controllers/voucherController.js';
import { verifyToken, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);
router.use(authorize('admin'));

router.get('/stats', getVoucherStats);
router.route('/').get(getVouchers).post(createVoucher);
router.route('/:id').get(getVoucher).put(updateVoucher).delete(deleteVoucher);

export default router;
