import mongoose, { Schema } from 'mongoose';

const serviceSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
      unique: true, // Ensure title is unique
      maxlength: 100, // Limit title length
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    pricingOptions: [
      {
        _id: { type: Schema.Types.ObjectId, auto: true }, // unique ID for option
        label: { type: String, required: true, trim: true }, // e.g. "1 BHK Cleaning"
        price: { type: Number, required: true, min: 0 },
        duration: { type: Number, required: true, min: 0 },
      },
    ],
    image: {
      type: String,
      required: true,
      trim: true,
    },
    media: {
      type: [String], // array of URLs or paths
      required: true,
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 5;
        },
        message: (props) =>
          `Media array exceeds maximum allowed length of 5 (got ${props.value.length}).`,
      },
    },
    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    serviceableAreas: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Area',
        index: true,
      },
    ],

    // ⭐ NEW: For quick city-level filtering
    serviceableCities: [
      {
        type: Schema.Types.ObjectId,
        ref: 'City',
        index: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Service = mongoose.model('Service', serviceSchema);
