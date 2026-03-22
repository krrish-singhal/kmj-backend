/**
 * Member Routes
 * All routes for member/census management
 */

import express from 'express';
import { verifyToken, authorize } from '../middleware/auth.js';
import { 
  validateMemberCensus,
  validatePagination,
  validateSearch,
  validateObjectId 
} from '../middleware/validate.js';
import {
  getAllMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
  searchMembers,
  getFamilyMembers,
  getMemberStats,
  importMembers
} from '../controllers/memberController.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

/**
 * @route   GET /api/v1/members
 * @desc    Get all members (paginated, filterable)
 * @access  Private (Admin sees all, User sees own family)
 * 
 * Query params:
 * - page: Page number (default 1)
 * - limit: Items per page (default 20)
 * - search: Search term (name, ID, aadhaar, phone)
 * - ward: Filter by ward
 * - gender: Filter by gender
 * - relation: Filter by relation
 * - education: Filter by education
 * - sortBy: Sort field (default 'createdAt')
 * - sortOrder: Sort order (default 'desc')
 */
router.get('/', validatePagination, getAllMembers);

/**
 * @route   GET /api/v1/members/search
 * @desc    Search members (advanced search)
 * @access  Private
 * 
 * Query params:
 * - q: Search query (required)
 * - type: Search type (all|name|id|aadhaar|phone)
 */
router.get('/search', validateSearch, searchMembers);

/**
 * @route   GET /api/v1/members/count
 * @desc    Get total count of members (for pagination)
 * @access  Private
 * 
 * Query params (optional filters):
 * - ward: Filter by ward
 * - gender: Filter by gender
 * - relation: Filter by relation
 * 
 * Returns:
 * - totalMembers: Total count of members
 * - totalPages: Number of pages (with 100 items per page)
 * - itemsPerPage: 100
 */
// Disabled temporarily to reduce Firestore load
// router.get('/count', getMemberCount);

/**
 * @route   GET /api/v1/members/stats
 * @desc    Get member statistics
 * @access  Private (Admin only)
 */
router.get('/stats', authorize('admin'), getMemberStats);

/**
 * @route   GET /api/v1/members/family/:familyId
 * @desc    Get all members of a family
 * @access  Private (Admin or own family)
 */
router.get('/family/:familyId', getFamilyMembers);

/**
 * @route   POST /api/v1/members
 * @desc    Create new member (census entry)
 * @access  Private (User for own family, Admin for any)
 * 
 * Body (25 fields matching PHP membership.php):
 * - Mid: Mahal ID (required)
 * - Fname: Full name (required)
 * - Dob: Date of birth
 * - Gender: Male/Female/Other (required)
 * - Relation: Relationship to head
 * - Mstatus: Marital status
 * - Occupation: Occupation/designation
 * - RC: Ration card type
 * - Education: Education level
 * - Madrassa: Madrassa education
 * - Aadhaar: Aadhaar number (12 digits, unique)
 * - Mobile: Mobile number (10 digits)
 * - Email: Email address
 * - Health: Health status
 * - Myear: Member since (date)
 * - Pward: Panchayath name
 * - Phouse: Panchayath ward/house
 * - Dist: District
 * - Area: Corporation/Municipality/Panchayath
 * - Land: Land ownership (Yes/No)
 * - House: House ownership (Yes/No)
 * - Resident: Place of residence (Own/Rent)
 * - Address: Full address
 * - Mward: Mahal ward
 */
router.post('/', validateMemberCensus, createMember);

/**
 * @route   POST /api/v1/members/import
 * @desc    Bulk import members
 * @access  Private (Admin only)
 * 
 * Body:
 * - members: Array of member objects
 */
router.post('/import', authorize('admin'), importMembers);

/**
 * @route   GET /api/v1/members/:id
 * @desc    Get single member by ID
 * @access  Private (Admin or own family member)
 */
router.get('/:id', validateObjectId, getMemberById);

/**
 * @route   PUT /api/v1/members/:id
 * @desc    Update member
 * @access  Private (User for own family, Admin for any)
 * 
 * Body: Any fields from census form (25 fields)
 */
router.put('/:id', validateObjectId, updateMember);

/**
 * @route   DELETE /api/v1/members/:id
 * @desc    Delete member (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id', validateObjectId, authorize('admin'), deleteMember);

export default router;
