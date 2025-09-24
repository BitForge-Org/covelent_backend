import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Category } from '../models/category.model.js';
import { redisClient, initRedis } from '../utils/redisClient.js';
import logger from '../utils/logger.js';

const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name || !description) {
    throw new ApiError(400, 'Name and description are required');
  }

  if (!req.files || !req.files.icon) {
    throw new ApiError(400, 'Icon file is required');
  }

  let icon = null;
  if (req.files && req.files.icon) {
    icon = await uploadOnCloudinary(req.files.icon[0].path, 'category/icons');
  }

  const category = await Category.create({
    name,
    description,
    icon: icon ? icon.secure_url : null, // Use secure_url if icon is uploaded
  });

  await redisClient.del('categories:all');

  // Invalidate categories cache after creating a new category
  // await redisClient.del('categories:all');

  return res
    .status(201)
    .json(new ApiResponse(201, category, 'Category created successfully'));
});

let hasLoggedCacheMiss = false;

async function getCategoriesFromCache() {
  if (redisClient.isOpen) {
    try {
      const cached = await redisClient.get('categories:all');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      if (!hasLoggedCacheMiss) {
        logger.warn('Redis unavailable, falling back to DB:', err.message);
        hasLoggedCacheMiss = true;
      }
    }
  }
  return null;
}

async function setCategoriesToCache(categories) {
  if (redisClient.isOpen) {
    try {
      await redisClient.set('categories:all', JSON.stringify(categories), {
        EX: 3600,
      });
      logger.info('Categories cached in Redis');
    } catch (err) {
      if (!hasLoggedCacheMiss) {
        logger.warn('Could not cache categories in Redis:', err.message);
        hasLoggedCacheMiss = true;
      }
    }
  } else {
    logger.warn('Redis client is not open, cannot cache categories');
  }
}

const getAllCategories = asyncHandler(async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    if (categories.length === 0) {
      return res
        .status(404)
        .json(new ApiResponse(404, null, 'No categories found'));
    }
    await setCategoriesToCache(categories); // Await to ensure cache is set
    logger.info('Categories served from MongoDB');
    // }

    return res.status(200).json(
      new ApiResponse(
        200,
        categories
        // `Categories fetched successfully${cacheHit ? " (from cache)" : ""}`
      )
    );
  } catch (error) {
    logger.error(error);
  }
  let categories = await getCategoriesFromCache();
  let cacheHit = !!categories;

  if (cacheHit) {
    logger.info('Categories served from Redis cache');
  }

  // let categories = null;

  // if (!categories) {
});

export { createCategory, getAllCategories };
