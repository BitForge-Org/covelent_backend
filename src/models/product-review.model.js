import mongoose, { Schema } from 'mongoose';

const productReviewSchema = new Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500
    },
    isApproved: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate reviews from same user for same product
productReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

export const ProductReview = mongoose.model('ProductReview', productReviewSchema);
