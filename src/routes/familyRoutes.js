/**
 * Family Routes
 * Family member management endpoints for users
 */

import express from 'express';
import {
  getFamilyMembers,
  getFamilyMember,
  addFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  getFamilyStats
} from '../controllers/familyController.js';
import { validateObjectId } from '../middleware/validate.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Family member routes
router.get('/', getFamilyMembers);
router.get('/stats', getFamilyStats);
router.post('/', addFamilyMember);
router.get('/:id', validateObjectId, getFamilyMember);
router.put('/:id', validateObjectId, updateFamilyMember);
router.delete('/:id', validateObjectId, deleteFamilyMember);

export default router;
