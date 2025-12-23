// Helper to set cookie expiry from JWT token

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
import admin from '../firebase.js';

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

function getCookieOptions(token) {
  let expires;
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      expires = new Date(decoded.exp * 1000);
    }
  } catch (err) {
    expires = undefined;
  }
  return { httpOnly: false, secure: false, ...(expires && { expires }) };
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

  let avatarLocalPath, aadhaarImageLocalPath, panImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.avatar) &&
    req.files.avatar.length > 0
  ) {
    avatarLocalPath = req.files.avatar[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.aadhaarImage) &&
    req.files.aadhaarImage.length > 0
  ) {
    aadhaarImageLocalPath = req.files.aadhaarImage[0].path;
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
      aadhaarImageLocalPath,
      panImageLocalPath,
    ]);
    throw new ApiError(400, 'All required fields must be provided');
  }

  // For provider, PAN and aadhaar are not required at registration. They will upload later.
  // Set isProfileCompleted: false for provider, true for user
  let isProfileCompleted = true;
  if (role === 'provider') {
    isProfileCompleted = false;
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
      aadhaarImageLocalPath,
      panImageLocalPath,
    ]);
    throw new ApiError(409, 'User with email or username already exists');
  }

  const avatar = avatarLocalPath
    ? await uploadOnCloudinary(avatarLocalPath, 'avatars')
    : null;
  const aadhaarImage = aadhaarImageLocalPath
    ? await uploadOnCloudinary(aadhaarImageLocalPath, 'aadhaar')
    : null;
  const panImage = panImageLocalPath
    ? await uploadOnCloudinary(panImageLocalPath, 'pan')
    : null;

  // Generate email verification token
  const emailVerificationToken = crypto.randomBytes(32).toString('hex');
  const emailVerificationExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  // Add new fields from user.model.js
  const user = await User.create({
    fullName,
    avatar: avatar?.url || '',
    email,
    password,
    googleId: req.body.googleId,
    aadhaar: {
      ...(req.body.aadhaar || {}),
      link: aadhaarImage?.url || req.body.aadhaar?.link || '',
    },
    pan: {
      ...(req.body.pan || {}),
      link: panImage?.url || req.body.pan?.link || '',
    },
    role,
    isProfileCompleted,
    dateOfBirth,
    phoneNumber,
    isEmailVerified: false,
    emailVerificationToken,
    emailVerificationExpiry,
  });

  // Send Verification Email
  try {
    const templatePath = path.join(
      process.cwd(),
      'public',
      'email-templates',
      'email-verification.html'
    );
    const verifyLink = `${process.env.FRONTEND_URL || 'https://covelnt.com'}/verify-email/${emailVerificationToken}`;
    
    let template = fs.readFileSync(templatePath, 'utf8');
    template = template
      .replace("[User's First Name]", user.fullName)
      .replace(/\[VERIFY_LINK\]/g, verifyLink)
      .replace('[Current Year]', new Date().getFullYear());

    await sendMail({
      to: user.email,
      subject: 'Verify your email - Covelent',
      html: template,
    });
    logger.info(`[REGISTER] Verification email sent to: ${user.email}`);
  } catch (err) {
    logger.error('Failed to send verification email:', err);
    // Note: We don't rollback user creation, but user will need to resend verification
  }

  const createdUser = await User.findById(user._id).select(
    '-password -refreshToken -aadhaar -pan -resetPasswordExpires -resetPasswordToken -emailVerificationToken -emailVerificationExpiry'
  );

  if (!createdUser) {
    logger.error(`[REGISTER] Failed to create user for email: ${email}`);
    throw new ApiError(500, 'Something went wrong while registering the user');
  }

  // Do NOT generate tokens. Require verification.
  return res.status(201).json(
    new ApiResponse(
      201,
      {
        user: createdUser,
        isEmailVerified: false,
      },
      'User registered successfully. Please verify your email to login.'
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

// Provider uploads PAN and aadhaar after registration
export const uploadProviderDocuments = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  const user = await User.findById(userId);
  if (!user || user.role !== 'provider')
    throw new ApiError(403, 'Forbidden, User Role Should be Provider');

  let aadhaarFrontImageLocalPath, aadhaarBackImageLocalPath, panImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.aadhaarFrontImage) &&
    req.files.aadhaarFrontImage.length > 0
  ) {
    aadhaarFrontImageLocalPath = req.files.aadhaarFrontImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.aadhaarBackImage) &&
    req.files.aadhaarBackImage.length > 0
  ) {
    aadhaarBackImageLocalPath = req.files.aadhaarBackImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.panImage) &&
    req.files.panImage.length > 0
  ) {
    panImageLocalPath = req.files.panImage[0].path;
  }

  let aadhaarFrontImage, aadhaarBackImage, panImage;
  if (aadhaarFrontImageLocalPath) {
    aadhaarFrontImage = await uploadOnCloudinary(
      aadhaarFrontImageLocalPath,
      'aadhaar'
    );
    user.aadhaar.frontImage = aadhaarFrontImage?.url || '';
  }
  if (aadhaarBackImageLocalPath) {
    aadhaarBackImage = await uploadOnCloudinary(
      aadhaarBackImageLocalPath,
      'aadhaar'
    );
    user.aadhaar.backImage = aadhaarBackImage?.url || '';
  }
  if (panImageLocalPath) {
    panImage = await uploadOnCloudinary(panImageLocalPath, 'pan');
    user.pan.link = panImage?.url || '';
  }

  // If both aadhaar images and pan are uploaded, set isProfileCompleted true
  if (user.aadhaar.frontImage && user.aadhaar.backImage && user.pan.link) {
    user.isProfileCompleted = true;
  }
  await user.save();
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        isProfileCompleted: user.isProfileCompleted,
        aadhaar: user.aadhaar,
        pan: user.pan,
      },
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

  // if (!user.isActive) {
  //   throw new ApiError(401, 'User account is not active');
  // }

  if (!user.isVerified) {
    throw new ApiError(401, 'User account is not verified');
  }

  if (!user.isEmailVerified) {
    throw new ApiError(403, 'Email is not verified. Please verify your email.');
  }

  if (!(await user.isPasswordCorrect(password))) {
    logger.error(`[LOGIN] Invalid credentials for: ${email}`);
    throw new ApiError(401, 'Invalid user credentials');
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken -aadhaar -pan -resetPasswordExpires -resetPasswordToken'
  );

  // ...existing code...

  logger.info(`[LOGIN] Success for email: ${email}`);

  return res
    .status(200)
    .cookie('accessToken', accessToken, getCookieOptions(accessToken))
    .cookie('refreshToken', refreshToken, getCookieOptions(refreshToken))
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
  //
  // if (!user.isActive) {
  //   throw new ApiError(401, 'User account is not active');
  // }
  // if (!user.isVerified) {
  //   throw new ApiError(401, 'User account is not verified');
  // }

  if (!(await user.isPasswordCorrect(password))) {
    logger.error(`[LOGIN] Invalid credentials for: ${email}`);
    throw new ApiError(401, 'Invalid user credentials');
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken -aadhaar -pan -resetPasswordExpires -resetPasswordToken'
  );

  // ...existing code...

  logger.info(`[LOGIN] Success for email: ${email}`);

  return res
    .status(200)
    .cookie('accessToken', accessToken, getCookieOptions(accessToken))
    .cookie('refreshToken', refreshToken, getCookieOptions(refreshToken))
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

    // ...existing code...

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie('accessToken', accessToken, getCookieOptions(accessToken))
      .cookie(
        'refreshToken',
        newRefreshToken,
        getCookieOptions(newRefreshToken)
      )
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
    .replace('[RESET_LINK]', `<b>${otp}</b>`)
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

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    throw new ApiError(400, 'Verification token is required');
  }

  const user = await User.findOne({ 
    emailVerificationToken: token,
    emailVerificationExpiry: { $gt: Date.now() }
  });

  if (!user) {
    throw new ApiError(400, 'Invalid or expired verification token');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  // Send Welcome email after successful verification
  try {
    const templatePath = path.join(
      process.cwd(),
      'public',
      'email-templates',
      'Welcome.html'
    );
    // Check if welcome template exists, otherwise skip or use a simple one
    if (fs.existsSync(templatePath)) {
        let template = fs
        .readFileSync(templatePath, 'utf8')
        .replace("[User's First Name]", user.fullName)
        .replace(/\[Your Company Name\]/g, 'Covelent')
        .replace('[GET_STARTED_LINK]', `${process.env.FRONTEND_URL || 'https://covelnt.com'}/login`)
        .replace('[Current Year]', new Date().getFullYear());
        
        await sendMail({
        to: user.email,
        subject: 'Welcome to Covelent',
        html: template,
        });
    }
  } catch (err) {
    logger.error('Failed to send welcome email:', err);
  }

  return res.status(200).json(new ApiResponse(200, {}, 'Email verified successfully'));
});

const resendVerificationEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, 'Email is required');

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.isEmailVerified) throw new ApiError(400, 'Email is already verified');

  // Check if existing token is still valid (policy: valid for 24 hrs)
  let token = user.emailVerificationToken;
  if (user.emailVerificationExpiry && user.emailVerificationExpiry > Date.now()) {
     // Token is still valid, reuse it
     token = user.emailVerificationToken;
     logger.info(`[RESEND VERIFICATION] Reusing valid token for: ${email}`);
  } else {
     // Generate new token
     token = crypto.randomBytes(32).toString('hex');
     user.emailVerificationToken = token;
     user.emailVerificationExpiry = Date.now() + 24 * 60 * 60 * 1000;
     await user.save({ validateBeforeSave: false });
  }

  try {
    const templatePath = path.join(
      process.cwd(),
      'public',
      'email-templates',
      'email-verification.html'
    );
    const verifyLink = `${process.env.FRONTEND_URL || 'https://covelnt.com'}/verify-email/${token}`;
    
    let template = fs.readFileSync(templatePath, 'utf8');
    template = template
      .replace("[User's First Name]", user.fullName)
      .replace(/\[VERIFY_LINK\]/g, verifyLink)
      .replace('[Current Year]', new Date().getFullYear());

    await sendMail({
      to: user.email,
      subject: 'Verify your email - Covelent',
      html: template,
    });
  } catch (err) {
    throw new ApiError(500, 'Failed to send verification email');
  }

  return res.status(200).json(new ApiResponse(200, {}, 'Verification email sent'));
});

const googleLogin = asyncHandler(async (req, res) => {
  const { idToken, role } = req.body; // role can be 'user' or 'provider'

  if (!idToken) {
    throw new ApiError(400, 'Google ID Token is required');
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    logger.error('Error verifying Google ID token:', error);
    throw new ApiError(401, 'Invalid or expired Google ID token');
  }

  const { email, name, picture, uid } = decodedToken;

  if (!email) {
    throw new ApiError(400, 'Google account does not have an email');
  }

  let user = await User.findOne({ email });

  if (user) {
    // User exists, link googleId if not present
    if (!user.googleId) {
      user.googleId = uid;
    }
    // Auto-verify email if verified by Google
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpiry = undefined;
    }
    await user.save({ validateBeforeSave: false });
  } else {
    // Create new user
    // If role is not provided, default to user
    const userRole = role === 'provider' ? 'provider' : 'user';

    user = await User.create({
      fullName: name || 'Google User',
      email,
      googleId: uid,
      avatar: picture,
      role: userRole,
      isEmailVerified: true,
      isProfileCompleted: userRole === 'user', // Providers need to upload docs
      // password is omitted, validation should pass due to conditional required
    });
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken -aadhaar -pan -resetPasswordExpires -resetPasswordToken'
  );

  return res
    .status(200)
    .cookie('accessToken', accessToken, getCookieOptions(accessToken))
    .cookie('refreshToken', refreshToken, getCookieOptions(refreshToken))
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        'User logged in successfully with Google'
      )
    );
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
  verifyEmail,
  resendVerificationEmail,
  loginProvider,
  googleLogin,
};
