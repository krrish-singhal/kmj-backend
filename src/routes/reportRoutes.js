/**
 * Report Routes
 */

import express from 'express';
import {
  getReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  getReportStats,
} from '../controllers/reportController.js';
import { verifyToken, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);
router.use(authorize('admin'));

router.get('/stats', getReportStats);
router.route('/').get(getReports).post(createReport);
router.route('/:id').get(getReport).put(updateReport).delete(deleteReport);

export default router;
