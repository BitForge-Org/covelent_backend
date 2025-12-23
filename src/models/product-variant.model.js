import mongoose from 'mongoose';

const productVariantSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  label: {
    type: String, // e.g., "1 Kg", "500g", "Small", "Large"
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  buyingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0,
    comment: "This is the TAX-INCLUSIVE price displayed to the user"
  },
  stockQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 10,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster lookups
productVariantSchema.index({ productId: 1, isActive: 1 });

export const ProductVariant = mongoose.model('ProductVariant', productVariantSchema);
