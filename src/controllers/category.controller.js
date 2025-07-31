import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Category } from "../models/category.model.js";

const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name || !description) {
    throw new ApiError(400, "Name and description are required");
  }

  if (!req.files || !req.files.icon) {
    throw new ApiError(400, "Icon file is required");
  }

  let icon = null;
  if (req.files && req.files.icon) {
    icon = await uploadOnCloudinary(req.files.icon[0].path, "category/icons");
  }

  const category = await Category.create({
    name,
    description,
    icon: icon ? icon.secure_url : null, // Use secure_url if icon is uploaded
  });

  return res
    .status(201)
    .json(new ApiResponse(201, category, "Category created successfully"));
});

const getAllCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ createdAt: -1 });

  if (categories.length === 0) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "No categories found"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, categories, "Categories fetched successfully"));
});

export { createCategory, getAllCategories };
