import mongoose, { Schema } from 'mongoose';

const providerRejectionSchema = new Schema(
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
    reason: {
      type: String,
    },
    rejectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export const ProviderRejection = mongoose.model(
  'ProviderRejection',
  providerRejectionSchema
);
