/**
 * User Controller
 * Handles user profile management, settings, and user-related operations
 * Maintains compatibility with old PHP user pages (Userpage.php, mprofile.php)
 */

import { User, Member, Bill } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import bcrypt from 'bcryptjs';

/**
 * @route   GET /api/v1/users/profile
 * @desc    Get current user profile (matches old mprofile.php)
 * @access  Private
 */
export const getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('-password');
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Get family members (census data)
  const familyMembers = await Member.find({ Mid: user.memberId });
  
  // Get recent bills
  const recentBills = await Bill.find({ mahal_ID: user.memberId })
    .sort({ Date_time: -1 })
    .limit(10);
  
  res.status(200).json({
    success: true,
    data: {
      user,
      familyMembers,
      recentBills,
      stats: {
        totalMembers: familyMembers.length,
        totalBills: recentBills.length
      }
    }
  });
});

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update user profile
 * @access  Private
 */
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, phone, email, address } = req.body;
  
  // Build update object
  const updateData = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  if (email) updateData.email = email;
  if (address) updateData.address = address;
  
  // Update user
  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user
    }
  });
});

/**
 * @route   PUT /api/v1/users/password
 * @desc    Update password
 * @access  Private
 */
export const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  // Get user with password
  const user = await User.findById(req.user._id).select('+password');
  
  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  
  if (!isPasswordValid) {
    return next(new AppError('Current password is incorrect', 401));
  }
  
  // Update password
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Password updated successfully'
  });
});

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID (admin only or own profile)
 * @access  Private
 */
export const getUserById = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password');
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Check if user is accessing own profile or is admin
  if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
    return next(new AppError('Access denied', 403));
  }
  
  res.status(200).json({
    success: true,
    data: {
      user
    }
  });
});

/**
 * @route   GET /api/v1/users
 * @desc    Get all users (admin only, matches old Userview.php)
 * @access  Private (Admin)
 */
export const getAllUsers = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search,
    role,
    isActive
  } = req.query;
  
  // Build query
  const query = {};
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { memberId: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  
  // Execute query with pagination
  const users = await User.find(query)
    .select('-password')
    .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  
  const total = await User.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update user (admin only)
 * @access  Private (Admin)
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  const { name, phone, email, address, role, isActive } = req.body;
  
  // Build update object
  const updateData = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  if (email) updateData.email = email;
  if (address) updateData.address = address;
  if (role) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;
  
  // Update user
  const user = await User.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    success: true,
    message: 'User updated successfully',
    data: {
      user
    }
  });
});

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user (admin only)
 * @access  Private (Admin)
 */
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Don't allow deleting self
  if (req.user._id.toString() === req.params.id) {
    return next(new AppError('You cannot delete your own account', 400));
  }
  
  // Soft delete (deactivate)
  user.isActive = false;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'User deactivated successfully'
  });
});

/**
 * @route   GET /api/v1/users/:id/members
 * @desc    Get user's family members (census data)
 * @access  Private
 */
export const getUserMembers = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Check access
  if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
    return next(new AppError('Access denied', 403));
  }
  
  // Get family members
  const members = await Member.find({ Mid: user.memberId })
    .sort({ createdAt: 1 });
  
  res.status(200).json({
    success: true,
    data: {
      members,
      count: members.length
    }
  });
});

/**
 * @route   GET /api/v1/users/:id/bills
 * @desc    Get user's billing history
 * @access  Private
 */
export const getUserBills = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Check access
  if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
    return next(new AppError('Access denied', 403));
  }
  
  // Get bills
  const bills = await Bill.find({ mahal_ID: user.memberId })
    .sort({ Date_time: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  
  const total = await Bill.countDocuments({ mahal_ID: user.memberId });
  
  // Calculate total amount
  const totalAmount = await Bill.aggregate([
    { $match: { mahal_ID: user.memberId } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  res.status(200).json({
    success: true,
    data: {
      bills,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      stats: {
        totalAmount: totalAmount.length > 0 ? totalAmount[0].total : 0,
        totalBills: total
      }
    }
  });
});

/**
 * @route   PUT /api/v1/users/:id/settings
 * @desc    Update user settings
 * @access  Private
 */
export const updateSettings = asyncHandler(async (req, res, next) => {
  const { language, notifications, theme } = req.body;
  
  // Check access
  if (req.user._id.toString() !== req.params.id) {
    return next(new AppError('Access denied', 403));
  }
  
  // Update settings
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      'settings.language': language,
      'settings.notifications': notifications,
      'settings.theme': theme
    },
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    success: true,
    message: 'Settings updated successfully',
    data: {
      settings: user.settings
    }
  });
});

/**
 * @route   GET /api/v1/users/stats
 * @desc    Get user statistics (admin only)
 * @access  Private (Admin)
 */
export const getUserStats = asyncHandler(async (req, res, next) => {
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ isActive: true });
  const inactiveUsers = await User.countDocuments({ isActive: false });
  const adminUsers = await User.countDocuments({ role: 'admin' });
  const regularUsers = await User.countDocuments({ role: 'user' });
  
  // Users by ward
  const usersByWard = await User.aggregate([
    { $group: { _id: '$ward', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  
  // Recent registrations (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentRegistrations = await User.countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  });
  
  res.status(200).json({
    success: true,
    data: {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      admins: adminUsers,
      users: regularUsers,
      byWard: usersByWard,
      recentRegistrations
    }
  });
});
