import mongoose, { Schema } from 'mongoose';

const productCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
      minlength: 3,
      maxlength: 50,
      unique: true
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
  }
);

export const ProductCategory = mongoose.model('ProductCategory', productCategorySchema);
