import { ProviderRejection } from '../models/provider-rejection.model.js';
// Provider accepts a booking (transactional)

import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';

import { Booking } from '../models/booking.model.js';
// Get booking by ID

import { ServiceArea } from '../models/service-area.model.js';
import { Service } from '../models/service.model.js';
import { Address } from '../models/address.model.js';
// import { Notification } from '../models/notification.model.js';
import mongoose from 'mongoose';
import razorpay from '../utils/razorpay.js';
import logger from '../utils/logger.js';

const createBooking = asyncHandler(async (req, res) => {
  logger.info(`[BOOKING] createBooking called by user: ${req.user?._id}`);
  logger.debug(`[BOOKING] Request body: ${JSON.stringify(req.body)}`);

  const {
    serviceId,
    selectedPricingOption,
    scheduledTime,
    specialInstructions,
    scheduledDate,
    location,
    paymentMethod,
  } = req.body;

  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) {
    logger.warn(`[BOOKING] Service not found or inactive: ${serviceId}`);
    throw new ApiError(404, 'Service not found or inactive');
  }

  const option = service.pricingOptions.id(selectedPricingOption);
  if (!option) {
    logger.warn(
      `[BOOKING] Invalid pricing option selected: ${selectedPricingOption}`
    );
    throw new ApiError(400, 'Invalid pricing option selected');
  }

  const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
  if (scheduledDateTime <= new Date()) {
    logger.warn(
      `[BOOKING] Scheduled date/time is not in the future: ${scheduledDate}T${scheduledTime}`
    );
    throw new ApiError(400, 'Scheduled date and time must be in the future');
  }

  // Location logic: Accepts either an address ObjectId or a full address object
  let addressId;
  if (!location) {
    logger.warn(`[BOOKING] Location is required but missing`);
    throw new ApiError(400, 'Location is required');
  }
  if (
    typeof location === 'string' ||
    (location._id && typeof location._id === 'string')
  ) {
    // If location is an address ID or object with _id
    addressId = location._id || location;
    const addressExists = await Address.findById(addressId);
    if (!addressExists) {
      logger.warn(`[BOOKING] Provided address not found: ${addressId}`);
      throw new ApiError(400, 'Provided address not found');
    }
  } else if (
    location.address &&
    location.city &&
    location.state &&
    location.pincode &&
    location.coordinates
  ) {
    // If location is a full address object, create new Address
    const newAddress = await Address.create({
      user: req.user._id,
      ...location,
    });
    addressId = newAddress._id;
    logger.info(`[BOOKING] New address created: ${addressId}`);
  } else {
    logger.warn(
      `[BOOKING] Invalid location details: ${JSON.stringify(location)}`
    );
    throw new ApiError(400, 'Invalid location details');
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  logger.info(`[BOOKING] Transaction started for booking creation`);

  let order = null;
  try {
    const booking = await Booking.create(
      [
        {
          user: req.user._id,
          service: serviceId,
          scheduledDate,
          scheduledTime,
          specialInstructions: specialInstructions || '',
          selectedPricingOption: option._id,
          finalPrice: option.price,
          location: addressId,
          payment: { paymentMethod },
        },
      ],
      { session }
    );
    logger.info(`[BOOKING] Booking created: ${booking[0]?._id}`);

    if (paymentMethod !== 'cash') {
      order = await razorpay.orders.create({
        amount: option.price * 100,
        currency: 'INR',
        receipt: `receipt_${booking[0]._id}`,
      });
      logger.info(`[BOOKING] Razorpay order created: ${order.id}`);
      booking[0].payment.orderId = order.id;
      await booking[0].save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    logger.info(
      `[BOOKING] Transaction committed for booking: ${booking[0]?._id}`
    );
    return res
      .status(201)
      .json(
        new ApiResponse(201, { booking: booking[0], order }, 'Booking created')
      );
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error(`[BOOKING] Transaction aborted: ${err.message}`);
    throw new ApiError(
      500,
      'Booking creation failed during transaction: ' + err.message
    );
  }
});

// Get user's booking history with optional status filter
const getBookingsHistory = asyncHandler(async (req, res) => {
  logger.info(`[BOOKING] getBookingsHistory called for user: ${req.user?._id}`);
  logger.debug(`[BOOKING] Query params: ${JSON.stringify(req.query)}`);
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };
    if (status) {
      filter.bookingStatus = { $eq: status };
    }
    const bookings = await Booking.find(filter)
      .populate({
        path: 'service',
        select: 'title description category image pricingOptions',
        populate: { path: 'category', select: 'name' }, // if category is ref
      })
      .lean();

    bookings.forEach((booking) => {
      if (
        booking.service &&
        Array.isArray(booking.service.pricingOptions) &&
        booking.selectedPricingOption !== null
      ) {
        const option = booking.service.pricingOptions.find(
          (opt) =>
            opt &&
            opt._id &&
            booking.selectedPricingOption &&
            opt._id.toString() === booking.selectedPricingOption.toString()
        );
        booking.selectedPricingOption = option || null;
      } else {
        booking.selectedPricingOption = null;
      }
    });

    // If no bookings found, return 204 No Content
    return res
      .status(200)
      .json(new ApiResponse(200, bookings, 'Bookings retrieved'));
  } catch (error) {
    logger.error('Error in getBookingsHistory:', error);
    throw new ApiError(500, 'Failed to retrieve bookings history');
  }
});

// Get bookings for services where user is an approved provider
const getAvailableBookings = asyncHandler(async (req, res) => {
  logger.info(
    `[BOOKING] getAvailableBookings called for user: ${req.user?._id}`
  );
  try {
    const userId = req.user._id;
    const { latitude, longitude } = req.query;

    // Validate coordinates
    logger.info(
      `[BOOKING] Query params received: latitude=${latitude}, longitude=${longitude}`
    );
    if (!latitude || !longitude) {
      logger.warn('[BOOKING] Missing latitude or longitude in query params');
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            'Latitude and longitude are required as query parameters'
          )
        );
    }

    // Get pincode from coordinates using utility function
    let pincode;
    try {
      logger.info(
        `[BOOKING] Importing location.controller.js for pincode lookup`
      );
      const locationController = await import('./location.controller.js');
      if (typeof locationController.getPincodeFromLatLng === 'function') {
        logger.info(
          `[BOOKING] Calling getPincodeFromLatLng with lat=${latitude}, lng=${longitude}`
        );
        pincode = await locationController.getPincodeFromLatLng(
          latitude,
          longitude
        );
        logger.info(`[BOOKING] Extracted pincode: ${pincode}`);
      } else {
        logger.error(
          '[BOOKING] getPincodeFromLatLng not found in location controller'
        );
        return res
          .status(500)
          .json(
            new ApiResponse(
              500,
              null,
              'Location controller does not support pincode lookup'
            )
          );
      }
    } catch (err) {
      logger.error('[BOOKING] Error getting pincode from coordinates:', err);
      if (err instanceof Error && err.message) {
        return res.status(404).json(new ApiResponse(404, null, err.message));
      }
      return res
        .status(500)
        .json(
          new ApiResponse(500, null, 'Failed to get pincode from coordinates')
        );
    }
    if (!pincode) {
      logger.warn(`[BOOKING] No pincode found for coordinates.`);
      return res
        .status(404)
        .json(
          new ApiResponse(
            404,
            null,
            'No pincode found for provided coordinates'
          )
        );
    }

    // Find provider applications where provider is the current user and status is approved
    const approvedProviderApps = await ServiceArea.find({
      provider: userId,
      applicationStatus: 'approved',
    }).populate('availableLocations'); // Populate Area for pincodes

    if (!approvedProviderApps.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, [], 'No approved provider applications found')
        );
    }

    // Build a map: serviceId -> Set of pincodes from availableLocations
    const serviceIdToPincodes = {};
    approvedProviderApps.forEach((app) => {
      const sid = app.service.toString();
      if (!serviceIdToPincodes[sid]) serviceIdToPincodes[sid] = new Set();
      (app.availableLocations || []).forEach((area) => {
        if (Array.isArray(area.pincodes)) {
          area.pincodes.forEach((pin) =>
            serviceIdToPincodes[sid].add(String(pin))
          );
        } else if (area.pincode) {
          serviceIdToPincodes[sid].add(String(area.pincode));
        }
      });
    });
    let serviceIds = Object.keys(serviceIdToPincodes);

    // Find all services where user's pincode matches provider's availableLocations
    const matchedServiceIds = serviceIds.filter((sid) =>
      serviceIdToPincodes[sid].has(String(pincode))
    );
    if (!matchedServiceIds.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(204, [], 'No services available for your location')
        );
    }

    // Exclude bookings that this provider has rejected
    const rejectedBookings = await ProviderRejection.find({ provider: userId });
    const rejectedBookingIds = new Set(
      rejectedBookings.map((r) => r.booking.toString())
    );

    // Find bookings for matched services, user's pincode, and status 'booking-requested', not expired
    const now = new Date();
    // Find addresses with this pincode
    const Address = (await import('../models/address.model.js')).Address;
    const addresses = await Address.find({ pincode: String(pincode) }).select(
      '_id'
    );
    const addressIds = addresses.map((a) => a._id);
    if (!addressIds.length) {
      return res
        .status(200)
        .json(new ApiResponse(204, [], 'No bookings found for your pincode'));
    }

    const bookings = await Booking.find({
      service: { $in: matchedServiceIds },
      location: { $in: addressIds },
      bookingStatus: 'booking-requested',
      _id: { $nin: Array.from(rejectedBookingIds) },
      $expr: {
        $gt: [
          {
            $dateFromString: {
              dateString: {
                $concat: [
                  {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$scheduledDate',
                    },
                  },
                  'T',
                  '$scheduledTime',
                ],
              },
            },
          },
          now,
        ],
      },
    }).populate('service location');

    if (!bookings.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            204,
            [],
            'No booking-requested bookings found for your services and location'
          )
        );
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          bookings,
          'Booking-requested bookings for your services and location retrieved'
        )
      );
  } catch (error) {
    logger.error('Error in getAvailableBookings:', error);
    return res
      .status(500)
      .json(
        new ApiResponse(500, null, 'Failed to retrieve available bookings')
      );
  }
});

const acceptBooking = asyncHandler(async (req, res) => {
  logger.info(`[BOOKING] acceptBooking called by provider: ${req.user?._id}`);
  logger.debug(`[BOOKING] Request body: ${JSON.stringify(req.body)}`);
  try {
    const providerId = req.user._id;
    const { bookingId } = req.body;

    if (!bookingId) {
      throw new ApiError(400, 'Booking ID is required');
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Find the booking with a pessimistic lock (for update)
      const booking = await Booking.findOne({ _id: bookingId })
        .session(session)
        .populate('service');
      if (!booking) {
        throw new ApiError(404, 'Booking not found');
      }

      // Only allow accepting if booking is pending
      if (
        booking.bookingStatus !== 'pending' &&
        booking.bookingStatus !== 'booking-requested'
      ) {
        throw new ApiError(
          400,
          'Booking cannot be accepted in its current status'
        );
      }

      // Check if provider has an approved application for this service and location
      const providerApp = await ServiceArea.findOne({
        provider: providerId,
        service: booking.service._id,
        applicationStatus: 'approved',
        availableLocations: { $exists: true, $ne: [] },
      }).session(session);
      if (!providerApp) {
        throw new ApiError(403, 'You are not approved for this service');
      }

      // Assign provider and update status
      booking.provider = providerId;
      booking.bookingStatus = 'booking-confirmed';
      await booking.save({ session });

      await session.commitTransaction();
      session.endSession();
      return res
        .status(200)
        .json(
          new ApiResponse(200, { booking }, 'Booking accepted successfully')
        );
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw new ApiError(500, 'Failed to accept booking: ' + err);
    }
  } catch (error) {
    logger.error('Error in acceptBooking:', error);
    throw new ApiError(500, 'Failed to accept booking');
  }
});

// Get accepted bookings or booking history for provider with filter
const getAcceptedBookings = asyncHandler(async (req, res) => {
  logger.info(
    `[BOOKING] getAcceptedBookings called by provider: ${req.user?._id}`
  );
  logger.debug(`[BOOKING] Query params: ${JSON.stringify(req.query)}`);
  try {
    const providerId = req.user._id;
    const { status } = req.query;
    const filter = { provider: providerId };
    if (status) {
      filter.bookingStatus = status;
    } else {
      filter.bookingStatus = {
        $in: ['booking-confirmed', 'booking-in-progress', 'booking-completed'],
      };
    }
    const bookings = await Booking.find(filter)
      .populate({
        path: 'service',
        select: 'title description category image pricingOptions',
        populate: { path: 'category', select: 'name' },
      })
      .lean();

    bookings.forEach((booking) => {
      if (
        booking.service &&
        Array.isArray(booking.service.pricingOptions) &&
        booking.selectedPricingOption !== null
      ) {
        const option = booking.service.pricingOptions.find(
          (opt) =>
            opt &&
            opt._id &&
            booking.selectedPricingOption &&
            opt._id.toString() === booking.selectedPricingOption.toString()
        );
        booking.selectedPricingOption = option || null;
      } else {
        booking.selectedPricingOption = null;
      }
    });

    return res
      .status(200)
      .json(new ApiResponse(200, bookings, 'Accepted bookings retrieved'));
  } catch (error) {
    logger.error('Error in getAcceptedBookings:', error);
    throw new ApiError(500, 'Failed to retrieve accepted bookings');
  }
});

// Provider rejects a booking (no booking status change, just record rejection)
const rejectBooking = asyncHandler(async (req, res) => {
  logger.info(`[BOOKING] rejectBooking called by provider: ${req.user?._id}`);
  logger.debug(`[BOOKING] Request body: ${JSON.stringify(req.body)}`);
  try {
    const providerId = req.user._id;
    const { bookingId, reason } = req.body;

    if (!bookingId) {
      throw new ApiError(400, 'Booking ID is required');
    }

    // Find the booking to get the service
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    // Check if already rejected
    const alreadyRejected = await ProviderRejection.findOne({
      provider: providerId,
      booking: bookingId,
    });
    if (alreadyRejected) {
      return res
        .status(200)
        .json(
          new ApiResponse(200, {}, 'Booking already rejected by this provider')
        );
    }

    // Create a rejection record (include service for easier queries)
    await ProviderRejection.create({
      provider: providerId,
      booking: bookingId,
      service: booking.service,
      reason,
    });
    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Booking rejected for this provider'));
  } catch (err) {
    logger.error('Error in rejectBooking:', err);
    throw err;
  }
});

const getBookingById = asyncHandler(async (req, res) => {
  logger.info(
    `[BOOKING] getBookingById called for booking: ${req.params?.bookingId}`
  );
  try {
    const { bookingId } = req.params;
    if (!bookingId) {
      throw new ApiError(400, 'Booking ID is required');
    }
    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'service',
        select: 'title description category image pricingOptions',
        populate: { path: 'category', select: 'name' },
      })
      .populate({ path: 'user', select: 'name email phone' })
      .populate({ path: 'provider', select: 'name email phone' })
      .populate({
        path: 'location',
        select: 'address city state pincode coordinates',
      });
    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }
    // Attach selected pricing option details
    if (
      booking.service &&
      Array.isArray(booking.service.pricingOptions) &&
      booking.selectedPricingOption !== null
    ) {
      const option = booking.service.pricingOptions.find(
        (opt) =>
          opt &&
          opt._id &&
          booking.selectedPricingOption &&
          opt._id.toString() === booking.selectedPricingOption.toString()
      );
      booking.selectedPricingOption = option || null;
    } else {
      booking.selectedPricingOption = null;
    }
    return res
      .status(200)
      .json(new ApiResponse(200, booking, 'Booking retrieved'));
  } catch (error) {
    logger.error('Error in getBookingById:', error);
    throw new ApiError(500, 'Failed to retrieve booking');
  }
});

export {
  createBooking,
  getBookingsHistory,
  getAvailableBookings,
  acceptBooking,
  getAcceptedBookings,
  rejectBooking,
  getBookingById,
};
