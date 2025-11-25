// Get list of applied service areas for logged-in user

import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ServiceArea } from '../models/service-area.model.js';
import Pincode from '../models/pincode.model.js';
import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import logger from '../utils/logger.js';

// Create a new service area and upload documents
const createServiceArea = asyncHandler(async (req, res, next) => {
  const { service, availableLocations } = req.body;

  // Start a session for transaction
  const session = await ServiceArea.startSession();
  session.startTransaction();
  try {
    let locationsArr = [];
    logger.info(
      `Raw availableLocations: ${JSON.stringify(availableLocations)}`
    );
    if (Array.isArray(availableLocations)) {
      locationsArr = availableLocations
        .flatMap((val) =>
          typeof val === 'string'
            ? val
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
            : []
        )
        .filter((s) => s.length > 0);
    } else if (
      typeof availableLocations === 'string' &&
      availableLocations.trim() !== ''
    ) {
      locationsArr = availableLocations
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    // Remove duplicates and empty strings
    locationsArr = Array.from(new Set(locationsArr)).filter(
      (s) => s.length > 0
    );
    logger.info(`Parsed locationsArr: ${JSON.stringify(locationsArr)}`);
    if (!locationsArr.length) {
      logger.warn(
        `availableLocations is empty after parsing: ${JSON.stringify(availableLocations)}`
      );
      throw new ApiError(
        400,
        'availableLocations is required and cannot be empty'
      );
    }

    if (!service) {
      throw new ApiError(400, 'Service is required');
    }

    const user = await User.findById(req.user._id).session(session);

    if (!user || user.role !== 'provider' || user.isProfileCompleted) {
      throw new ApiError(404, 'User not found or not eligible ' + user);
    }

    // Handle document uploads (aadhaar/PAN)
    let aadhaarFrontImageLocalPath,
      aadhaarBackImageLocalPath,
      panImageLocalPath;
    // Strictly require all three images
    if (
      !req.files ||
      !Array.isArray(req.files.aadhaarFrontImage) ||
      req.files.aadhaarFrontImage.length === 0 ||
      !req.files.aadhaarFrontImage[0].path
    ) {
      throw new ApiError(
        400,
        'aadhaar front image is required and must be uploaded'
      );
    }
    if (
      !req.files ||
      !Array.isArray(req.files.aadhaarBackImage) ||
      req.files.aadhaarBackImage.length === 0 ||
      !req.files.aadhaarBackImage[0].path
    ) {
      throw new ApiError(
        400,
        'aadhaar back image is required and must be uploaded'
      );
    }
    if (
      !req.files ||
      !Array.isArray(req.files.panImage) ||
      req.files.panImage.length === 0 ||
      !req.files.panImage[0].path
    ) {
      throw new ApiError(400, 'PAN image is required and must be uploaded');
    }
    aadhaarFrontImageLocalPath = req.files.aadhaarFrontImage[0].path;
    aadhaarBackImageLocalPath = req.files.aadhaarBackImage[0].path;
    panImageLocalPath = req.files.panImage[0].path;

    // Check if files exist before uploading
    const fs = await import('fs');
    let aadhaarFrontImage, aadhaarBackImage, panImage;
    if (aadhaarFrontImageLocalPath) {
      if (!fs.existsSync(aadhaarFrontImageLocalPath)) {
        throw new ApiError(400, 'aadhaar front image file does not exist');
      }
      aadhaarFrontImage = await uploadOnCloudinary(
        aadhaarFrontImageLocalPath,
        'aadhaar'
      );
      user.aadhaar.frontImage = aadhaarFrontImage?.url || '';
    }
    if (aadhaarBackImageLocalPath) {
      if (!fs.existsSync(aadhaarBackImageLocalPath)) {
        throw new ApiError(400, 'aadhaar back image file does not exist');
      }
      aadhaarBackImage = await uploadOnCloudinary(
        aadhaarBackImageLocalPath,
        'aadhaar'
      );
      user.aadhaar.backImage = aadhaarBackImage?.url || '';
    }
    if (panImageLocalPath) {
      if (!fs.existsSync(panImageLocalPath)) {
        throw new ApiError(400, 'PAN image file does not exist');
      }
      panImage = await uploadOnCloudinary(panImageLocalPath, 'pan');
      user.pan.link = panImage?.url || '';
    }

    // If both aadhaar images and pan are uploaded, set isProfileCompleted true
    if (user.aadhaar.frontImage && user.aadhaar.backImage && user.pan.link) {
      user.isProfileCompleted = true;
    }
    const updatedUser = await user.save({ session });

    const existingApplication = await ServiceArea.findOne({
      provider: req.user._id,
      service,
    })
      .select('_id applicationStatus')
      .session(session);

    if (existingApplication) {
      throw new ApiError(
        400,
        `Application already exists with status: ${existingApplication.applicationStatus}`
      );
    }

    const newApplication = await ServiceArea.create(
      [
        {
          provider: req.user._id,
          service,
          availableLocations: locationsArr,
          applicationStatus: 'pending',
          aadhaarFrontImage: user.aadhaar.frontImage,
          aadhaarBackImage: user.aadhaar.backImage,
          panImage: user.pan.link,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          application: newApplication[0],
          isProfileCompleted: updatedUser.isProfileCompleted,
          aadhaar: updatedUser.aadhaar,
          pan: updatedUser.pan,
        },
        'Service area and documents uploaded'
      )
    );
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
});

// Update application status (only status & optional notes)
const updateServiceAreaStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { applicationStatus, adminNotes } = req.body;

  if (
    !['pending', 'approved', 'rejected', 'suspended'].includes(
      applicationStatus
    )
  ) {
    throw new ApiError(400, 'Invalid application status');
  }

  // If status is approved, set isActive and isVerified to true
  let updateFields = { applicationStatus, adminNotes };
  if (applicationStatus === 'approved') {
    updateFields.isActive = true;
    updateFields.isVerified = true;
  }

  const updatedApplication = await ServiceArea.findByIdAndUpdate(
    id,
    updateFields,
    { new: true, runValidators: true }
  )
    .populate('service')
    .populate('provider');

  if (!updatedApplication) {
    throw new ApiError(404, 'Service area not found');
  }

  // Send Notification to user about status

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedApplication,
        'Service area status updated successfully'
      )
    );
});

// Get all service areas (with filters & pagination)
const getServiceAreas = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status) filter.applicationStatus = status;

  const applications = await ServiceArea.find(filter)
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 })
    .populate({ path: 'service', select: 'title description' })
    .populate({
      path: 'provider',
      select: 'fullName email phoneNumber locationAvailable',
    });
  const total = await ServiceArea.countDocuments(filter);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        applications,
      },
      'Service areas fetched successfully'
    )
  );
});

// Get single service area
const getServiceAreaById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const application = await ServiceArea.findById(id);

  if (!application) {
    throw new ApiError(404, 'Service area not found');
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, application, 'Service area fetched successfully')
    );
});

const getServiceAreasByProvider = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const application = await ServiceArea.findById(id);

  if (!application) {
    throw new ApiError(404, 'Service area not found');
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, application, 'Service area fetched successfully')
    );
});

// Add service for completed profile
const addServiceForCompletedProfile = asyncHandler(async (req, res, next) => {
  const { service, availableLocations } = req.body;

  // Start a session for transaction
  const session = await ServiceArea.startSession();
  session.startTransaction();
  try {
    let locationsArr = [];
    logger.info(
      `Raw availableLocations: ${JSON.stringify(availableLocations)}`
    );
    if (Array.isArray(availableLocations)) {
      locationsArr = availableLocations
        .flatMap((val) =>
          typeof val === 'string'
            ? val
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
            : []
        )
        .filter((s) => s.length > 0);
    } else if (
      typeof availableLocations === 'string' &&
      availableLocations.trim() !== ''
    ) {
      locationsArr = availableLocations
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    // Remove duplicates and empty strings
    locationsArr = Array.from(new Set(locationsArr)).filter(
      (s) => s.length > 0
    );
    logger.info(`Parsed locationsArr: ${JSON.stringify(locationsArr)}`);
    if (!locationsArr.length) {
      logger.warn(
        `availableLocations is empty after parsing: ${JSON.stringify(availableLocations)}`
      );
      throw new ApiError(
        400,
        'availableLocations is required and cannot be empty'
      );
    }

    if (!service) {
      throw new ApiError(400, 'Service is required');
    }

    const user = await User.findById(req.user._id).session(session);

    if (!user || user.role !== 'provider') {
      throw new ApiError(404, 'User not found or not eligible ' + user);
    }

    // Check if user profile is completed
    if (!user.isProfileCompleted) {
      throw new ApiError(
        400,
        'Profile must be completed before adding a service'
      );
    }

    // Check for duplicate application for same service
    const existingApplication = await ServiceArea.findOne({
      provider: req.user._id,
      service,
    })
      .select('_id applicationStatus')
      .session(session);

    if (existingApplication) {
      throw new ApiError(
        400,
        `You have already applied for this service. Status: ${existingApplication.applicationStatus}`
      );
    }

    const newApplication = await ServiceArea.create(
      [
        {
          provider: req.user._id,
          service,
          availableLocations: locationsArr,
          applicationStatus: 'pending',
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          application: newApplication[0],
        },
        'Service area added successfully'
      )
    );
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
});

const updateServiceArea = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { availableLocations } = req.body;

    let locationsArr = [];
    logger.info(
      `Raw availableLocations: ${JSON.stringify(availableLocations)}`
    );
    if (Array.isArray(availableLocations)) {
      locationsArr = availableLocations
        .flatMap((val) =>
          typeof val === 'string'
            ? val
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
            : []
        )
        .filter((s) => s.length > 0);
    } else if (
      typeof availableLocations === 'string' &&
      availableLocations.trim() !== ''
    ) {
      locationsArr = availableLocations
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    // Remove duplicates and empty strings
    locationsArr = Array.from(new Set(locationsArr)).filter(
      (s) => s.length > 0
    );
    logger.info(`Parsed locationsArr: ${JSON.stringify(locationsArr)}`);
    if (!locationsArr.length) {
      logger.warn(
        `availableLocations is empty after parsing: ${JSON.stringify(availableLocations)}`
      );
      throw new ApiError(
        400,
        'availableLocations is required and cannot be empty'
      );
    }

    // Ensure user can only update their own service area
    const updatedApplication = await ServiceArea.findOneAndUpdate(
      { _id: id, provider: req.user._id },
      { availableLocations: locationsArr },
      { new: true, runValidators: true }
    )
      .populate('service')
      .populate('provider');

    if (!updatedApplication) {
      throw new ApiError(404, 'Service area not found or not owned by user');
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedApplication,
          'Service area updated successfully'
        )
      );
  } catch (err) {
    next(err);
  }
});

const getAppliedServiceAreas = asyncHandler(async (req, res, next) => {
  try {
    // Validate user._id is a valid ObjectId
    logger.info(`Validating user._id: ${req.user._id}`, req.user._id);
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            [],
            'Invalid user id for applied service areas fetch'
          )
        );
    }
    // Include availableLocations and restrict service fields
    const applications = await ServiceArea.find({ provider: req.user._id })
      .populate({
        path: 'service',
        select: 'title description image pricingOptions',
      })
      .populate({
        path: 'provider',
        select: '_id fullName email phoneNumber avatar role isProfileCompleted',
      })
      .populate({
        path: 'availableLocations',
        select: '_id name city state pincodes',
      });
    // Ensure pincodes array is always present in availableLocations
    for (const app of applications) {
      if (app.availableLocations && Array.isArray(app.availableLocations)) {
        for (const loc of app.availableLocations) {
          loc.pincodes = loc.pincodes || [];
        }
      }
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          applications,
          'Applied service areas fetched successfully'
        )
      );
  } catch (err) {
    next(err);
    logger.error(`Error fetching applied service areas: ${err.message}`, err);
  }
});

const getServiceAreaApplicationStatus = asyncHandler(async (req, res, next) => {
  try {
    // Find all service area applications for the logged-in user
    const applications = await ServiceArea.find({ provider: req.user._id })
      .select('service applicationStatus createdAt updatedAt')
      .populate({ path: 'service', select: 'title description' });

    // If no applications found, return empty array
    if (!applications || applications.length === 0) {
      return res
        .status(200)
        .json(new ApiResponse(200, [], 'No service-area applications found'));
    }

    // Return status for each application
    const statusList = applications.map((app) => ({
      service: app.service,
      applicationStatus: app.applicationStatus,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }));

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          statusList,
          'Service-area application status fetched successfully'
        )
      );
  } catch (err) {
    next(err);
  }
});
export {
  createServiceArea,
  updateServiceAreaStatus,
  getServiceAreas,
  getServiceAreaById,
  getServiceAreasByProvider,
  addServiceForCompletedProfile,
  getAppliedServiceAreas,
  updateServiceArea,
  getServiceAreaApplicationStatus,
};
// Get service-area application status for logged-in user
