import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken"
  );
  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email, dateOfBirth, phoneNumber } = req.body;

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

  // Type validation to prevent NoSQL injection
  if (typeof fullName !== "string" || typeof email !== "string") {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Full Name and Email must be strings")
      );
  }
  if (dateOfBirth !== undefined && typeof dateOfBirth !== "string") {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Date of Birth must be a string")
      );
  }
  if (phoneNumber !== undefined && typeof phoneNumber !== "string") {
    return res
      .status(400)
      .json(
        new ApiResponse(400, null, "Phone Number must be a string")
      );
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
    "-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken"
  );

  console.log(`[USER] Update account for user: ${req.user._id}`);

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
  ).select(
    "-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken"
  );

  console.log(`[USER] Update avatar for user: ${req.user._id}`);

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

export { getCurrentUser, updateAccountDetails, updateUserAvatar };
