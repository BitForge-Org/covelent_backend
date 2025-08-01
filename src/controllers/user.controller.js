import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { sendMail } from "../utils/EmailService.js";
import crypto from "crypto";

/**
 * @swagger
 * /api/v1/users/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               avatar:
 *                 type: string
 *                 format: binary
 *               aadharImage:
 *                 type: string
 *                 format: binary
 *               panImage:
 *                 type: string
 *                 format: binary
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - role
 *               - dateOfBirth
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 role:
 *                   type: string
 *                 dateOfBirth:
 *                   type: string
 *                   format: date
 *                 isVerified:
 *                   type: boolean
 *                 isActive:
 *                   type: boolean
 *       400:
 *         description: Bad request
 *       409:
 *         description: User already exists
 */

/**
 * @swagger
 * /api/v1/users/login:
 *   post:
 *     summary: Login a user
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         description: Bad request
 *       404:
 *         description: User not found
 */

/**
 * @swagger
 * /api/v1/users/logout:
 *   post:
 *     summary: Logout the current user
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */

/**
 * @swagger
 * /api/v1/users/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags:
 *       - Users
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/v1/users/change-password:
 *   post:
 *     summary: Change current user's password
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid old password
 */

/**
 * @swagger
 * /api/v1/users/current-user:
 *   get:
 *     summary: Get current authenticated user's details
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 */

/**
 * @swagger
 * /api/v1/users/update-account:
 *   patch:
 *     summary: Update account details for the current user
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account details updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request
 */

/**
 * @swagger
 * /api/v1/users/avatar:
 *   patch:
 *     summary: Update the user's avatar
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar image updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Avatar file is missing
 */

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, password, role, dateOfBirth } = req.body;

  let avatarLocalPath, aadharImageLocalPath, panImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.avatar) &&
    req.files.avatar.length > 0
  ) {
    avatarLocalPath = req.files.avatar[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.aadharImage) &&
    req.files.aadharImage.length > 0
  ) {
    aadharImageLocalPath = req.files.aadharImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.panImage) &&
    req.files.panImage.length > 0
  ) {
    panImageLocalPath = req.files.panImage[0].path;
  }

  // Validate required fields including role and dateOfBirth
  if (
    [fullName, email, password, role, dateOfBirth].some(
      (field) => field?.trim() === ""
    )
  )
    if (role === "provider") {
      // If role is 'provider', aadhar and pan files are required
      if (!aadharImageLocalPath || !fs.existsSync(aadharImageLocalPath)) {
        if (avatarLocalPath && fs.existsSync(avatarLocalPath))
          fs.unlinkSync(avatarLocalPath);
        throw new ApiError(400, "Aadhar file is required for provider role");
      }
      if (!panImageLocalPath || !fs.existsSync(panImageLocalPath)) {
        if (avatarLocalPath && fs.existsSync(avatarLocalPath))
          fs.unlinkSync(avatarLocalPath);
        throw new ApiError(400, "PAN file is required for provider role");
      }
    }

  const existedUser = await User.findOne({
    $or: [{ email }],
  });

  if (existedUser) {
    // Clean up uploaded files if user exists
    if (avatarLocalPath && fs.existsSync(avatarLocalPath))
      fs.unlinkSync(avatarLocalPath);
    throw new ApiError(409, "User with email or username already exists");
  }

  const avatar = avatarLocalPath
    ? await uploadOnCloudinary(avatarLocalPath, "avatars")
    : null;
  const aadharImage = aadharImageLocalPath
    ? await uploadOnCloudinary(aadharImageLocalPath, "aadhar")
    : null;
  const panImage = panImageLocalPath
    ? await uploadOnCloudinary(panImageLocalPath, "pan")
    : null;

  // Add new fields from user.model.js
  const user = await User.create({
    fullName,
    avatar: avatar?.url || "",
    email,
    password,
    googleId: req.body.googleId,
    aadhar: {
      ...(req.body.aadhar || {}),
      link: aadharImage?.url || req.body.aadhar?.link || "",
    },
    pan: {
      ...(req.body.pan || {}),
      link: panImage?.url || req.body.pan?.link || "",
    },
    role,
    dateOfBirth,
  });

  // Generate tokens and return with role, isVerified, isActive
  const tokens = await generateAccessAndRefereshTokens(user._id);
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken -aadhar -pan"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  // Send Welcome email after successful registration
  try {
    const templatePath = path.join(
      process.cwd(),
      "public",
      "email-templates",
      "Welcome.html"
    );
    let template = fs
      .readFileSync(templatePath, "utf8")
      .replace("[User's First Name]", user.fullName)
      .replace(/\[Your Company Name\]/g, "Covelent")
      .replace("[GET_STARTED_LINK]", "https://localhost/dashboard")
      .replace("[Current Year]", new Date().getFullYear());
    await sendMail({
      to: user.email,
      subject: "Welcome to Covelent",
      html: template,
    });
  } catch (err) {
    // Optionally log error, but do not block registration
    console.error("Failed to send welcome email:", err);
  }

  return res.status(201).json(
    new ApiResponse(
      200,
      {
        user: createdUser,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        role: user.role,
        dateOfBirth: user.dateOfBirth,
        isVerified: user.isVerified,
        isActive: user.isActive,
      },
      "User registered Successfully"
    )
  );
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    throw new ApiError(400, "email is required");
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  if (!user.isActive) {
    throw new ApiError(401, "User account is not active");
  }
  if (!user.isVerified) {
    throw new ApiError(401, "User account is not verified");
  }

  if (!(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken -aadhar -pan"
  );

  const options = { httpOnly: true, secure: true };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -aadhar -pan"
  );
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }

  // Prevent aadhar and pan number update
  if (req.body?.aadhar?.number || req.body?.pan?.number) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Aadhar and PAN number cannot be updated")
      );
  }
  const user = await User.findByIdAndUpdate(req.user._id, req.body, {
    new: true,
    runValidators: true,
  }).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  //TODO: delete old image - assignment

  const avatar = await uploadOnCloudinary(avatarLocalPath, "users");

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "User with this email does not exist");
  if (!user.isActive || !user.isVerified)
    throw new ApiError(401, "User account is not active or not verified");

  // Generate secure token and expiry
  user.resetPasswordToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 min
  await user.save({ validateBeforeSave: false });

  const templatePath = path.join(
    process.cwd(),
    "public",
    "email-templates",
    "forgot-password.html"
  );
  let template = fs
    .readFileSync(templatePath, "utf8")
    .replace("[User's First Name]", user.fullName)
    .replace(/\[Your Company Name\]/g, "Covelent")
    .replace(
      "[RESET_LINK]",
      `https://localhost/reset-password?token=${user.resetPasswordToken}`
    )
    .replace("[Current Year]", new Date().getFullYear());

  await sendMail({
    to: email,
    subject: "Reset password request",
    html: template,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Reset link sent to email"));
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    throw new ApiError(400, "Token and new password are required");
  }

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired reset token");
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password reset successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  forgotPassword,
  resetPassword,
};
