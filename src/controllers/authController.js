/**
 * Authentication Controller
 * Handles user registration, login, logout, password reset
 * Maintains compatibility with old PHP authentication system
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, Member, Counter } from '../models/index.js';
import { getFirestore } from '../config/firebase.js';
import { COLLECTIONS } from '../db/firestore/collectionNames.js';
import { userDocIdFromMemberId } from '../utils/firestoreDocIds.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Generate JWT token
 */
const generateToken = (userId, memberId, role) => {
  return jwt.sign(
    { id: userId, memberId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
};

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new user (matches old PHP registration)
 * @access  Public
 */
export const register = asyncHandler(async (req, res, next) => {
  const { name, address, aadhaar, ward, houseNo, phone } = req.body;
  
  // Check if aadhaar already exists (old PHP check: SELECT * FROM register WHERE aadhaar=?)
  const existingUser = await User.findOne({ aadhaar });
  
  if (existingUser) {
    return next(new AppError('Aadhaar number already registered. Please login.', 400));
  }
  
  // Generate memberId (ward/houseNo format - matches old PHP: $userid = $ward . "/" . $houseno)
  const memberId = `${ward}/${houseNo}`;
  
  // Store users as users/{docId} for O(1) login lookup
  // (memberId contains '/', which is invalid in Firestore doc IDs)
  const db = getFirestore();
  const userDocId = userDocIdFromMemberId(memberId);
  const userDocRef = db.collection(COLLECTIONS.users).doc(userDocId);
  const existingDoc = await userDocRef.get();
  if (existingDoc.exists) {
    return next(new AppError(`Member ID ${memberId} already exists. Use a different house number.`, 400));
  }
  
  // Old PHP used aadhaar as password by default
  // We'll keep this for backward compatibility but hash it
  const hashedPassword = await bcrypt.hash(aadhaar, 10);
  
  const now = new Date();
  const userPayload = {
    _id: memberId,
    memberId,
    username: memberId,
    name,
    email: `${memberId.replace(/\//g, '_')}@kmj.local`,
    phone,
    aadhaar,
    ward,
    address,
    password: hashedPassword,
    role: 'user',
    isActive: true,
    profileComplete: true,
    createdAt: now,
    updatedAt: now,
  };

  await userDocRef.set(userPayload, { merge: false });
  
  // Generate token
  const token = generateToken(userPayload._id, userPayload.memberId, userPayload.role);
  const refreshToken = generateRefreshToken(userPayload._id);
  
  // Send response (matching old PHP success behavior)
  res.status(201).json({
    success: true,
    message: 'Registration successful! You can now login with your Member ID and Aadhaar number.',
    data: {
      user: {
        id: userPayload._id,
        memberId: userPayload.memberId,
        name: userPayload.name,
        ward: userPayload.ward,
        role: userPayload.role
      },
      token,
      refreshToken
    }
  });
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    User login (matches old PHP login)
 * @access  Public
 */
export const login = asyncHandler(async (req, res, next) => {
  const { memberId, password } = req.body;

  const memberIdInput = String(memberId || '').trim();

  // Avoid noisy per-request logs in a high-traffic endpoint.
  
  // Fast path: users/{docId} (docId is derived from memberId)
  const db = getFirestore();
  const docId = userDocIdFromMemberId(memberIdInput);
  const docRef = db.collection(COLLECTIONS.users).doc(docId);
  const docSnap = await docRef.get();
  const docData = docSnap.exists ? docSnap.data() : null;
  const docUser = docData ? { ...docData, _id: docData._id || docSnap.id } : null;

  // Fallback for legacy data where docId != memberId
  const user =
    docUser ||
    (await User.findOne({
      $or: [{ memberId: memberIdInput }, { username: memberIdInput }],
    }).select('+password'));
  
  if (!user) {
    return next(new AppError('Invalid Member ID or password.', 401));
  }

  const persist = async (updates) => {
    if (docUser) {
      await docRef.set({ ...updates, updatedAt: new Date() }, { merge: true });
      Object.assign(user, updates);
      return;
    }
    Object.assign(user, updates);
    await user.save({ validateBeforeSave: false });
  };
  
  // Check if user has a password
  if (!user.password) {
    logger.warn(`Login blocked: user has no password (memberId=${memberIdInput})`);
    return next(new AppError('Account not properly set up. Please contact admin.', 401));
  }
  
  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact admin.', 403));
  }
  
  // Verify password
  let isPasswordValid = false;
  
  // Try bcrypt comparison first (for hashed passwords)
  try {
    isPasswordValid = await bcrypt.compare(password, user.password);
  } catch (error) {
    logger.warn(`Login bcrypt compare failed: ${error?.message || 'unknown error'}`);
  }
  
  // If bcrypt fails, check if it's a plain text password (for old PHP system compatibility)
  if (!isPasswordValid && user.password === password) {
    isPasswordValid = true;
    
    // Update to hashed password for security
    const hashed = await bcrypt.hash(password, 10);
    await persist({ password: hashed });
  }
  
  // TEMPORARY FIX: If password doesn't match but provided password matches Aadhaar,
  // update the password to Aadhaar (for migration from old system)
  if (!isPasswordValid && user.aadhaar && password === user.aadhaar) {
    isPasswordValid = true;
    
    const hashedPassword = await bcrypt.hash(password, 10);
    if (docUser) {
      await persist({ password: hashedPassword, lastLogin: new Date() });
    } else {
      await User.findByIdAndUpdate(user._id, {
        password: hashedPassword,
        lastLogin: new Date(),
      });
    }
    
  }
  
  if (!isPasswordValid) {
    return next(new AppError('Invalid Member ID or password.', 401));
  }
  
  // Update last login
  await persist({ lastLogin: new Date() });
  
  // Generate tokens
  const token = generateToken(user._id, user.memberId || user.username, user.role);
  const refreshToken = generateRefreshToken(user._id);
  
  // Send response with user data (matching old PHP session data)
  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        memberId: user.memberId,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        ward: user.ward,
        role: user.role,
        isActive: user.isActive,
        profileComplete: user.profileComplete,
        lastLogin: user.lastLogin
      },
      token,
      refreshToken
    }
  });
});

/**
 * @route   POST /api/v1/auth/logout
 * @desc    User logout
 * @access  Private
 */
export const logout = asyncHandler(async (req, res, next) => {
  // In JWT, logout is handled client-side by removing the token
  // But we can blacklist the token if needed (requires Redis or similar)
  
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh JWT token
 * @access  Public
 */
export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken: token } = req.body;
  
  if (!token) {
    return next(new AppError('Refresh token is required', 400));
  }
  
  try {
    // Verify refresh token
    const decoded = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );
    
    // Get user
    const user = await User.findById(decoded.id);
    
    if (!user || !user.isActive) {
      return next(new AppError('Invalid refresh token', 401));
    }
    
    // Generate new tokens
    const newToken = generateToken(user._id, user.memberId, user.role);
    const newRefreshToken = generateRefreshToken(user._id);
    
    res.status(200).json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
    
  } catch (error) {
    return next(new AppError('Invalid or expired refresh token', 401));
  }
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current logged in user
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res, next) => {
  // User is already attached to req by verifyToken middleware
  const user = await User.findById(req.user._id).select('-password');
  
  res.status(200).json({
    success: true,
    data: {
      user
    }
  });
});

/**
 * @route   PUT /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  // Get user with password
  const user = await User.findById(req.user._id).select('+password');
  
  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  
  if (!isPasswordValid) {
    return next(new AppError('Current password is incorrect', 401));
  }
  
  // Hash new password
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Generate password reset token
 * @access  Public
 */
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { memberId, aadhaar } = req.body;
  
  // Find user by memberId and aadhaar (security check)
  const user = await User.findOne({ memberId, aadhaar });
  
  if (!user) {
    return next(new AppError('No user found with that Member ID and Aadhaar combination', 404));
  }
  
  // Generate reset token (6-digit code)
  const resetToken = crypto.randomInt(100000, 999999).toString();
  
  // Hash token and save to database
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  await user.save({ validateBeforeSave: false });
  
  // In production, send SMS/email with resetToken
  // For now, return it in response (development only)
  res.status(200).json({
    success: true,
    message: 'Password reset code generated',
    data: {
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
      message: 'Please use this code to reset your password within 10 minutes'
    }
  });
});

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using token
 * @access  Public
 */
export const resetPassword = asyncHandler(async (req, res, next) => {
  const { resetToken, newPassword, memberId } = req.body;
  
  // Hash token
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Find user with valid reset token
  const user = await User.findOne({
    memberId,
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new AppError('Invalid or expired reset token', 400));
  }
  
  // Set new password
  user.password = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  
  await user.save();
  
  // Generate new token
  const token = generateToken(user._id, user.memberId, user.role);
  
  res.status(200).json({
    success: true,
    message: 'Password reset successful',
    data: {
      token
    }
  });
});

/**
 * @route   POST /api/v1/auth/verify-member
 * @desc    Verify member ID and aadhaar before registration
 * @access  Public
 */
export const verifyMember = asyncHandler(async (req, res, next) => {
  const { memberId, aadhaar } = req.body;
  
  // Check if already registered
  const existingUser = await User.findOne({
    $or: [{ memberId }, { aadhaar }]
  });
  
  if (existingUser) {
    if (existingUser.memberId === memberId) {
      return next(new AppError('Member ID already registered', 400));
    }
    if (existingUser.aadhaar === aadhaar) {
      return next(new AppError('Aadhaar already registered', 400));
    }
  }
  
  res.status(200).json({
    success: true,
    message: 'Member ID and Aadhaar are available',
    data: {
      available: true
    }
  });
});
