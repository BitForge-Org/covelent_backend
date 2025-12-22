import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
    lowercase: true,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
  },
  emailVerificationExpiry: {
    type: Date,
  },
  phoneNumber: {
    type: String,
    unique: true,
    trim: true,
    maxlength: [10, 'Phone number must be at most 10 characters long'],
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
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
  },
  isActive: {
    type: Boolean,
    default: function () {
      return this.role === 'user' ? true : false;
    },
  },
  isVerified: {
    type: Boolean,
    default: function () {
      return this.role === 'user' ? true : false;
    },
  },
  role: {
    type: String,
    enum: ['user', 'provider', 'admin'],
    default: 'user',
  },
  aadhaar: {
    frontImage: { type: String, required: false },
    backImage: { type: String, required: false },
    number: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      maxlength: [12, 'aadhaar number must be 12 characters long'],
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
      maxlength: [10, 'PAN number must be 10 characters long'],
    },
    isVerified: { type: Boolean, default: false },
  },
  isProfileCompleted: {
    type: Boolean,
    default: false,
  },
  dateOfBirth: {
    type: Date,
  },
  refreshToken: {
    type: String,
  },

  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

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
 *       properties:
 *         _id:
 *           type: string
 *           description: User ID
 *         fullName:
 *           type: string
 *         email:
 *           type: string
 *         phoneNumber:
 *           type: string
 *         avatar:
 *           type: string
 *         role:
 *           type: string
 *           enum: [user, provider, admin]
 *         isActive:
 *           type: boolean
 *         isVerified:
 *           type: boolean
 *         isEmailVerified:
 *           type: boolean
 *         googleId:
 *           type: string
 *         aadhaar:
 *           type: object
 *           properties:
 *             link:
 *               type: string
 *             number:
 *               type: string
 *             isVerified:
 *               type: boolean
 *         pan:
 *           type: object
 *           properties:
 *             link:
 *               type: string
 *             number:
 *               type: string
 *             isVerified:
 *               type: boolean
 *         dateOfBirth:
 *           type: string
 *           format: date
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

export const User = mongoose.model('User', userSchema);
