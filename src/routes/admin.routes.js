import { Router } from 'express';
import { verifyProviderDocuments } from '../controllers/admin.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Admin verifies provider documents
router.patch(
  '/provider/:providerId/verify-documents',
  verifyJWT,
  verifyProviderDocuments
);

export default router;
