import { Router } from 'express';
import {
  loginUser,
  logoutUser,
  registerUser,
  refreshAccessToken,
  changeCurrentPassword,
  forgotPassword,
  resetPassword,
  verifyOtp,
  loginProvider,
  registerProvider,
} from '../controllers/auth.controller.js';
import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();
router.route('/register').post(
  upload.fields([
    {
      name: 'avatar',
      maxCount: 1,
    },
  ]),
  registerUser
);

import { uploadProviderDocuments } from '../controllers/auth.controller.js';
// Provider uploads PAN and aadhaar after registration
router.route('/provider/upload-documents').post(
  verifyJWT,
  upload.fields([
    { name: 'aadhaarFrontImage', maxCount: 1 },
    { name: 'aadhaarBackImage', maxCount: 1 },
    { name: 'panImage', maxCount: 1 },
  ]),
  uploadProviderDocuments
);

router.route('/register/provider').post(
  upload.fields([
    {
      name: 'avatar',
      maxCount: 1,
    },
  ]),
  registerProvider
);

router.route('/login').post(loginUser);

router.route('/login/provider').post(loginProvider);

//secured routes
router.route('/logout').post(verifyJWT, logoutUser);
router.route('/refresh-token').post(refreshAccessToken);
router.route('/change-password').post(verifyJWT, changeCurrentPassword);
router.route('/forgot-password').post(forgotPassword);
router.route('/reset-password').post(resetPassword);
router.route('/verify-otp').post(verifyOtp);

export default router;
