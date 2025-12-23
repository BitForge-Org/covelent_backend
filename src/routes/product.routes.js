import { Router } from 'express';
import {
  createProduct,
  updateProduct,
  addVariant,
  addStock,
  removeStock,
  listProducts,
  getProduct
} from '../controllers/product.controller.js';
import { isAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// Public Routes
router.route('/').get(listProducts);
router.route('/:id').get(getProduct);

// Admin Routes (Protected)
router.route('/').post(isAdmin, createProduct);
router.route('/:id').put(isAdmin, updateProduct);
router.route('/:id/variants').post(isAdmin, addVariant);
router.route('/variants/:id/stock/in').post(isAdmin, addStock);
router.route('/variants/:id/stock/out').post(isAdmin, removeStock);

// Review Route (Authenticated User)
import { addReview } from '../controllers/product.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js'; // Assuming verifyJWT exists
router.route('/:id/reviews').post(verifyJWT, addReview);

export default router;
