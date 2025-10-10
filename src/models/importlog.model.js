import mongoose from 'mongoose';

const importLogSchema = new mongoose.Schema(
  {
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['started', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'started',
      index: true,
    },
    progress: {
      totalPincodes: { type: Number, default: 0 },
      processedPincodes: { type: Number, default: 0 },
      successfulPincodes: { type: Number, default: 0 },
      failedPincodes: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    },
    results: {
      areasCreated: { type: Number, default: 0 },
      subAreasCreated: { type: Number, default: 0 },
      pincodesCreated: { type: Number, default: 0 },
    },
    errors: [
      {
        pincode: Number,
        error: String,
        timestamp: Date,
      },
    ],
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: Date,
    duration: Number, // in seconds
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    metadata: {
      source: {
        type: String,
        enum: ['india_post', 'india_post_nominatim', 'manual', 'bulk_upload'], // Added new enum value
        default: 'india_post',
      },
      config: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'import_logs',
  }
);

importLogSchema.index({ cityId: 1, createdAt: -1 });
importLogSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ImportLog', importLogSchema);
