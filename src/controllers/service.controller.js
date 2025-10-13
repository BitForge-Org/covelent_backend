// src/controllers/service.controller.js
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { Service } from '../models/service.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { redisClient } from '../utils/redisClient.js';
import logger from '../utils/logger.js';
import Area from '../models/area.model.js';
import City from '../models/city.model.js';
import Pincode from '../models/pincode.model.js';

const createService = asyncHandler(async (req, res) => {
  try {
    const { title, description, category, pricingOptions } = req.body;

    // Validate required fields
    if (!title || !description || !category) {
      throw new ApiError(400, 'Title, description, and category are required');
    }

    let parsedPricingOptions = [];
    if (pricingOptions) {
      try {
        parsedPricingOptions =
          typeof pricingOptions === 'string'
            ? JSON.parse(pricingOptions)
            : pricingOptions;
      } catch (err) {
        throw new ApiError(400, 'Invalid pricingOptions format');
      }
    }

    if (!parsedPricingOptions.length) {
      throw new ApiError(400, 'At least one pricing option is required');
    }

    const isServiceExists = await Service.findOne({ title });
    if (isServiceExists) {
      throw new ApiError(400, 'Service with this title already exists');
    }

    // Handle media upload (up to 5 files)
    let media = [];
    if (req.files && req.files.media) {
      const mediaFiles = Array.isArray(req.files.media)
        ? req.files.media
        : [req.files.media];
      if (mediaFiles.length > 5) {
        throw new ApiError(400, 'A maximum of 5 media files are allowed');
      }
      for (const file of mediaFiles) {
        const uploaded = await uploadOnCloudinary(file.path, 'service/media');
        if (uploaded && uploaded.secure_url) {
          media.push(uploaded.secure_url);
        }
      }
    }

    // Handle image upload (max 1 file)
    let image = '';
    if (req.files && req.files.image) {
      const imageFile = Array.isArray(req.files.image)
        ? req.files.image[0]
        : req.files.image;
      const uploaded = await uploadOnCloudinary(
        imageFile.path,
        'service/image'
      );
      if (uploaded && uploaded.secure_url) {
        image = uploaded.secure_url;
      }
    }

    // Create the service (without areas initially)
    const service = await Service.create({
      title,
      description,
      category,
      pricingOptions: parsedPricingOptions,
      image,
      media,
      serviceableAreas: [],
      serviceableCities: [],
    });

    // Invalidate services cache
    await redisClient.del('services:all');

    return res
      .status(201)
      .json(new ApiResponse(201, service, 'Service created successfully'));
  } catch (error) {
    logger.error(error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to create service'
    );
  }
});

// ⭐ NEW: Assign service to areas
const assignServiceToAreas = asyncHandler(async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { areaIds } = req.body;

    if (!Array.isArray(areaIds) || areaIds.length === 0) {
      throw new ApiError(400, 'areaIds must be a non-empty array');
    }

    // Verify all areas exist and are serviceable
    const areas = await Area.find({
      _id: { $in: areaIds },
      isServiceable: true,
    });

    if (areas.length !== areaIds.length) {
      throw new ApiError(404, 'Some areas not found or not serviceable');
    }

    // Get unique city IDs from areas
    const cityIds = [...new Set(areas.map((a) => a.cityId.toString()))];

    // Update service
    const service = await Service.findByIdAndUpdate(
      serviceId,
      {
        $addToSet: {
          serviceableAreas: { $each: areaIds },
          serviceableCities: { $each: cityIds },
        },
      },
      { new: true }
    )
      .populate('serviceableAreas', 'name pincodes metadata')
      .populate('serviceableCities', 'name state')
      .populate('category', 'name');

    if (!service) {
      throw new ApiError(404, 'Service not found');
    }

    // Invalidate cache
    await redisClient.del('services:all');
    await redisClient.del(`service:${serviceId}`);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          service,
          `Service assigned to ${areas.length} areas successfully`
        )
      );
  } catch (error) {
    logger.error('Error in assignServiceToAreas:', error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to assign service to areas'
    );
  }
});

// ⭐ NEW: Remove service from areas
const removeServiceFromAreas = asyncHandler(async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { areaIds } = req.body;

    if (!Array.isArray(areaIds) || areaIds.length === 0) {
      throw new ApiError(400, 'areaIds must be a non-empty array');
    }

    const service = await Service.findByIdAndUpdate(
      serviceId,
      {
        $pull: {
          serviceableAreas: { $in: areaIds },
        },
      },
      { new: true }
    );

    if (!service) {
      throw new ApiError(404, 'Service not found');
    }

    // Recalculate serviceableCities
    const remainingAreas = await Area.find({
      _id: { $in: service.serviceableAreas },
    });
    const cityIds = [
      ...new Set(remainingAreas.map((a) => a.cityId.toString())),
    ];

    service.serviceableCities = cityIds;
    await service.save();

    // Invalidate cache
    await redisClient.del('services:all');
    await redisClient.del(`service:${serviceId}`);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          service,
          `${areaIds.length} areas removed from service`
        )
      );
  } catch (error) {
    logger.error('Error in removeServiceFromAreas:', error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to remove areas from service'
    );
  }
});

// ⭐ NEW: Assign service to entire city
const assignServiceToCity = asyncHandler(async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { cityId } = req.body;

    if (!cityId) {
      throw new ApiError(400, 'cityId is required');
    }

    // Verify city exists
    const city = await City.findById(cityId);
    if (!city) {
      throw new ApiError(404, 'City not found');
    }

    // Get all serviceable areas in city
    const areas = await Area.find({
      cityId,
      // isServiceable: true,
    });

    if (areas.length === 0) {
      throw new ApiError(404, 'No serviceable areas found in this city');
    }

    const areaIds = areas.map((a) => a._id);

    const service = await Service.findByIdAndUpdate(
      serviceId,
      {
        $addToSet: {
          serviceableAreas: { $each: areaIds },
          serviceableCities: cityId,
        },
      },
      { new: true }
    )
      .populate('serviceableAreas', 'name pincodes')
      .populate('serviceableCities', 'name state')
      .populate('category', 'name');

    if (!service) {
      throw new ApiError(404, 'Service not found');
    }

    // Invalidate cache
    await redisClient.del('services:all');
    await redisClient.del(`service:${serviceId}`);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          service,
          `Service assigned to ${areas.length} areas in ${city.name}`
        )
      );
  } catch (error) {
    logger.error('Error in assignServiceToCity:', error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to assign service to city'
    );
  }
});

// ⭐ NEW: Check service availability by pincode
const checkServiceAvailability = asyncHandler(async (req, res) => {
  try {
    const { pincode } = req.query;

    if (!pincode) {
      throw new ApiError(400, 'Pincode is required');
    }

    const cacheKey = `service:availability:${pincode}`;

    // Try cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            JSON.parse(cached),
            'Services retrieved from cache'
          )
        );
    }

    // Find areas for this pincode
    const areas = await Area.find({
      pincodes: parseInt(pincode),
      isServiceable: true,
    }).select('_id name pincodes');

    if (areas.length === 0) {
      const responseData = {
        available: false,
        pincode,
        message: 'No serviceable areas found for this pincode',
        services: [],
      };

      return res.status(200).json(new ApiResponse(200, responseData));
    }

    const areaIds = areas.map((a) => a._id);

    // Find services available in these areas
    const services = await Service.find({
      serviceableAreas: { $in: areaIds },
      isActive: true,
    })
      .populate('category', 'name')
      .select(
        'title description image pricingOptions avgRating ratingsCount isFeatured'
      );

    const responseData = {
      available: services.length > 0,
      pincode,
      areas: areas.map((a) => ({
        id: a._id,
        name: a.name,
        pincodes: a.pincodes,
      })),
      services,
      count: services.length,
    };

    // Cache for 1 hour
    await redisClient.set(cacheKey, JSON.stringify(responseData), {
      EX: 3600,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          responseData,
          services.length > 0
            ? `${services.length} services available`
            : 'No services available for this pincode'
        )
      );
  } catch (error) {
    logger.error('Error in checkServiceAvailability:', error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to check service availability'
    );
  }
});

// ⭐ UPDATED: Get services with area filtering
const getServices = asyncHandler(async (req, res) => {
  const {
    categoryId,
    minPrice,
    maxPrice,
    avgRating,
    isFeatured,
    title,
    cityId,
    areaId,
    pincode,
  } = req.query;

  const filter = { isActive: true };

  if (categoryId) {
    filter.category = categoryId;
  }

  if (minPrice || maxPrice) {
    filter.pricingOptions = { $elemMatch: {} };
    if (minPrice) {
      filter.pricingOptions.$elemMatch.price = { $gte: Number(minPrice) };
    }
    if (maxPrice) {
      filter.pricingOptions.$elemMatch.price = {
        ...(filter.pricingOptions.$elemMatch.price || {}),
        $lte: Number(maxPrice),
      };
    }
  }

  if (avgRating) {
    filter.avgRating = { $gte: Number(avgRating) };
  }

  if (isFeatured) {
    filter.isFeatured = isFeatured === 'true';
  }

  if (title) {
    filter.title = { $regex: title, $options: 'i' };
  }

  // ⭐ NEW: Filter by area
  if (areaId) {
    filter.serviceableAreas = areaId;
  }

  // ⭐ NEW: Filter by city
  if (cityId) {
    filter.serviceableCities = cityId;
  }

  // ⭐ NEW: Filter by pincode
  if (pincode) {
    const areas = await Area.find({
      pincodes: parseInt(pincode),
      isServiceable: true,
    }).select('_id');

    if (areas.length === 0) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, [], 'No services available for this pincode')
        );
    }

    filter.serviceableAreas = { $in: areas.map((a) => a._id) };
  }

  const services = await Service.find(filter)
    .populate('category', 'name')
    .populate('serviceableAreas', 'name pincodes')
    .populate('serviceableCities', 'name state')
    .sort({ isFeatured: -1, avgRating: -1 });

  if (!services || services.length === 0) {
    return res.status(200).json(new ApiResponse(200, [], 'No services found'));
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        services,
        `${services.length} services retrieved successfully`
      )
    );
});

// ⭐ NEW: Get services by area
const getServicesByArea = asyncHandler(async (req, res) => {
  try {
    const { areaId } = req.params;
    const { categoryId, minPrice, maxPrice, featured } = req.query;

    if (!areaId) {
      throw new ApiError(400, 'Area ID is required');
    }

    const cacheKey = `services:area:${areaId}:${JSON.stringify(req.query)}`;

    // Try cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            JSON.parse(cached),
            'Services retrieved from cache'
          )
        );
    }

    const filter = {
      serviceableAreas: areaId,
      isActive: true,
    };

    if (categoryId) filter.category = categoryId;
    if (featured) filter.isFeatured = featured === 'true';

    let services = await Service.find(filter)
      .populate('category', 'name')
      .populate('serviceableAreas', 'name pincodes')
      .sort({ isFeatured: -1, avgRating: -1 });

    // Filter by price if provided
    if (minPrice || maxPrice) {
      services = services.filter((s) => {
        const prices = s.pricingOptions.map((p) => p.price);
        const minServicePrice = Math.min(...prices);
        const maxServicePrice = Math.max(...prices);

        if (minPrice && maxServicePrice < parseFloat(minPrice)) return false;
        if (maxPrice && minServicePrice > parseFloat(maxPrice)) return false;
        return true;
      });
    }

    // Cache for 30 minutes
    await redisClient.set(cacheKey, JSON.stringify(services), { EX: 1800 });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          services,
          `${services.length} services found for this area`
        )
      );
  } catch (error) {
    logger.error('Error in getServicesByArea:', error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to retrieve services'
    );
  }
});

const updateServiceImage = asyncHandler(async (req, res) => {
  try {
    const { serviceId } = req.params;
    if (!serviceId) {
      throw new ApiError(400, 'Service ID is required');
    }
    if (!req.files || !req.files.image) {
      throw new ApiError(400, 'Image file is required');
    }
    const imageFile = Array.isArray(req.files.image)
      ? req.files.image[0]
      : req.files.image;
    const uploaded = await uploadOnCloudinary(imageFile.path, 'service/image');
    if (!uploaded || !uploaded.secure_url) {
      throw new ApiError(500, 'Image upload failed');
    }
    const updatedService = await Service.findByIdAndUpdate(
      serviceId,
      { image: uploaded.secure_url },
      { new: true }
    );
    if (!updatedService) {
      throw new ApiError(404, 'Service not found');
    }
    await redisClient.del('services:all');
    await redisClient.del(`service:${serviceId}`);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedService,
          'Service image updated successfully'
        )
      );
  } catch (error) {
    logger.error(error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to update service image'
    );
  }
});

const getFeaturedServices = asyncHandler(async (req, res) => {
  const cacheKey = 'services:featured';

  const cached = await redisClient.get(cacheKey);
  if (cached) {
    const services = JSON.parse(cached);
    return res
      .status(200)
      .json(
        new ApiResponse(200, services, 'Featured services retrieved from cache')
      );
  }

  const services = await Service.find({ isFeatured: true, isActive: true })
    .populate('category', 'name')
    .populate('serviceableCities', 'name');

  if (!services || services.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, [], 'No featured services found'));
  }

  await redisClient.set(cacheKey, JSON.stringify(services), { EX: 3600 });

  return res
    .status(200)
    .json(
      new ApiResponse(200, services, 'Featured services retrieved successfully')
    );
});

const getServiceById = asyncHandler(async (req, res) => {
  try {
    const { serviceId } = req.params;
    if (!serviceId) {
      throw new ApiError(400, 'Service ID is required');
    }

    const cacheKey = `service:${serviceId}`;

    // Try cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            JSON.parse(cached),
            'Service retrieved from cache'
          )
        );
    }

    const service = await Service.findById(serviceId)
      .populate('category', 'name')
      .populate('serviceableAreas', 'name pincodes metadata')
      .populate('serviceableCities', 'name state');

    if (!service) {
      throw new ApiError(404, 'Service not found');
    }

    // Cache for 1 hour
    await redisClient.set(cacheKey, JSON.stringify(service), { EX: 3600 });

    return res
      .status(200)
      .json(new ApiResponse(200, service, 'Service retrieved successfully'));
  } catch (error) {
    logger.error('Error in getServiceById:', error);
    throw new ApiError(
      error.statusCode || 500,
      error.message || 'Failed to retrieve service'
    );
  }
});

export {
  createService,
  getServices,
  getFeaturedServices,
  updateServiceImage,
  getServiceById,
  // ⭐ NEW exports
  assignServiceToAreas,
  removeServiceFromAreas,
  assignServiceToCity,
  checkServiceAvailability,
  getServicesByArea,
};
