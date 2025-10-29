/**
 * Express router for provider application related routes.
 *
 * @module routes/provider-application
 *
 * @requires express
 * @requires ../controllers/provider-application.controller
 * @requires ../middlewares/auth.middleware
 *
 * @description
 * Defines routes for creating, updating, and retrieving provider applications.
 * Includes authentication and authorization middleware for access control.
 *
 * Routes:
 *  - POST   /api/provider-applications                Create a new provider application (provider only)
 *  - PATCH  /api/provider-applications/:id/status     Update application status (admin only)
 *  - GET    /api/provider-applications                Get all provider applications (admin only, supports filtering & pagination)
 *  - GET    /api/provider-applications/:id            Get a single provider application by ID (admin or owning provider)
 *  - GET    /api/provider-applications/provider/:id   Get all applications by provider (provider only)
 */
import express from 'express';
import {
  createProviderApplication,
  getApplicationById,
  getApplications,
  getApplicationsByProvider,
  updateApplicationStatus,
} from '../controllers/provider-application.controller.js';

import { isAdmin, verifyJWT } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/provider-applications
 * @desc    Create new provider application
 * @access  Private (provider)
 */
router.post(
  '/',
  verifyJWT,
  upload.fields([
    { name: 'aadhaarFrontImage', maxCount: 1 },
    { name: 'aadhaarBackImage', maxCount: 1 },
    { name: 'panImage', maxCount: 1 },
  ]),
  createProviderApplication
);

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

/**
 * @route   GET /api/provider-applications/provider/:id
 * @desc    Get all applications by provider
 * @access  Private (provider)
 */
router.get('/provider/:id', verifyJWT, getApplicationsByProvider);
/**
 * @route   PATCH /api/provider-applications/provider/:providerId/verify-documents
 * @desc    Admin verifies provider documents
 * @access  Private (admin)
 */

export default router;
