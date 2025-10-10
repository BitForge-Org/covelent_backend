import mongoose from 'mongoose';

const pincodeSchema = new mongoose.Schema(
  {
    pincode: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City',
      required: true,
      index: true,
    },
    areaIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Area',
      },
    ],
    coordinates: {
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
    isServiceable: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      district: String,
      state: String,
      totalSubAreas: { type: Number, default: 0 },
      primaryArea: String,
    },
  },
  {
    timestamps: true,
    collection: 'pincodes',
  }
);

pincodeSchema.index({ coordinates: '2dsphere' });
pincodeSchema.index({ cityId: 1, isServiceable: 1 });

export default mongoose.model('Pincode', pincodeSchema);
