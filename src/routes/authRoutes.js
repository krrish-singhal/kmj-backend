/**
 * Authentication Routes
 * All authentication-related endpoints
 */

import express from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyMember
} from '../controllers/authController.js';
import {
  validateRegistration,
  validateLogin,
  validatePasswordChange
} from '../middleware/validate.js';
import { verifyToken, rateLimiter } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', rateLimiter(10, 60 * 60 * 1000), validateRegistration, register);
router.post('/login', rateLimiter(5, 15 * 60 * 1000), validateLogin, login);
router.post('/refresh-token', refreshToken);
router.post('/verify-member', verifyMember);

// Password reset routes
router.post('/forgot-password', rateLimiter(3, 60 * 60 * 1000), forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.use(verifyToken); // All routes below require authentication

router.get('/me', getMe);
router.get('/admin/profile', getMe); // Admin profile endpoint (uses same getMe logic)
router.post('/logout', logout);
router.put('/change-password', validatePasswordChange, changePassword);

export default router;
