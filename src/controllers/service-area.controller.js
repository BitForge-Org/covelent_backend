import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ServiceArea } from '../models/service-area.model.js';
import { User } from '../models/user.model.js';
import logger from '../utils/logger.js';

// Create a new service area and upload documents
const createServiceArea = asyncHandler(async (req, res, next) => {
  const { service, availableLocations } = req.body;

  // Start a session for transaction
  const session = await ServiceArea.startSession();
  session.startTransaction();
  try {
    // Robustly handle availableLocations as array, string, or array of comma-separated strings
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

export {
  createServiceArea,
  updateServiceAreaStatus,
  getServiceAreas,
  getServiceAreaById,
  getServiceAreasByProvider,
};
