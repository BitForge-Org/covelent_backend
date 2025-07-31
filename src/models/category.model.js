import mongoose, { Schema } from "mongoose";

/**
 * @swagger
 * components:
 *   schemas:
 *     Category:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - icon
 *       properties:
 *         _id:
 *           type: string
 *           description: Category ID
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         icon:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
      minlength: 3,
      maxlength: 50,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);
export const Category = mongoose.model("Category", categorySchema);
