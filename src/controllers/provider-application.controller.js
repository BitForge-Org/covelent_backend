import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ProviderApplication as ServiceArea } from '../models/service-area.model.js';
import { User } from '../models/user.model.js';

// Create a new provider application and upload documents
const createProviderApplication = asyncHandler(async (req, res, next) => {
  const { service, availableLocations } = req.body;

  if (!service) {
    throw new ApiError(400, 'Service is required');
  }

  if (!req.user || req.user.role !== 'provider') {
    throw new ApiError(
      403,
      'Only users with role "Provider" can apply as provider'
    );
  }

  const user = await User.findById(req.user._id);

  if (!user || user.role !== 'provider' || !user.isVerified) {
    throw new ApiError(404, 'User not found or not verified');
  }

  // Handle document uploads (aadhaar/PAN)
  let aadhaarFrontImageLocalPath, aadhaarBackImageLocalPath, panImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.aadhaarFrontImage) &&
    req.files.aadhaarFrontImage.length > 0
  ) {
    aadhaarFrontImageLocalPath = req.files.aadhaarFrontImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.aadhaarBackImage) &&
    req.files.aadhaarBackImage.length > 0
  ) {
    aadhaarBackImageLocalPath = req.files.aadhaarBackImage[0].path;
  }
  if (
    req.files &&
    Array.isArray(req.files.panImage) &&
    req.files.panImage.length > 0
  ) {
    panImageLocalPath = req.files.panImage[0].path;
  }

  let aadhaarFrontImage, aadhaarBackImage, panImage;
  if (aadhaarFrontImageLocalPath) {
    aadhaarFrontImage = await uploadOnCloudinary(
      aadhaarFrontImageLocalPath,
      'aadhaar'
    );
    user.aadhaar.frontImage = aadhaarFrontImage?.url || '';
  }
  if (aadhaarBackImageLocalPath) {
    aadhaarBackImage = await uploadOnCloudinary(
      aadhaarBackImageLocalPath,
      'aadhaar'
    );
    user.aadhaar.backImage = aadhaarBackImage?.url || '';
  }
  if (panImageLocalPath) {
    panImage = await uploadOnCloudinary(panImageLocalPath, 'pan');
    user.pan.link = panImage?.url || '';
  }

  // If both aadhaar images and pan are uploaded, set isProfileCompleted true
  if (user.aadhaar.frontImage && user.aadhaar.backImage && user.pan.link) {
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
    aadhaarFrontImage: user.aadhaar.frontImage,
    aadhaarBackImage: user.aadhaar.backImage,
    panImage: user.pan.link,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        application: newApplication,
        isProfileCompleted: user.isProfileCompleted,
        aadhaar: user.aadhaar,
        pan: user.pan,
      },
      'Provider application and documents uploaded'
    )
  );
});

// Update application status (only status & optional notes)
const updateApplicationStatus = asyncHandler(async (req, res, next) => {
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
    throw new ApiError(404, 'Provider application not found');
  }

  // Send Notification to user about status

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedApplication,
        'Application status updated successfully'
      )
    );
});

// Get all applications (with filters & pagination)
const getApplications = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status) filter.applicationStatus = status;

  const applications = await ServiceArea.find(filter)
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 })
    .populate('service')
    .populate({ path: 'provider', select: 'fullName email phoneNumber' });

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
      'Applications fetched successfully'
    )
  );
});

// Get single application
const getApplicationById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const application = await ServiceArea.findById(id)
    .populate({ path: 'service', select: 'title description' })
    .populate({ path: 'provider', select: 'fullName email phoneNumber' });

  if (!application) {
    throw new ApiError(404, 'Provider application not found');
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, application, 'Application fetched successfully')
    );
});

const getApplicationsByProvider = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const application = await ServiceArea.findById(id);

  if (!application) {
    throw new ApiError(404, 'Provider application not found');
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, application, 'Application fetched successfully')
    );
});

export {
  createProviderApplication,
  updateApplicationStatus,
  getApplications,
  getApplicationById,
  getApplicationsByProvider,
};
