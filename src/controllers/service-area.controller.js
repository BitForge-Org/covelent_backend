import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ServiceArea } from '../models/service-area.model.js';
import { User } from '../models/user.model.js';

// Create a new service area and upload documents
const createServiceArea = asyncHandler(async (req, res, next) => {
  const { service, availableLocations } = req.body;

  if (!service) {
    throw new ApiError(400, 'Service is required');
  }

  const user = await User.findById(req.user._id);

  if (!user || user.role !== 'provider' || user.isProfileCompleted) {
    throw new ApiError(404, 'User not found or not eligible ' + user);
  }

  // Handle document uploads (Aadhar/PAN)
  let aadharFrontImageLocalPath, aadharBackImageLocalPath, panImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.aadharFrontImage) &&
    req.files.aadharFrontImage.length > 0
  ) {
    aadharFrontImageLocalPath = req.files.aadharFrontImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.aadharBackImage) &&
    req.files.aadharBackImage.length > 0
  ) {
    aadharBackImageLocalPath = req.files.aadharBackImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.panImage) &&
    req.files.panImage.length > 0
  ) {
    panImageLocalPath = req.files.panImage[0].path;
  }

  let aadharFrontImage, aadharBackImage, panImage;
  if (aadharFrontImageLocalPath) {
    aadharFrontImage = await uploadOnCloudinary(
      aadharFrontImageLocalPath,
      'aadhar'
    );
    user.aadhar.frontImage = aadharFrontImage?.url || '';
  }
  if (aadharBackImageLocalPath) {
    aadharBackImage = await uploadOnCloudinary(
      aadharBackImageLocalPath,
      'aadhar'
    );
    user.aadhar.backImage = aadharBackImage?.url || '';
  }
  if (panImageLocalPath) {
    panImage = await uploadOnCloudinary(panImageLocalPath, 'pan');
    user.pan.link = panImage?.url || '';
  }

  // If both aadhar images and pan are uploaded, set isProfileCompleted true
  if (user.aadhar.frontImage && user.aadhar.backImage && user.pan.link) {
    user.isProfileCompleted = true;
  }
  await user.save();

  const existingApplication = await ServiceArea.findOne({
    provider: req.user._id,
    service,
  }).select('_id applicationStatus');

  if (existingApplication) {
    throw new ApiError(
      400,
      `Application already exists with status: ${existingApplication.applicationStatus}`
    );
  }

  const newApplication = await ServiceArea.create({
    provider: req.user._id,
    service,
    availableLocations: Array.isArray(availableLocations)
      ? availableLocations
      : [],
    applicationStatus: 'pending',
    aadharFrontImage: user.aadhar.frontImage,
    aadharBackImage: user.aadhar.backImage,
    panImage: user.pan.link,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        application: newApplication,
        isProfileCompleted: user.isProfileCompleted,
        aadhar: user.aadhar,
        pan: user.pan,
      },
      'Service area and documents uploaded'
    )
  );
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

  const updatedApplication = await ServiceArea.findByIdAndUpdate(
    id,
    { applicationStatus, adminNotes },
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
    .sort({ createdAt: -1 });

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
