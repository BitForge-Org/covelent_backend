// ============================================================================
// GET ALL AREAS
// ============================================================================
export const getAllAreas = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const areas = await Area.find({})
    .select('-__v')
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
  const total = await Area.countDocuments({});
  return res
    .status(200)
    .json({
      areas,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
});

// ============================================================================
// GET AREA BY ID
// ============================================================================
export const getAreaById = asyncHandler(async (req, res) => {
  const area = await Area.findById(req.params.areaId);
  if (!area) return res.status(404).json({ error: 'Area not found' });
  return res.status(200).json(area);
});

// ============================================================================
// GET ALL SUBAREAS
// ============================================================================
export const getAllSubAreas = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const subAreas = await SubArea.find({})
    .select('-__v')
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
  const total = await SubArea.countDocuments({});
  return res
    .status(200)
    .json({
      subAreas,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
});

// ============================================================================
// GET SUBAREA BY ID
// ============================================================================
export const getSubAreaById = asyncHandler(async (req, res) => {
  const subArea = await SubArea.findById(req.params.subAreaId);
  if (!subArea) return res.status(404).json({ error: 'SubArea not found' });
  return res.status(200).json(subArea);
});

// ============================================================================
// GET ALL PINCODES
// ============================================================================
export const getAllPincodes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const pincodes = await Pincode.find({})
    .select('-__v')
    .sort({ pincode: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
  const total = await Pincode.countDocuments({});
  return res
    .status(200)
    .json({
      pincodes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
});

// ============================================================================
// GET PINCODE BY ID
// ============================================================================
export const getPincodeById = asyncHandler(async (req, res) => {
  const pincode = await Pincode.findById(req.params.pincodeId);
  if (!pincode) return res.status(404).json({ error: 'Pincode not found' });
  return res.status(200).json(pincode);
});
// src/controllers/location.controller.js
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import locationImportService from '../services/locationImportService.js';
import City from '../models/city.model.js';
import Area from '../models/area.model.js';
import SubArea from '../models/subarea.model.js';
import Pincode from '../models/pincode.model.js';

// ============================================================================
// IMPORT CITY DATA
// ============================================================================
export const importCity = asyncHandler(async (req, res) => {
  const { cityName, pincodeRanges, centerCoords } = req.body;
  const adminId = req.admin?._id;

  if (!cityName || !pincodeRanges || !centerCoords) {
    throw new ApiError(
      400,
      'Missing required fields: cityName, pincodeRanges, centerCoords'
    );
  }

  if (!Array.isArray(pincodeRanges) || pincodeRanges.length === 0) {
    throw new ApiError(400, 'pincodeRanges must be a non-empty array');
  }

  if (!Array.isArray(centerCoords) || centerCoords.length !== 2) {
    throw new ApiError(400, 'centerCoords must be [latitude, longitude]');
  }

  const result = await locationImportService.importCityData(
    cityName,
    pincodeRanges,
    centerCoords,
    adminId
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, 'City data imported successfully'));
});

// ============================================================================
// GET IMPORT STATUS
// ============================================================================
export const getImportStatus = asyncHandler(async (req, res) => {
  const { importLogId } = req.params;

  const status = await locationImportService.getImportStatus(importLogId);

  if (!status) {
    throw new ApiError(404, 'Import log not found');
  }

  return res.status(200).json(new ApiResponse(200, status));
});

// ============================================================================
// GET ALL CITIES
// ============================================================================
export const getCities = asyncHandler(async (req, res) => {
  const { isActive, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const cities = await City.find(filter)
    .select('-__v')
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await City.countDocuments(filter);

  return res.status(200).json(
    new ApiResponse(200, {
      cities,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    })
  );
});

// ============================================================================
// GET CITY BY ID
// ============================================================================
export const getCityById = asyncHandler(async (req, res) => {
  const { cityId } = req.params;

  const city = await City.findById(cityId);
  if (!city) throw new ApiError(404, 'City not found');

  const imports = await locationImportService.getCityImports(cityId, 5);

  return res
    .status(200)
    .json(new ApiResponse(200, { city, recentImports: imports }));
});

// ============================================================================
// GET AREAS BY CITY
// ============================================================================
export const getAreasByCity = asyncHandler(async (req, res) => {
  const { cityId } = req.params;
  const { isServiceable, search, page = 1, limit = 50 } = req.query;

  const filter = { cityId };
  if (isServiceable !== undefined)
    filter.isServiceable = isServiceable === 'true';
  if (search) filter.name = { $regex: search, $options: 'i' };

  const areas = await Area.find(filter)
    .select('-__v')
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Area.countDocuments(filter);

  return res.status(200).json(
    new ApiResponse(200, {
      areas,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    })
  );
});

// ============================================================================
// GET SUB-AREAS BY AREA
// ============================================================================
export const getSubAreasByArea = asyncHandler(async (req, res) => {
  const { areaId } = req.params;
  const { isServiceable, search, page = 1, limit = 100 } = req.query;

  const filter = { areaId };
  if (isServiceable !== undefined)
    filter.isServiceable = isServiceable === 'true';

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { pincode: parseInt(search) || 0 },
    ];
  }

  const subAreas = await SubArea.find(filter)
    .select('-__v')
    .populate('areaId', 'name')
    .sort({ name: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await SubArea.countDocuments(filter);

  return res.status(200).json(
    new ApiResponse(200, {
      subAreas,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    })
  );
});

// ============================================================================
// UPDATE AREA SERVICEABILITY
// ============================================================================
export const updateAreaServiceability = asyncHandler(async (req, res) => {
  const { areaId } = req.params;
  const { isServiceable, priority } = req.body;

  const updateData = {};
  if (isServiceable !== undefined) updateData.isServiceable = isServiceable;
  if (priority !== undefined) updateData.priority = priority;

  const area = await Area.findByIdAndUpdate(
    areaId,
    { $set: updateData },
    { new: true }
  );

  if (!area) throw new ApiError(404, 'Area not found');

  // Also update all sub-areas under this area
  if (isServiceable !== undefined) {
    await SubArea.updateMany({ areaId }, { $set: { isServiceable } });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, area, 'Area serviceability updated'));
});

// ============================================================================
// UPDATE SUB-AREA SERVICEABILITY
// ============================================================================
export const updateSubAreaServiceability = asyncHandler(async (req, res) => {
  const { subAreaId } = req.params;
  const { isServiceable, priority } = req.body;

  const updateData = {};
  if (isServiceable !== undefined) updateData.isServiceable = isServiceable;
  if (priority !== undefined) updateData.priority = priority;

  const subArea = await SubArea.findByIdAndUpdate(
    subAreaId,
    { $set: updateData },
    { new: true }
  );

  if (!subArea) throw new ApiError(404, 'Sub-area not found');

  return res
    .status(200)
    .json(new ApiResponse(200, subArea, 'Sub-area serviceability updated'));
});

// ============================================================================
// BULK UPDATE AREA SERVICEABILITY
// ============================================================================
export const bulkUpdateAreaServiceability = asyncHandler(async (req, res) => {
  const { areaIds, isServiceable, priority } = req.body;

  if (!Array.isArray(areaIds) || areaIds.length === 0) {
    throw new ApiError(400, 'areaIds must be a non-empty array');
  }

  const updateData = {};
  if (isServiceable !== undefined) updateData.isServiceable = isServiceable;
  if (priority !== undefined) updateData.priority = priority;

  const result = await Area.updateMany(
    { _id: { $in: areaIds } },
    { $set: updateData }
  );

  // Also update sub-areas
  if (isServiceable !== undefined) {
    await SubArea.updateMany(
      { areaId: { $in: areaIds } },
      { $set: { isServiceable } }
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      },
      `Updated ${result.modifiedCount} areas`
    )
  );
});

// ============================================================================
// GET PINCODE DETAILS
// ============================================================================
export const getPincodeDetails = asyncHandler(async (req, res) => {
  const { pincode } = req.params;

  const pincodeData = await Pincode.findOne({ pincode: parseInt(pincode) })
    .populate('cityId', 'name state')
    .populate('areaIds', 'name type');

  if (!pincodeData) throw new ApiError(404, 'Pincode not found');

  const subAreas = await SubArea.find({ pincode: parseInt(pincode) })
    .select('name type isServiceable coordinates details')
    .populate('areaId', 'name');

  return res
    .status(200)
    .json(new ApiResponse(200, { pincode: pincodeData, subAreas }));
});

// ============================================================================
// SEARCH LOCATIONS
// ============================================================================
export const searchLocations = asyncHandler(async (req, res) => {
  const { query, cityId, type = 'all', limit = 20 } = req.query;

  if (!query || query.length < 2) {
    throw new ApiError(400, 'Query must be at least 2 characters');
  }

  const results = { areas: [], subAreas: [], pincodes: [] };
  const searchRegex = { $regex: query, $options: 'i' };
  const baseFilter = cityId ? { cityId } : {};

  if (type === 'all' || type === 'areas') {
    results.areas = await Area.find({ ...baseFilter, name: searchRegex })
      .select('name slug isServiceable metadata.totalSubAreas pincodes')
      .limit(limit);
  }

  if (type === 'all' || type === 'subAreas') {
    results.subAreas = await SubArea.find({ ...baseFilter, name: searchRegex })
      .select('name pincode type isServiceable')
      .populate('areaId', 'name')
      .limit(limit);
  }

  if (type === 'all' || type === 'pincodes') {
    const pincodeNum = parseInt(query);
    if (!isNaN(pincodeNum)) {
      results.pincodes = await Pincode.find({
        ...baseFilter,
        pincode: { $gte: pincodeNum, $lt: pincodeNum + 100 },
      })
        .select('pincode isServiceable metadata')
        .populate('cityId', 'name')
        .limit(limit);
    }
  }

  return res.status(200).json(new ApiResponse(200, results));
});

// ============================================================================
// GET AREA HIERARCHY (City -> Areas -> Sub-areas)
// ============================================================================
export const getAreaHierarchy = asyncHandler(async (req, res) => {
  const { cityId } = req.params;

  const city = await City.findById(cityId);
  if (!city) throw new ApiError(404, 'City not found');

  // Get all areas for this city
  const areas = await Area.find({ cityId }).sort({ name: 1 }).lean();

  // Get all sub-areas grouped by area
  const hierarchy = await Promise.all(
    areas.map(async (area) => {
      const subAreas = await SubArea.find({ areaId: area._id })
        .select('name pincode type isServiceable coordinates')
        .sort({ name: 1 })
        .lean();

      return {
        areaId: area._id,
        areaName: area.name,
        areaType: area.type,
        isServiceable: area.isServiceable,
        pincodes: area.pincodes,
        totalSubAreas: area.metadata.totalSubAreas,
        subAreas: subAreas,
      };
    })
  );

  return res.status(200).json(
    new ApiResponse(200, {
      city: {
        id: city._id,
        name: city.name,
        state: city.state,
        totalAreas: city.metadata.totalAreas,
        totalSubAreas: city.metadata.totalSubAreas,
        totalPincodes: city.metadata.totalPincodes,
      },
      hierarchy,
    })
  );
});
