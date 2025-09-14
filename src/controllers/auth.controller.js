import logger from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Define the root upload directories, adjust as needed per your configuration.
import { sendMail } from '../utils/EmailService.js';
import crypto from 'crypto';

// Directory where local uploaded files are temporarily stored
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * Verifies that a given file path (possibly provided by the user) is safely inside UPLOAD_DIR.
 * Returns the normalized absolute path if valid, or null otherwise.
 * @param {string} inputPath
 * @returns {string|null}
 */
function getSafeUploadPath(inputPath) {
  if (!inputPath) return null;
  // Normalize (resolve) path against UPLOAD_DIR if not already absolute
  let resolvedPath = path.resolve(inputPath);
  if (!resolvedPath.startsWith(UPLOAD_DIR)) {
    return null;
  }
  return resolvedPath;
}

/**
 * Safely removes uploaded files with path traversal protection
 * @param {string[]} filePaths - Array of file paths to remove
 */
function cleanupUploadedFiles(filePaths) {
  filePaths.forEach((filePath) => {
    if (!filePath) return;

    const safeFilePath = getSafeUploadPath(filePath);
    if (safeFilePath && fs.existsSync(safeFilePath)) {
      try {
        fs.unlinkSync(safeFilePath);
        logger.log(`[CLEANUP] Removed file: ${safeFilePath}`);
      } catch (error) {
        logger.error(
          '[CLEANUP] Failed to remove file: %s',
          safeFilePath,
          error
        );
      }
    } else if (filePath) {
      logger.warn(
        `[SECURITY] Refused to unlink file outside upload dir: ${filePath}`
      );
    }
  });
}

const registerUser = asyncHandler(async (req, res) => {
  // Enforce endpoint-based role assignment
  // If called from /register/provider, req._fromProviderRegistration will be true
  // Otherwise, always set role to 'user'
  let { fullName, email, password, role, dateOfBirth, phoneNumber } = req.body;
  if (req._fromProviderRegistration) {
    role = 'provider';
  } else {
    role = 'user';
  }

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
  if ([fullName, email, password, role].some((field) => field?.trim() === '')) {
    cleanupUploadedFiles([
      avatarLocalPath,
      aadharImageLocalPath,
      panImageLocalPath,
    ]);
    throw new ApiError(400, 'All required fields must be provided');
  }

  // For provider, PAN and Aadhar are not required at registration. They will upload later.
  // Set isComplete: false for provider, true for user
  let isComplete = true;
  if (role === 'provider') {
    isComplete = false;
  }

  const existedUser = await User.findOne({
    $or: [{ email }],
  });

  logger.info(`[REGISTER] Attempt for email: ${email}`);

  if (existedUser) {
    logger.warn(`[REGISTER] Duplicate email: ${email}`);
    // Clean up uploaded files if user exists

    cleanupUploadedFiles([
      avatarLocalPath,
      aadharImageLocalPath,
      panImageLocalPath,
    ]);
    throw new ApiError(409, 'User with email or username already exists');
  }

  const avatar = avatarLocalPath
    ? await uploadOnCloudinary(avatarLocalPath, 'avatars')
    : null;
  const aadharImage = aadharImageLocalPath
    ? await uploadOnCloudinary(aadharImageLocalPath, 'aadhar')
    : null;
  const panImage = panImageLocalPath
    ? await uploadOnCloudinary(panImageLocalPath, 'pan')
    : null;

  // Add new fields from user.model.js
  const user = await User.create({
    fullName,
    avatar: avatar?.url || '',
    email,
    password,
    googleId: req.body.googleId,
    aadhar: {
      ...(req.body.aadhar || {}),
      link: aadharImage?.url || req.body.aadhar?.link || '',
    },
    pan: {
      ...(req.body.pan || {}),
      link: panImage?.url || req.body.pan?.link || '',
    },
    role,
    isComplete,
    dateOfBirth,
    phoneNumber,
  });

  // Generate tokens and return with role, isVerified, isActive
  const tokens = await generateAccessAndRefreshTokens(user._id);
  const createdUser = await User.findById(user._id).select(
    '-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken'
  );

  if (!createdUser) {
    logger.error(`[REGISTER] Failed to create user for email: ${email}`);
    throw new ApiError(500, 'Something went wrong while registering the user');
  }

  // Send Welcome email after successful registration
  try {
    const templatePath = path.join(
      process.cwd(),
      'public',
      'email-templates',
      'Welcome.html'
    );
    let template = fs
      .readFileSync(templatePath, 'utf8')
      .replace("[User's First Name]", user.fullName)
      .replace(/\[Your Company Name\]/g, 'Covelent')
      .replace('[GET_STARTED_LINK]', 'https://localhost/dashboard')
      .replace('[Current Year]', new Date().getFullYear());
    await sendMail({
      to: user.email,
      subject: 'Welcome to Covelent',
      html: template,
    });
    logger.info(`[REGISTER] Welcome email sent to: ${user.email}`);
  } catch (err) {
    logger.error('Failed to send welcome email:', err);
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
        phoneNumber: user.phoneNumber,
      },
      'User registered Successfully'
    )
  );
});

export const registerProvider = asyncHandler(async (req, res, next) => {
  try {
    // Mark this request as coming from the provider registration endpoint
    req._fromProviderRegistration = true;
    return registerUser(req, res, next);
  } catch (error) {
    logger.error('Provider registration error:', error);
    return next(error);
  }
});

// Provider uploads PAN and Aadhar after registration
export const uploadProviderDocuments = asyncHandler(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  const user = await User.findById(userId);
  if (!user || user.role !== 'provider') throw new ApiError(403, 'Forbidden');

  let aadharFrontImageLocalPath, aadharBackImageLocalPath, panImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.aadharFrontImage) &&
    req.files.aadharFrontImage.length > 0
  ) {
    aadharFrontImageLocalPath = req.files.aadharFrontImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.aadharBackImage) &&
    req.files.aadharBackImage.length > 0
  ) {
    aadharBackImageLocalPath = req.files.aadharBackImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.panImage) &&
    req.files.panImage.length > 0
  ) {
    panImageLocalPath = req.files.panImage[0].path;
  }

  let aadharFrontImage, aadharBackImage, panImage;
  if (aadharFrontImageLocalPath) {
    aadharFrontImage = await uploadOnCloudinary(
      aadharFrontImageLocalPath,
      'aadhar'
    );
    user.aadhar.frontImage = aadharFrontImage?.url || '';
  }
  if (aadharBackImageLocalPath) {
    aadharBackImage = await uploadOnCloudinary(
      aadharBackImageLocalPath,
      'aadhar'
    );
    user.aadhar.backImage = aadharBackImage?.url || '';
  }
  if (panImageLocalPath) {
    panImage = await uploadOnCloudinary(panImageLocalPath, 'pan');
    user.pan.link = panImage?.url || '';
  }

  // If both aadhar images and pan are uploaded, set isComplete true
  if (user.aadhar.frontImage && user.aadhar.backImage && user.pan.link) {
    user.isComplete = true;
  }
  await user.save();
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isComplete: user.isComplete, aadhar: user.aadhar, pan: user.pan },
        'Documents uploaded'
      )
    );
});

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (err) {
    throw new ApiError(
      500,
      'Something went wrong while generating refresh and access token'
    );
  }
};

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  logger.info(`[LOGIN] Attempt for email: ${email}`);

  if (!email) {
    throw new ApiError(400, 'email is required');
  }
  if (typeof email !== 'string') {
    throw new ApiError(400, 'Invalid email format');
  }

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) {
    logger.warn(`[LOGIN] User not found: ${email}`);
    throw new ApiError(404, 'User does not exist');
  }

  // if (user.role !== 'user') {
  //   logger.warn(`[LOGIN] Unauthorized role for user login: ${email}`);
  //   throw new ApiError(403, 'User is not authorized as user');
  // }

  if (!user.isActive) {
    throw new ApiError(401, 'User account is not active');
  }
  if (!user.isVerified) {
    throw new ApiError(401, 'User account is not verified');
  }

  if (!(await user.isPasswordCorrect(password))) {
    logger.error(`[LOGIN] Invalid credentials for: ${email}`);
    throw new ApiError(401, 'Invalid user credentials');
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken'
  );

  const options = { httpOnly: true, secure: true };

  logger.info(`[LOGIN] Success for email: ${email}`);

  return res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        'User logged In Successfully'
      )
    );
});

const loginProvider = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  logger.info(`[LOGIN] Attempt for email: ${email}`);

  if (!email) {
    throw new ApiError(400, 'email is required');
  }
  if (typeof email !== 'string') {
    throw new ApiError(400, 'Invalid email format');
  }

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) {
    logger.warn(`[LOGIN] User not found: ${email}`);
    throw new ApiError(404, 'User does not exist');
  }

  if (user.role !== 'provider') {
    logger.warn(`[LOGIN] Unauthorized role for provider login: ${email}`);
    throw new ApiError(403, 'User is not authorized as provider');
  }

  if (!user.isActive) {
    throw new ApiError(401, 'User account is not active');
  }
  if (!user.isVerified) {
    throw new ApiError(401, 'User account is not verified');
  }

  if (!(await user.isPasswordCorrect(password))) {
    logger.error(`[LOGIN] Invalid credentials for: ${email}`);
    throw new ApiError(401, 'Invalid user credentials');
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken'
  );

  const options = { httpOnly: true, secure: true };

  logger.info(`[LOGIN] Success for email: ${email}`);

  return res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        'User logged In Successfully'
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
    .clearCookie('accessToken', options)
    .clearCookie('refreshToken', options)
    .json(new ApiResponse(200, {}, 'User logged Out'));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, 'unauthorized request');
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, 'Refresh token is expired or used');
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie('accessToken', accessToken, options)
      .cookie('refreshToken', newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          'Access token refreshed'
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || 'Invalid refresh token');
  }
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  logger.info('forgot password request for:', email);

  if (!email) throw new ApiError(400, 'Email is required');
  if (typeof email !== 'string')
    throw new ApiError(400, 'Invalid email format');

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) throw new ApiError(404, 'User with this email does not exist');
  if (!user.isActive || !user.isVerified)
    throw new ApiError(401, 'User account is not active or not verified');

  // Generate 6-digit OTP and expiry
  const otp = crypto.randomInt(100000, 1000000).toString();
  user.resetPasswordToken = otp;
  user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 min
  await user.save({ validateBeforeSave: false });

  const templatePath = path.join(
    process.cwd(),
    'public',
    'email-templates',
    'forgot-password.html'
  );
  let template = fs
    .readFileSync(templatePath, 'utf8')
    .replace("[User's First Name]", user.fullName)
    .replace(/\[Your Company Name'\]/g, 'Covelent')
    .replace('[RESET_LINK]', `Your OTP for password reset is: <b>${otp}</b>`)
    .replace('[Current Year]', new Date().getFullYear());

  await sendMail({
    to: email,
    subject: 'Reset password request',
    html: template,
  });
  logger.info(`[FORGOT PASSWORD] Reset OTP sent to: ${email}`);

  return res
    .status(200)
    .json(new ApiResponse(200, { email }, 'Reset OTP sent to email'));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  logger.info(`[CHANGE PASSWORD] User: ${req.user?._id}`);

  if (!isPasswordCorrect) {
    throw new ApiError(400, 'Invalid old password');
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Password changed successfully'));
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!otp) {
    throw new ApiError(400, 'OTP is required');
  }
  if (!email) {
    throw new ApiError(400, 'Email is required');
  }
  if (typeof otp !== 'string') {
    throw new ApiError(400, 'Invalid OTP type');
  }

  const user = await User.findOne({ email: { $eq: email } });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'User account is deactivated');
  }

  if (!user.isVerified) {
    throw new ApiError(403, 'User is not verified');
  }

  if (!user.resetPasswordToken || user.resetPasswordToken !== otp) {
    throw new ApiError(400, 'Invalid OTP');
  }

  if (user.resetPasswordExpires < Date.now()) {
    throw new ApiError(400, 'OTP has expired. Please request a new one');
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { email }, 'OTP verified successfully'));
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, 'OTP and new password are required');
  }

  const user = await User.findOne({
    email: { $eq: email },
  });

  if (!user) {
    throw new ApiError(400, 'Invalid User');
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Password reset successfully'));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  forgotPassword,
  resetPassword,
  verifyOtp,
  loginProvider,
};
