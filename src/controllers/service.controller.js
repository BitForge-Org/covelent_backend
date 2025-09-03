import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Service } from "../models/service.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
// import { redisClient, initRedis } from "../utils/redisClient.js";

const createService = asyncHandler(async (req, res) => {
  try {
    const { title, description, category, price, duration, locationAvailable } =
      req.body;

    // Validate required fields
    if (
      !title ||
      !description ||
      !category ||
      price === undefined ||
      duration === undefined
    ) {
      throw new ApiError(
        400,
        "Title, description, category, price, and duration are required"
      );
    }

    const isServiceExists = await Service.findOne({
      $or: [{ title }],
    });

    if (isServiceExists) {
      throw new ApiError(400, "Service with this title already exists");
    }

    // Handle media upload (up to 5 files)
    let media = [];
    if (req.files && req.files.media) {
      if (req.files.media.length > 5) {
        throw new ApiError(400, "A maximum of 5 media files are allowed");
      }
      for (const file of req.files.media) {
        const uploaded = await uploadOnCloudinary(file.path, "service/media");
        if (uploaded && uploaded.secure_url) {
          media.push(uploaded.secure_url);
        }
      }
    }

    // Parse locationAvailable if sent as JSON string
    let parsedLocationAvailable = [];
    if (locationAvailable) {
      try {
        parsedLocationAvailable =
          typeof locationAvailable === "string"
            ? JSON.parse(locationAvailable)
            : locationAvailable;
      } catch (e) {
        throw new ApiError(400, "Invalid locationAvailable format");
      }
    }

    // Create the service
    const service = await Service.create({
      title,
      description,
      category,
      price,
      duration,
      media,
      locationAvailable: parsedLocationAvailable,
    });

    // Invalidate services cache after creating a new service
    // if (!redisClient.isOpen) {
    //   await redisClient.connect();
    // }
    // await redisClient.del("services:all");

    return res
      .status(201)
      .json(new ApiResponse(201, service, "Service created successfully"));
  } catch (error) {
    console.log(error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || "Failed to create service"
    );
  }
});

const getServices = asyncHandler(async (req, res) => {
  const { categoryId, minPrice, maxPrice, avgRating, isFeatured } = req.query;

  const filter = {};

  if (categoryId) {
    filter.category = categoryId; // directly use ObjectId
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  if (avgRating) {
    filter.avgRating = { $gte: Number(avgRating) }; // min rating
  }

  if (isFeatured) {
    filter.isFeatured = isFeatured === "true";
  }

  const cacheKey = `services:${JSON.stringify(filter)}`;

  // TODO: Redis cache logic if needed

  const services = await Service.find(filter).populate("category");

  if (!services || services.length === 0) {
    return res.status(404).json(new ApiResponse(404, [], "No services found"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, services, "Services retrieved successfully"));
});

const getFeaturedServices = asyncHandler(async (req, res) => {
  // const cacheKey = "services:featured";

  // Try to get from Redis cache
  // if (!redisClient.isOpen) {
  //   await redisClient.connect();
  // }
  // const cached = await redisClient.get(cacheKey);
  // if (cached) {
  //   const services = JSON.parse(cached);
  //   return res
  //     .status(200)
  //     .json(
  //       new ApiResponse(
  //         200,
  //         services,
  //         "Featured services retrieved successfully (cache)"
  //       )
  //     );
  // }

  // If not cached, fetch from DB
  const services = await Service.find({ isFeatured: true });

  if (!services || services.length === 0) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "No featured services found"));
  }

  // Cache the result
  // await redisClient.set(cacheKey, JSON.stringify(services), { EX: 3600 }); // cache for 1 hour

  console.log("res", res);
  return res
    .status(200)
    .json(
      new ApiResponse(200, services, "Featured services retrieved successfully")
    );
});

export { createService, getServices, getFeaturedServices };
