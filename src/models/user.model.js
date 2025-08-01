import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
    lowercase: true,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  avatar: {
    type: String,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [6, "Password must be at least 6 characters long"],
  },
  isActive: {
    type: Boolean,
    default: function () {
      return this.role === "user" ? true : false;
    },
  },
  isVerified: {
    type: Boolean,
    default: function () {
      return this.role === "user" ? true : false;
    },
  },
  role: {
    type: String,
    enum: ["user", "provider", "admin"],
    default: "user",
  },
  aadhar: {
    link: { type: String, required: false },
    number: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      maxlength: [12, "Aadhar number must be 12 characters long"],
    },
    isVerified: { type: Boolean, default: false },
  },
  pan: {
    link: { type: String, required: false },
    number: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      maxlength: [10, "PAN number must be 10 characters long"],
    },
    isVerified: { type: Boolean, default: false },
  },
  dateOfBirth: {
    type: Date,
    required: true,
  },
  refreshToken: {
    type: String,
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         _id:
 *           type: string
 *           description: User ID
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

export const User = mongoose.model("User", userSchema);
