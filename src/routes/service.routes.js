import { Router } from 'express';
import {
  createService,
  getFeaturedServices,
  getServices,
} from '../controllers/service.controller.js';
import { upload } from '../middlewares/multer.middleware.js';
import { isAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

router.route('/').post(
  isAdmin,
  upload.fields([
    {
      name: 'media',
      maxCount: 5,
    },
    {
      name: 'icon',
      maxCount: 1,
    },
  ]),
  createService
);

router.route('/featured-services').get(getFeaturedServices);

router.route('/').get(getServices);

export default router;
