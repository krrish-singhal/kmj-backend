/**
 * Family Controller
 * Handles family member management for users
 */

import { Member } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

/**
 * @route   GET /api/v1/family
 * @desc    Get all family members for current user
 * @access  Private
 */
export const getFamilyMembers = asyncHandler(async (req, res, next) => {
  const members = await Member.find({ 
    Mid: req.user.memberId,
    isActive: true 
  }).sort({ Relation: 1, Dob: 1 });
  
  res.status(200).json({
    success: true,
    data: {
      members,
      count: members.length
    }
  });
});

/**
 * @route   GET /api/v1/family/:id
 * @desc    Get single family member
 * @access  Private
 */
export const getFamilyMember = asyncHandler(async (req, res, next) => {
  const member = await Member.findOne({
    _id: req.params.id,
    Mid: req.user.memberId,
    isActive: true
  });
  
  if (!member) {
    return next(new AppError('Family member not found', 404));
  }
  
  res.status(200).json({
    success: true,
    data: {
      member
    }
  });
});
import { incrementStoredCount } from '../utils/statsStore.js';

/**
 * @route   POST /api/v1/family
 * @desc    Add new family member
 * @access  Private
 */
export const addFamilyMember = asyncHandler(async (req, res, next) => {
  const { Fname, Relation, Dob, Gender, Mobile, Occupation, Education } = req.body;
  
  // Validate required fields
  if (!Fname || !Relation || !Gender) {
    return next(new AppError('Please provide name, relation, and gender', 400));
  }
  
  // Create new member
  const member = await Member.create({
    Mid: req.user.memberId,
    Fname,
    Relation,
    Dob: Dob || new Date('1970-01-01'),
    Gender,
    Mobile: Mobile || '',
    Occupation: Occupation || '',
    Education: Education || '',
    Mward: req.user.ward || '',
    Address: req.user.address || '',
    isActive: true
  });

  await incrementStoredCount('membersCount', 1);
  
  res.status(201).json({
    success: true,
    message: 'Family member added successfully',
    data: {
      member
    }
  });
});

/**
 * @route   PUT /api/v1/family/:id
 * @desc    Update family member
 * @access  Private
 */
export const updateFamilyMember = asyncHandler(async (req, res, next) => {
  const { Fname, Relation, Dob, Gender, Mobile, Occupation, Education } = req.body;
  
  // Find member and verify ownership
  let member = await Member.findOne({
    _id: req.params.id,
    Mid: req.user.memberId,
    isActive: true
  });
  
  if (!member) {
    return next(new AppError('Family member not found', 404));
  }
  
  // Update fields
  if (Fname) member.Fname = Fname;
  if (Relation) member.Relation = Relation;
  if (Dob) member.Dob = Dob;
  if (Gender) member.Gender = Gender;
  if (Mobile !== undefined) member.Mobile = Mobile;
  if (Occupation !== undefined) member.Occupation = Occupation;
  if (Education !== undefined) member.Education = Education;
  
  await member.save();
  
  res.status(200).json({
    success: true,
    message: 'Family member updated successfully',
    data: {
      member
    }
  });
});

/**
 * @route   DELETE /api/v1/family/:id
 * @desc    Delete (soft delete) family member
 * @access  Private
 */
export const deleteFamilyMember = asyncHandler(async (req, res, next) => {
  // Find member and verify ownership
  const member = await Member.findOne({
    _id: req.params.id,
    Mid: req.user.memberId
  });
  
  if (!member) {
    return next(new AppError('Family member not found', 404));
  }
  
  // Soft delete
  member.isActive = false;
  await member.save();
  
  res.status(200).json({
    success: true,
    message: 'Family member removed successfully'
  });
});

/**
 * @route   GET /api/v1/family/stats
 * @desc    Get family statistics
 * @access  Private
 */
export const getFamilyStats = asyncHandler(async (req, res, next) => {
  const members = await Member.find({
    Mid: req.user.memberId,
    isActive: true
  });
  
  const stats = {
    total: members.length,
    adults: members.filter(m => {
      const age = m.age;
      return age && age >= 18;
    }).length,
    children: members.filter(m => {
      const age = m.age;
      return age && age < 18;
    }).length,
    male: members.filter(m => m.Gender === 'Male').length,
    female: members.filter(m => m.Gender === 'Female').length,
  };
  
  res.status(200).json({
    success: true,
    data: stats
  });
});
