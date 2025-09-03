import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

// Define the root upload directories, adjust as needed per your configuration.
const UPLOAD_ROOT = path.resolve("uploads"); // Assuming all uploads go under ./uploads/
import { sendMail } from "../utils/EmailService.js";
import crypto from "crypto";
import { APP_URL } from "../constants.js";

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, password, role, dateOfBirth, phoneNumber } =
    req.body;

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
  if ([fullName, email, password, role].some((field) => field?.trim() === ""))
    if (role === "provider") {
      // If role is 'provider', aadhar and pan files are required
      if (!aadharImageLocalPath || !fs.existsSync(aadharImageLocalPath)) {
        // Validate if the file path is under the upload root before unlinking
        if (avatarLocalPath) {
          const resolvedAvatarPath = path.resolve(avatarLocalPath);
          if (resolvedAvatarPath.startsWith(UPLOAD_ROOT)) {
            if (fs.existsSync(resolvedAvatarPath)) fs.unlinkSync(resolvedAvatarPath);
          } else {
            console.warn(`[SECURITY] Refused to unlink avatar outside upload dir: ${resolvedAvatarPath}`);
          }
        }
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

  console.log(`[REGISTER] Attempt for email: ${email}`);

  if (existedUser) {
    console.warn(`[REGISTER] Duplicate email: ${email}`);
    // Clean up uploaded files if user exists
    if (avatarLocalPath) {
      const resolvedAvatarPath = path.resolve(avatarLocalPath);
      if (resolvedAvatarPath.startsWith(UPLOAD_ROOT)) {
        if (fs.existsSync(resolvedAvatarPath)) fs.unlinkSync(resolvedAvatarPath);
      } else {
        console.warn(`[SECURITY] Refused to unlink avatar outside upload dir: ${resolvedAvatarPath}`);
      }
    }
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
    phoneNumber,
  });

  // Generate tokens and return with role, isVerified, isActive
  const tokens = await generateAccessAndRefreshTokens(user._id);
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken"
  );

  if (!createdUser) {
    console.error(`[REGISTER] Failed to create user for email: ${email}`);
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
    console.log(`[REGISTER] Welcome email sent to: ${user.email}`);
  } catch (err) {
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
        phoneNumber: user.phoneNumber,
      },
      "User registered Successfully"
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
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  console.log(`[LOGIN] Attempt for email: ${email}`);

  if (!email) {
    throw new ApiError(400, "email is required");
  }
  if (typeof email !== "string") {
    throw new ApiError(400, "Invalid email format");
  }

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) {
    console.warn(`[LOGIN] User not found: ${email}`);
    throw new ApiError(404, "User does not exist");
  }

  if (!user.isActive) {
    throw new ApiError(401, "User account is not active");
  }
  if (!user.isVerified) {
    throw new ApiError(401, "User account is not verified");
  }

  if (!(await user.isPasswordCorrect(password))) {
    console.warn(`[LOGIN] Invalid credentials for: ${email}`);
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken -aadhar -pan -resetPasswordExpires -resetPasswordToken"
  );

  const options = { httpOnly: true, secure: true };

  console.log(`[LOGIN] Success for email: ${email}`);

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
      await generateAccessAndRefreshTokens(user._id);

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

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");
  if (typeof email !== "string") throw new ApiError(400, "Invalid email format");

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) throw new ApiError(404, "User with this email does not exist");
  if (!user.isActive || !user.isVerified)
    throw new ApiError(401, "User account is not active or not verified");

  // Generate 6-digit OTP and expiry
  const otp = crypto.randomInt(100000, 1000000).toString();
  user.resetPasswordToken = otp;
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
    .replace("[RESET_LINK]", `Your OTP for password reset is: <b>${otp}</b>`)
    .replace("[Current Year]", new Date().getFullYear());

  await sendMail({
    to: email,
    subject: "Reset password request",
    html: template,
  });
  console.log(`[FORGOT PASSWORD] Reset OTP sent to: ${email}`);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Reset OTP sent to email"));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  console.log(`[CHANGE PASSWORD] User: ${req.user?._id}`);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    throw new ApiError(400, "OTP is required");
  }
  if (typeof otp !== "string") {
    throw new ApiError(400, "Invalid OTP type");
  }

  const user = await User.findOne({
    resetPasswordToken: { $eq: otp },
    resetPasswordExpires: { $gt: Date.now() },
    isActive: true,
    isVerified: true,
  });

  if (!user) {
    throw new ApiError(
      400,
      "Invalid, expired, inactive, or unverified OTP/user"
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { user }, "OTP verified successfully"));
});

const resetPassword = asyncHandler(async (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) {
    throw new ApiError(400, "OTP and new password are required");
  }

  const user = await User.findOne({
    _id: { $eq: id },
  });

  if (!user) {
    throw new ApiError(400, "Invalid User");
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
  forgotPassword,
  resetPassword,
  verifyOtp,
};
