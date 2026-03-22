/**
 * Certificate Routes
 */

import express from 'express';
import {
  getCertificates,
  getCertificate,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  getCertificateStats,
} from '../controllers/certificateController.js';
import { verifyToken, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);
router.use(authorize('admin'));

router.get('/stats', getCertificateStats);
router.route('/').get(getCertificates).post(createCertificate);
router.route('/:id').get(getCertificate).put(updateCertificate).delete(deleteCertificate);

export default router;
