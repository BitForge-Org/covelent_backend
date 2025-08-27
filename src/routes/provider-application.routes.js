import express from 'express';
import {
  createProviderApplication,
  getApplicationById,
  getApplications,
  updateApplicationStatus,
} from '../controllers/provider-application.controller.js';

import { isAdmin, verifyJWT } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/provider-applications
 * @desc    Create new provider application
 * @access  Private (provider)
 */
router.post('/', verifyJWT, createProviderApplication);

/**
 * @route   PATCH /api/provider-applications/:id/status
 * @desc    Update application status (pending/approved/rejected/suspended)
 * @access  Private (admin)
 */
router.patch('/:id/status', isAdmin, updateApplicationStatus);

/**
 * @route   GET /api/provider-applications
 * @desc    Get all provider applications (filter by status & paginate)
 * @access  Private (admin)
 */
router.get('/', isAdmin, getApplications);

/**
 * @route   GET /api/provider-applications/:id
 * @desc    Get single provider application by ID
 * @access  Private (admin or provider who owns it)
 */
router.get('/:id', verifyJWT, getApplicationById);

export default router;
