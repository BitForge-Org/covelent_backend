import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';

// Admin verifies provider documents
export const verifyProviderDocuments = asyncHandler(async (req, res) => {
  const { providerId } = req.params;
  const user = await User.findById(providerId);
  if (!user || user.role !== 'provider') {
    throw new ApiError(404, 'Provider not found');
  }
  user.aadhar.isVerified = true;
  user.pan.isVerified = true;
  user.isVerified = true;
  await user.save();
  return res
    .status(200)
    .json(
      new ApiResponse(200, { isVerified: true }, 'Provider documents verified')
    );
});
