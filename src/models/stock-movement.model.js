import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductVariant',
    required: true
  },
  type: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  reason: {
    type: String, // e.g., "ORDER", "RESTOCK", "MANUAL", "DAMAGED", "RETURN"
    required: true,
    uppercase: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Admin performing the action
    required: false // Optional for system-generated movements (like initial checks), but recommended for admin actions
  },
  orderId: { // Optional reference if movement is due to an order
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Work', // Assuming 'Work' is the order/booking model, adjust if it's different in this codebase
    required: false
  }
}, {
  timestamps: true
});

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
