/**
 * User Routes
 * User profile and management endpoints
 */

import express from 'express';
import {
  getProfile,
  updateProfile,
  updatePassword,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  getUserMembers,
  getUserBills,
  updateSettings,
  getUserStats
} from '../controllers/userController.js';
import {
  validateUserUpdate,
  validatePasswordChange,
  validatePagination,
  validateObjectId
} from '../middleware/validate.js';
import { verifyToken, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Current user routes
router.get('/profile', getProfile);
router.put('/profile', validateUserUpdate, updateProfile);
router.put('/password', validatePasswordChange, updatePassword);

// Admin-only routes
router.get('/stats', authorize('admin'), getUserStats);
router.get('/', authorize('admin'), validatePagination, getAllUsers);

// User-specific routes
router.get('/:id', validateObjectId, getUserById);
router.put('/:id', authorize('admin'), validateObjectId, validateUserUpdate, updateUser);
router.delete('/:id', authorize('admin'), validateObjectId, deleteUser);
router.get('/:id/members', validateObjectId, getUserMembers);
router.get('/:id/bills', validateObjectId, validatePagination, getUserBills);
router.put('/:id/settings', validateObjectId, updateSettings);

export default router;
