import mongoose from 'mongoose';

const areaSchema = new mongoose.Schema(
  {
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
    },
    // src/models/area.model.js
    type: {
      type: String,
      enum: ['district', 'locality', 'zone', 'region', 'service_area'], // Add this
      default: 'locality',
    },
    centroid: {
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
    pincodes: [
      {
        type: Number,
        index: true,
      },
    ],
    metadata: {
      totalSubAreas: { type: Number, default: 0 },
      district: String,
      state: String,
      averageCoordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
    isServiceable: {
      type: Boolean,
      default: false,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'areas',
  }
);

areaSchema.index({ centroid: '2dsphere' });
areaSchema.index({ cityId: 1, isServiceable: 1 });
areaSchema.index({ cityId: 1, name: 1 }, { unique: true });
areaSchema.index({ pincodes: 1, cityId: 1 });

export default mongoose.model('Area', areaSchema);
