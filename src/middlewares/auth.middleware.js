import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import logger from '../utils/logger.js';

export const verifyJWT = asyncHandler(async (req, _, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  logger.info(`verifyJWT: Token ${token ? 'found' : 'not found'}`);
  if (!token) {
    logger.warn('verifyJWT: No token provided');
    throw new ApiError(401, 'Unauthorized request');
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decodedToken?._id).select(
      '-password -refreshToken'
    );

    if (!user) {
      logger.warn('verifyJWT: User not found for decoded token');
      throw new ApiError(401, 'Invalid Access Token');
    }

    req.user = user;
    req.userRole = user.role;
    next();
  } catch (error) {
    logger.error(`verifyJWT: Error verifying token - ${error?.message}`);
    throw new ApiError(401, error?.message || 'Invalid access token');
  }
});

export const isAdmin = asyncHandler(async (req, res, next) => {
  // Assumes verifyJWT has already set req.userRole
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  logger.info(`isAdmin: Token ${token ? 'found' : 'not found'}`);
  if (!token) {
    logger.warn('isAdmin: No token provided');
    throw new ApiError(401, 'Unauthorized request - No token provided');
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decodedToken?._id).select(
      '-password -refreshToken'
    );

    if (!user) {
      logger.warn('isAdmin: User not found for decoded token');
      throw new ApiError(401, 'Invalid Access Token');
    }

    if (user.role !== 'admin') {
      logger.warn('isAdmin: User is not admin');
      throw new ApiError(403, 'Forbidden: Admins only');
    }

    req.user = user;
    req.userRole = user.role;
    next();
  } catch (error) {
    logger.error(`isAdmin: Error verifying token - ${error?.message}`);
    throw new ApiError(401, error?.message || 'Invalid access token');
  }
});
