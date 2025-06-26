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
 * @route POST /register - Register a new user with optional avatar and cover image uploads.
 * @route POST /login - Login a user.
 * @route POST /logout - Logout the current user (requires authentication).
 * @route POST /refresh-token - Refresh the access token.
 * @route POST /change-password - Change the current user's password (requires authentication).
 * @route GET /current-user - Get the current authenticated user's details.
 * @route PATCH /update-account - Update account details for the current user.
 * @route PATCH /avatar - Update the user's avatar (requires authentication).
 * @route PATCH /cover-image - Update the user's cover image (requires authentication).
 * @route GET /c/:username - Get a user's channel profile by username (requires authentication).
 * @route GET /history - Get the watch history for the current user (requires authentication).
 */
import { Router } from "express";
import {
  loginUser,
  logoutUser,
  registerUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateUserAvatar,
  updateAccountDetails,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);

//secured routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/change-password").post(verifyJWT, changeCurrentPassword);
router.route("/current-user").get(verifyJWT, getCurrentUser);
router.route("/update-account").patch(verifyJWT, updateAccountDetails);

router
  .route("/avatar")
  .patch(verifyJWT, upload.single("avatar"), updateUserAvatar);

export default router;
