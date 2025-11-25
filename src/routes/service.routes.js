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
  getServicesByCoordinates,
  makeAllAreasServiceable,
  areaByService,
} from '../controllers/service.controller.js';

import { upload } from '../middlewares/multer.middleware.js';
import { isAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// Public routes
router.get('/by-coordinates', getServicesByCoordinates);
router.get('/', getServices);
router.get('/featured-services', getFeaturedServices);
router.get('/:serviceId', getServiceById);
// Get serviceable areas by serviceId
router.get('/:serviceId/areas', areaByService);
// ⭐ ADMIN: Bulk update all areas to isServiceable: true
router.post('/admin/areas/serviceable', isAdmin, makeAllAreasServiceable);
// ⭐ NEW: Check availability by pincode
router.get('/check-availability', checkServiceAvailability);

// ⭐ NEW: Get services by area
// (Removed /by-area/:areaId route, only coordinates-based route is available)

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
