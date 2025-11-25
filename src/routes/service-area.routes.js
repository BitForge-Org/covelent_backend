/**
 * Express router for service area related routes.
 *
 * @module routes/service-area
 *
 * @requires express
 * @requires ../controllers/service-area.controller
 * @requires ../middlewares/auth.middleware
 *
 * @description
 * Defines routes for creating, updating, and retrieving service areas.
 * Includes authentication and authorization middleware for access control.
 *
 * Routes:
 *  - POST   /api/service-areas                Create a new service area (provider only)
 *  - PATCH  /api/service-areas/:id/status     Update service area status (admin only)
 *  - GET    /api/service-areas                Get all service areas (admin only, supports filtering & pagination)
 *  - GET    /api/service-areas/:id            Get a single service area by ID (admin or owning provider)
 *  - GET    /api/service-areas/provider/:id   Get all service areas by provider (provider only)
 */
import express from 'express';
import {
  createServiceArea,
  getServiceAreaById,
  getServiceAreas,
  getServiceAreasByProvider,
  updateServiceAreaStatus,
  addServiceForCompletedProfile,
  getAppliedServiceAreas,
  updateServiceArea,
  getServiceAreaApplicationStatus,
} from '../controllers/service-area.controller.js';
/**
 * @route   GET /api/service-areas/application-status
 * @desc    Get service-area application status for logged-in user
 * @access  Private (provider)
 */

/**
 * @route   POST /api/service-areas/add-service
 * @desc    Add service for completed profile
 * @access  Private (provider)
 */

import { isAdmin, verifyJWT } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/service-areas
 * @desc    Create new service area
 * @access  Private (provider)
 */
router.post(
  '/complete-application',
  verifyJWT,
  upload.fields([
    { name: 'aadhaarFrontImage', maxCount: 1 },
    { name: 'aadhaarBackImage', maxCount: 1 },
    { name: 'panImage', maxCount: 1 },
  ]),
  createServiceArea
);

router.post('/add-service', verifyJWT, addServiceForCompletedProfile);

/**
 * @route   PATCH /api/service-areas/:id/status
 * @desc    Update service area status (pending/approved/rejected/suspended)
 * @access  Private (admin)
 */
router.patch(
  '/complete-application/:id/status',
  isAdmin,
  updateServiceAreaStatus
);

/**
 * @route   GET /api/service-areas
 * @desc    Get all service areas (filter by status & paginate)
 * @access  Private (admin)
 */
router.get('/complete-application/', isAdmin, getServiceAreas);

/**
 * @route   GET /api/service-areas/:id
 * @desc    Get single service area by ID
 * @access  Private (admin or provider who owns it)
 */
// Ensure /applied route is matched before /:id
router.get('/complete-application/applied', verifyJWT, getAppliedServiceAreas);
router.get('/complete-application/:id', verifyJWT, getServiceAreaById);

/**
 * @route   GET /api/service-areas/provider/:id
 * @desc    Get all service areas by provider
 * @access  Private (provider)
 */
router.get(
  '/complete-application/provider/:id',
  verifyJWT,
  getServiceAreasByProvider
);
/**
 * @route   PATCH /api/service-areas/provider/:providerId/verify-documents
 * @desc    Admin verifies provider documents
 * @access  Private (admin)
 */
/**
 * @route   GET /api/service-areas/applied
 * @desc    Get list of applied service areas for logged-in user
 * @access  Private (provider)
 */
// router.get('/complete-application/applied', verifyJWT, getAppliedServiceAreas);

/**
 * @route   GET /api/service-areas/:id
 * @desc    Get single service area by ID
 * @access  Private (admin or provider who owns it)
 */
router.get('/complete-application/:id', verifyJWT, getServiceAreaById);

/**
 * @route   PATCH /api/service-areas/:id
 * @desc    Update availableLocations for a service area (provider only)
 * @access  Private (provider)
 */
router.patch('/complete-application/:id', verifyJWT, updateServiceArea);

router.get('/application-status', verifyJWT, getServiceAreaApplicationStatus);

export default router;
