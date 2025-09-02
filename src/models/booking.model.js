import mongoose, { Schema } from 'mongoose';

const bookingSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      // required: true,
    },
    service: {
      type: Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    bookingStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'in-progress',
        'completed',
        'cancelled',
        'rejected',
      ],
      default: 'pending',
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    scheduledTime: {
      type: String,
      required: true,
    },

    location: {
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      pincode: {
        type: String,
        required: true,
      },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    pricing: {
      basePrice: {
        type: Number,
        required: true,
        min: 0,
      },
      additionalCharges: {
        type: Number,
        default: 0,
        min: 0,
      },
      discount: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalAmount: {
        type: Number,
        required: true,
        min: 0,
      },
    },
    payment: {
      paymentMethod: {
        type: String,
        enum: ['razorpay', 'cash', 'upi', 'card'],
        required: true,
      },
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending',
      },
      orderId: {
        type: String, // Razorpay order ID
      },
      paymentId: {
        type: String, // Razorpay payment ID
      },
      orderStatus: {
        type: String, // Razorpay order status
      },
      paidAmount: {
        type: Number,
        default: 0,
      },
      paymentDate: {
        type: Date,
      },
      failureReason: {
        type: String,
      },
      refundId: {
        type: String, // Razorpay refund ID if applicable
      },
      refundAmount: {
        type: Number,
        default: 0,
      },
      refundDate: {
        type: Date,
      },
    },
    specialInstructions: {
      type: String,
      trim: true,
    },
    cancellationReason: {
      type: String,
    },
    rejectionReason: {
      type: String,
    },
    completedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    // For rating and review after completion
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      trim: true,
    },
    reviewDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ provider: 1, createdAt: -1 });
bookingSchema.index({ service: 1, createdAt: -1 });
bookingSchema.index({ bookingStatus: 1 });
bookingSchema.index({ scheduledDate: 1 });

export const Booking = mongoose.model('Booking', bookingSchema);
