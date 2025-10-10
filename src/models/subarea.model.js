import mongoose from 'mongoose';

const subAreaSchema = new mongoose.Schema(
  {
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      required: true,
      index: true,
    },
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
    pincode: {
      type: Number,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'post_office',
        'sub_post_office',
        'head_post_office',
        'locality',
        'landmark',
      ],
      default: 'post_office',
    },
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
    details: {
      branchType: String,
      deliveryStatus: String,
      district: String,
      state: String,
      division: String,
      region: String,
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
    collection: 'subareas',
  }
);

subAreaSchema.index({ coordinates: '2dsphere' });
subAreaSchema.index({ cityId: 1, pincode: 1 });
subAreaSchema.index({ areaId: 1, isServiceable: 1 });
subAreaSchema.index({ pincode: 1, isServiceable: 1 });
subAreaSchema.index({ cityId: 1, areaId: 1, name: 1 }, { unique: true });

export default mongoose.model('SubArea', subAreaSchema);
