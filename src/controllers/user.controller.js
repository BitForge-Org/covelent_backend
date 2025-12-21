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
      '-password -refreshToken -aadhaar -pan -resetPasswordExpires -resetPasswordToken'
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
  logger.info(`[USER] updateAccountDetails called for user: ${req.user?._id}`);
  logger.debug(`[USER] Request body: ${JSON.stringify(req.body)}`);

  // Prevent aadhaar and pan number update
  if (req.body?.aadhaar?.number || req.body?.pan?.number) {
    logger.warn(
      `[USER] Attempt to update aadhaar or pan number for user: ${req.user?._id}`
    );
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, 'aadhaar and PAN number cannot be updated')
      );
  }

  // Build updateFields dynamically and validate only provided fields
  const allowedFields = ['fullName', 'email', 'dateOfBirth', 'phoneNumber'];
  const updateFields = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const value = req.body[field];
      if (
        ['fullName', 'email', 'dateOfBirth', 'phoneNumber'].includes(field) &&
        value !== undefined &&
        typeof value !== 'string'
      ) {
        logger.warn(`[USER] Invalid type for ${field}`);
        return res
          .status(400)
          .json(
            new ApiResponse(
              400,
              null,
              `${field.replace(/([A-Z])/g, ' $1')} must be a string`
            )
          );
      }
      updateFields[field] = value;
    }
  }

  if (Object.keys(updateFields).length === 0) {
    logger.warn(`[USER] No valid fields provided for update`);
    return res
      .status(400)
      .json(new ApiResponse(400, null, 'No valid fields provided for update'));
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateFields },
    {
      new: true,
      runValidators: true,
    }
  ).select(
    '-password -refreshToken -aadhaar -pan -resetPasswordExpires -resetPasswordToken'
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
    '-password -refreshToken -aadhaar -pan -resetPasswordExpires -resetPasswordToken'
  );

  logger.info(`[USER] Update avatar for user: ${req.user._id}`);
  logger.debug(`[USER] Avatar URL: ${avatar.url}`);

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Avatar image updated successfully'));
});

export { getCurrentUser, updateAccountDetails, updateUserAvatar };
