import mongoose, { Schema } from 'mongoose';

const serviceArea = new Schema(
  {
    provider: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    service: {
      type: Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    applicationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    adminNotes: {
      type: String,
    },
    isServiceAvailable: {
      type: Boolean,
      default: false,
    },
    areas: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Area', // Reference to Area model
        required: false,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const ServiceArea = mongoose.model('ServiceArea', serviceArea);
