import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductCategory',
    required: true,
    index: true
  },
  images: {
    type: [String],
    validate: [arrayLimit, '{PATH} exceeds the limit of 5']
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  taxPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  discount: {
    type: {
      type: String, // 'PERCENTAGE', 'FLAT', 'NONE'
      enum: ['PERCENTAGE', 'FLAT', 'NONE'],
      default: 'NONE'
    },
    value: {
      type: Number,
      default: 0
    }
  },
  averageRating: {
    type: Number,
    default: 0,
    index: true
  },
  ratingCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

function arrayLimit(val) {
  return val.length <= 5;
}

export const Product = mongoose.model('Product', productSchema);
