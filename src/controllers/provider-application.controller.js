import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ProviderApplication } from '../models/provider-application.model.js';
import { User } from '../models/user.model.js';

// Create a new provider application
const createProviderApplication = asyncHandler(async (req, res) => {
  const { provider, service } = req.body;

  if (!provider || !service) {
    throw new ApiError(400, 'Provider and service are required');
  }

  const user = await User.findById(provider);

  if (!user || user.role !== 'provider' || !user.isVerified) {
    throw new ApiError(404, 'Provider not found or not verified');
  }

  const existingApplication = await ProviderApplication.findOne({
    provider,
    service,
  }).select('_id applicationStatus');

  if (existingApplication) {
    throw new ApiError(
      400,
      `Application already exists with status: ${existingApplication.applicationStatus}`
    );
  }

  const newApplication = await ProviderApplication.create({
    provider,
    service,
    applicationStatus: 'pending',
  });

  return ApiResponse.success(
    res,
    201,
    'Provider application created successfully',
    newApplication
  );
});

// Update application status (only status & optional notes)
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { applicationStatus, adminNotes } = req.body;

  if (
    !['pending', 'approved', 'rejected', 'suspended'].includes(
      applicationStatus
    )
  ) {
    throw new ApiError(400, 'Invalid application status');
  }

  const updatedApplication = await ProviderApplication.findByIdAndUpdate(
    id,
    { applicationStatus, adminNotes },
    { new: true, runValidators: true }
  );

  if (!updatedApplication) {
    throw new ApiError(404, 'Provider application not found');
  }

  // Send Notification to user about status

  return ApiResponse.success(
    res,
    200,
    'Application status updated successfully',
    updatedApplication
  );
});

// Get all applications (with filters & pagination)
const getApplications = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status) filter.applicationStatus = status;

  const applications = await ProviderApplication.find(filter)
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await ProviderApplication.countDocuments(filter);

  return ApiResponse.success(res, 200, 'Applications fetched successfully', {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    applications,
  });
});

// Get single application
const getApplicationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const application = await ProviderApplication.findById(id);

  if (!application) {
    throw new ApiError(404, 'Provider application not found');
  }

  return ApiResponse.success(
    res,
    200,
    'Application fetched successfully',
    application
  );
});

const getApplicationsByProvider = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const application = await ProviderApplication.findById(id);

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
