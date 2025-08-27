import express from 'express';
import {
  createProviderApplication,
  getApplicationById,
  getApplications,
  updateApplicationStatus,
} from '../controllers/providerapplication.controller';

import { authMiddleware, adminMiddleware } from '../middlewares/auth.js'; // optional

const router = express.Router();

/**
 * @route   POST /api/provider-applications
 * @desc    Create new provider application
 * @access  Private (provider)
 */
router.post('/', authMiddleware, createProviderApplication);

/**
 * @route   PATCH /api/provider-applications/:id/status
 * @desc    Update application status (pending/approved/rejected/suspended)
 * @access  Private (admin)
 */
router.patch(
  '/:id/status',
  /* authMiddleware, adminMiddleware, */ updateApplicationStatus
);

/**
 * @route   GET /api/provider-applications
 * @desc    Get all provider applications (filter by status & paginate)
 * @access  Private (admin)
 */
router.get('/', /* authMiddleware, adminMiddleware, */ getApplications);

/**
 * @route   GET /api/provider-applications/:id
 * @desc    Get single provider application by ID
 * @access  Private (admin or provider who owns it)
 */
router.get('/:id', /* authMiddleware, */ getApplicationById);

export default router;
