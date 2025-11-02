// Only import getServicesByArea once, and ensure no duplicate declaration
// GET /services/by-area
// src/routes/service.routes.js
import { Router } from 'express';
import {
  createService,
  getFeaturedServices,
  getServices,
  getServiceById,
  updateServiceImage,
  // ⭐ NEW imports
  assignServiceToAreas,
  removeServiceFromAreas,
  assignServiceToCity,
  checkServiceAvailability,
  getServicesByArea,
} from '../controllers/service.controller.js';
import { upload } from '../middlewares/multer.middleware.js';
import { isAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// Public routes
router.get('/by-area', getServicesByArea);
router.get('/', getServices);
router.get('/featured-services', getFeaturedServices);
router.get('/:serviceId', getServiceById);

// ⭐ NEW: Check availability by pincode
router.get('/check-availability', checkServiceAvailability);

// ⭐ NEW: Get services by area
router.get('/by-area/:areaId', getServicesByArea);

// Admin routes
router.post(
  '/',
  isAdmin,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'media', maxCount: 5 },
  ]),
  createService
);

router.patch(
  '/:serviceId/image',
  isAdmin,
  upload.fields([{ name: 'image', maxCount: 1 }]),
  updateServiceImage
);

// ⭐ NEW: Area assignment routes (Admin only)
router.post('/:serviceId/areas', assignServiceToAreas);
router.delete('/:serviceId/areas', removeServiceFromAreas);
router.post('/:serviceId/city', assignServiceToCity);

export default router;
