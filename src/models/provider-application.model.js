import mongoose, { Schema } from 'mongoose';

const providerApplicationSchema = new Schema(
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
    availableLocations: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Service', // Reference to Service.locationAvailable subdocument
        required: false,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const ProviderApplication = mongoose.model(
  'ProviderApplication',
  providerApplicationSchema
);

// export const Service = mongoose.model('Service', serviceSchema);
