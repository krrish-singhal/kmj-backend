/**
 * API Routes Index
 * Aggregates all route modules
 */

import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import memberRoutes from './memberRoutes.js';
import billRoutes from './billRoutes.js';
import noticeRoutes from './noticeRoutes.js';
import familyRoutes from './familyRoutes.js';
import voucherRoutes from './voucherRoutes.js';
import landRoutes from './landRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import reportRoutes from './reportRoutes.js';
import certificateRoutes from './certificateRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import contactRoutes from './contactRoutes.js';

const router = express.Router();

// API version prefix
const API_VERSION = '/v1';

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'KMJ Billing API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Mount route modules
router.use(`${API_VERSION}/auth`, authRoutes);
router.use(`${API_VERSION}/users`, userRoutes);
router.use(`${API_VERSION}/members`, memberRoutes);
router.use(`${API_VERSION}/bills`, billRoutes);
router.use(`${API_VERSION}/notices`, noticeRoutes);
router.use(`${API_VERSION}/family`, familyRoutes);
router.use(`${API_VERSION}/vouchers`, voucherRoutes);
router.use(`${API_VERSION}/lands`, landRoutes);
router.use(`${API_VERSION}/inventory`, inventoryRoutes);
router.use(`${API_VERSION}/reports`, reportRoutes);
router.use(`${API_VERSION}/certificates`, certificateRoutes);
router.use(`${API_VERSION}/upload`, uploadRoutes);
router.use(`${API_VERSION}/contacts`, contactRoutes);

// API documentation endpoint
router.get(`${API_VERSION}/docs`, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'KMJ Billing System API Documentation',
    version: '1.0.0',
    baseUrl: process.env.API_BASE_URL || 'http://localhost:5000/api',
    endpoints: {
      authentication: {
        register: 'POST /v1/auth/register',
        login: 'POST /v1/auth/login',
        logout: 'POST /v1/auth/logout',
        refreshToken: 'POST /v1/auth/refresh-token',
        me: 'GET /v1/auth/me',
        changePassword: 'PUT /v1/auth/change-password',
        forgotPassword: 'POST /v1/auth/forgot-password',
        resetPassword: 'POST /v1/auth/reset-password',
        verifyMember: 'POST /v1/auth/verify-member'
      },
      users: {
        getProfile: 'GET /v1/users/profile',
        updateProfile: 'PUT /v1/users/profile',
        updatePassword: 'PUT /v1/users/password',
        getAllUsers: 'GET /v1/users (admin)',
        getUserById: 'GET /v1/users/:id',
        updateUser: 'PUT /v1/users/:id (admin)',
        deleteUser: 'DELETE /v1/users/:id (admin)',
        getUserMembers: 'GET /v1/users/:id/members',
        getUserBills: 'GET /v1/users/:id/bills',
        updateSettings: 'PUT /v1/users/:id/settings',
        getUserStats: 'GET /v1/users/stats (admin)'
      },
      members: {
        getAllMembers: 'GET /v1/members',
        searchMembers: 'GET /v1/members/search',
        getMemberStats: 'GET /v1/members/stats (admin)',
        getFamilyMembers: 'GET /v1/members/family/:familyId',
        createMember: 'POST /v1/members',
        importMembers: 'POST /v1/members/import (admin)',
        getMemberById: 'GET /v1/members/:id',
        updateMember: 'PUT /v1/members/:id',
        deleteMember: 'DELETE /v1/members/:id (admin)'
      },
      bills: {
        getAllBills: 'GET /v1/bills',
        getBillStats: 'GET /v1/bills/stats (admin)',
        getBillByReceiptNo: 'GET /v1/bills/receipt/:receiptNo',
        getMemberBills: 'GET /v1/bills/member/:mahalId',
        createBill: 'POST /v1/bills',
        getBillById: 'GET /v1/bills/:id',
        getReceiptData: 'GET /v1/bills/:id/receipt',
        updateBill: 'PUT /v1/bills/:id (admin)',
        deleteBill: 'DELETE /v1/bills/:id (admin)'
      },
      notices: {
        getAllNotices: 'GET /v1/notices',
        getNoticeById: 'GET /v1/notices/:id',
        incrementViews: 'POST /v1/notices/:id/view',
        createNotice: 'POST /v1/notices (admin)',
        updateNotice: 'PUT /v1/notices/:id (admin)',
        deleteNotice: 'DELETE /v1/notices/:id (admin)'
      }
    }
  });
});

export default router;
