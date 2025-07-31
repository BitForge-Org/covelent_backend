import mongoose, { Schema } from "mongoose";

const serviceSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
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
    locationAvailable: {
      type: [
        {
          city: { type: String, required: true },
          state: { type: String, required: true },
          coordinates: {
            lan: { type: Number, required: true },
            lat: { type: Number, required: true },
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Service = mongoose.model("Service", serviceSchema);
