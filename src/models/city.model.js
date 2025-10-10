import mongoose from 'mongoose';

const citySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      default: 'India',
      trim: true,
    },
    centerCoordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    metadata: {
      totalAreas: { type: Number, default: 0 },
      totalSubAreas: { type: Number, default: 0 },
      totalPincodes: { type: Number, default: 0 },
      lastImportedAt: Date,
      importStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
      },
    },
    pincodeRanges: [
      {
        start: Number,
        end: Number,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
    collection: 'cities',
  }
);

citySchema.index({ centerCoordinates: '2dsphere' });
citySchema.index({ isActive: 1, name: 1 });

citySchema.methods.toJSON = function () {
  const obj = this.toObject();
  return obj;
};

export default mongoose.model('City', citySchema);
