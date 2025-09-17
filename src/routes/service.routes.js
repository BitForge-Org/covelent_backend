import { Router } from 'express';
import {
  createService,
  getFeaturedServices,
  getServices,
  getServiceById,
} from '../controllers/service.controller.js';
import { upload } from '../middlewares/multer.middleware.js';
import { isAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// Create service (image: max 1, media: up to 5)
router.post(
  '/',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'media', maxCount: 5 },
  ]),
  createService
);

// Update service image (max 1)
import { updateServiceImage } from '../controllers/service.controller.js';
router.patch(
  '/:serviceId/image',
  upload.fields([{ name: 'image', maxCount: 1 }]),
  updateServiceImage
);

router.route('/featured-services').get(getFeaturedServices);

// Get service by ID
router.get('/:serviceId', getServiceById);

router.route('/').get(getServices);

export default router;
