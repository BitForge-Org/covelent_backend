import { Router } from 'express';
import {
  createCategory,
  getAllCategories,
} from '../controllers/category.controller.js';
import { upload } from '../middlewares/multer.middleware.js';
import { isAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

router
  .route('/')
  .post(
    isAdmin,
    upload.fields([{ name: 'icon', maxCount: 1 }]),
    createCategory
  );

router.route('/').get(getAllCategories);

export default router;
