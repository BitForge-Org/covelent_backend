/**
 * Express router for user-related routes.
 *
 * @module routes/user
 *
 * @requires express.Router
 * @requires ../controllers/user.controller
 * @requires ../middlewares/multer.middleware
 * @requires ../middlewares/auth.middleware
 *
 * @route GET /current-user - Get the current authenticated user's details.
 * @route PATCH /update-account - Update account details for the current user.
 * @route PATCH /avatar - Update the user's avatar (requires authentication).
 */
import { Router } from "express";
import {
  getCurrentUser,
  updateUserAvatar,
  updateAccountDetails,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/current-user").get(verifyJWT, getCurrentUser);
router.route("/update-account").patch(verifyJWT, updateAccountDetails);

router
  .route("/avatar")
  .patch(verifyJWT, upload.single("avatar"), updateUserAvatar);


export default router;
