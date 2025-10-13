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
} from '../controllers/service-area.controller.js';

import { isAdmin, verifyJWT } from '../middlewares/auth.middleware.js';
import { upload } from '../middlewares/multer.middleware.js';

const router = express.Router();

/**
 * @route   POST /api/service-areas
 * @desc    Create new service area
 * @access  Private (provider)
 */
router.post(
  '/',
  verifyJWT,
  upload.fields([
    { name: 'aadharFrontImage', maxCount: 1 },
    { name: 'aadharBackImage', maxCount: 1 },
    { name: 'panImage', maxCount: 1 },
  ]),
  createServiceArea
);

/**
 * @route   PATCH /api/service-areas/:id/status
 * @desc    Update service area status (pending/approved/rejected/suspended)
 * @access  Private (admin)
 */
router.patch('/:id/status', isAdmin, updateServiceAreaStatus);

/**
 * @route   GET /api/service-areas
 * @desc    Get all service areas (filter by status & paginate)
 * @access  Private (admin)
 */
router.get('/', isAdmin, getServiceAreas);

/**
 * @route   GET /api/service-areas/:id
 * @desc    Get single service area by ID
 * @access  Private (admin or provider who owns it)
 */
router.get('/:id', verifyJWT, getServiceAreaById);

/**
 * @route   GET /api/service-areas/provider/:id
 * @desc    Get all service areas by provider
 * @access  Private (provider)
 */
router.get('/provider/:id', verifyJWT, getServiceAreasByProvider);
/**
 * @route   PATCH /api/service-areas/provider/:providerId/verify-documents
 * @desc    Admin verifies provider documents
 * @access  Private (admin)
 */

export default router;
