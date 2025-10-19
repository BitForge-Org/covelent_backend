import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import logger from '../utils/logger.js';

const getCurrentUser = asyncHandler(async (req, res) => {
  logger.info(`[USER] getCurrentUser called for user: ${req.user?._id}`);
  try {
    const user = await User.findById(req.user._id).select(
      '-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken'
    );
    if (!user) {
      logger.warn(`[USER] No user found for id: ${req.user?._id}`);
      throw new ApiError(404, 'User not found');
    }
    logger.info(`[USER] User found: ${JSON.stringify(user)}`);
    return res
      .status(200)
      .json(new ApiResponse(200, user, 'User fetched successfully'));
  } catch (error) {
    logger.error(
      `[USER] Error fetching current user: ${error.message} , ${error}`
    );
    throw new ApiError(500, 'Internal Server Error');
  }
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email, dateOfBirth, phoneNumber } = req.body;

  logger.info(`[USER] updateAccountDetails called for user: ${req.user?._id}`);
  logger.debug(`[USER] Request body: ${JSON.stringify(req.body)}`);
  if (!fullName || !email) {
    logger.warn(`[USER] Missing required fields: fullName or email`);
    throw new ApiError(400, 'All fields are required');
  }

  // Prevent aadhar and pan number update
  if (req.body?.aadhar?.number || req.body?.pan?.number) {
    logger.warn(
      `[USER] Attempt to update aadhar or pan number for user: ${req.user?._id}`
    );
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, 'Aadhar and PAN number cannot be updated')
      );
  }

  // Type validation to prevent NoSQL injection
  if (typeof fullName !== 'string' || typeof email !== 'string') {
    logger.warn(`[USER] Invalid types for fullName or email`);
    return res
      .status(400)
      .json(new ApiResponse(400, null, 'Full Name and Email must be strings'));
  }
  if (dateOfBirth !== undefined && typeof dateOfBirth !== 'string') {
    logger.warn(`[USER] Invalid type for dateOfBirth`);
    return res
      .status(400)
      .json(new ApiResponse(400, null, 'Date of Birth must be a string'));
  }
  if (phoneNumber !== undefined && typeof phoneNumber !== 'string') {
    logger.warn(`[USER] Invalid type for phoneNumber`);
    return res
      .status(400)
      .json(new ApiResponse(400, null, 'Phone Number must be a string'));
  }

  // Only update allowed fields with validated values
  const updateFields = { fullName, email };
  if (dateOfBirth !== undefined) updateFields.dateOfBirth = dateOfBirth;
  if (phoneNumber !== undefined) updateFields.phoneNumber = phoneNumber;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    {
      new: true,
      runValidators: true,
    }
  ).select(
    '-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken'
  );

  logger.info(`[USER] Update account for user: ${req.user._id}`);
  logger.debug(`[USER] Updated fields: ${JSON.stringify(updateFields)}`);

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Account details updated successfully'));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  logger.info(`[USER] updateUserAvatar called for user: ${req.user?._id}`);
  const avatarLocalPath = req.file?.path;
  logger.debug(`[USER] Avatar local path: ${avatarLocalPath}`);
  if (!avatarLocalPath) {
    logger.warn(`[USER] Avatar file missing for user: ${req.user?._id}`);
    throw new ApiError(400, 'Avatar file is missing');
  }

  //TODO: delete old image - assignment

  const avatar = await uploadOnCloudinary(avatarLocalPath, 'users');

  if (!avatar.url) {
    logger.error(
      `[USER] Error while uploading avatar for user: ${req.user?._id}`
    );
    throw new ApiError(400, 'Error while uploading on avatar');
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select(
    '-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken'
  );

  logger.info(`[USER] Update avatar for user: ${req.user._id}`);
  logger.debug(`[USER] Avatar URL: ${avatar.url}`);

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Avatar image updated successfully'));
});

export { getCurrentUser, updateAccountDetails, updateUserAvatar };
