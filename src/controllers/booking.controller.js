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

import razorpay from '../utils/razorpay.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

const booking = asyncHandler(async (req, res) => {
  // TODO: Implement booking logic or remove this function if unused
  const user = req.user;
  const { status } = req.query;
  logger.info(
    `[BOOKING] booking called by user: ${req.user?._id} with status: ${status}`,
    status
  );

  if (user.role === 'user') {
    try {
      const filter = { user: req.user._id };
      if (status) {
        filter.bookingStatus = { $eq: status };
      }
      const bookings = await Booking.find(filter)
        .populate({
          path: 'service',
          select:
            'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment ',
        })
        .populate({
          path: 'user',
          select: 'fullName email',
        })
        .populate({
          path: 'location',
        })
        .populate({
          path: 'provider',
          select: 'phoneNumber fullName avatar',
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
  } else if (user.role === 'provider') {
    if (status === 'booking-requested') {
      const { latitude, longitude } = req.query;
      logger.info(
        `Provider requested bookings with coordinates: ${latitude}, ${longitude}`
      );
      if (!latitude || !longitude) {
        throw new ApiError(400, 'Coordinates are required for providers');
      }
      let pincode;
      try {
        const locationController = await import('./location.controller.js');
        if (typeof locationController.getPincodeFromLatLng === 'function') {
          pincode = await locationController.getPincodeFromLatLng(
            latitude,
            longitude
          );
        } else {
          throw new ApiError(
            500,
            'Location controller does not support pincode lookup'
          );
        }
      } catch (err) {
        throw new ApiError(500, 'Failed to get pincode from coordinates');
      }
      if (!pincode) {
        throw new ApiError(404, 'No pincode found for provided coordinates');
      }
      const approvedProviderApps = await ServiceArea.find({
        provider: user._id,
        applicationStatus: 'approved',
      }).populate('availableLocations');
      if (!approvedProviderApps.length) {
        return res
          .status(200)
          .json(
            new ApiResponse(200, [], 'No approved provider applications found')
          );
      }
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
      const serviceIds = Object.keys(serviceIdToPincodes);
      const allPincodesSet = new Set();
      Object.values(serviceIdToPincodes).forEach((pinSet) => {
        pinSet.forEach((pin) => allPincodesSet.add(pin));
      });
      const allPincodes = Array.from(allPincodesSet);
      if (!allPincodes.length) {
        return res
          .status(200)
          .json(
            new ApiResponse(204, [], 'No pincodes found for your service areas')
          );
      }
      const AddressModel = (await import('../models/address.model.js')).Address;
      const addresses = await AddressModel.find({
        pincode: { $in: allPincodes },
      }).select('_id');
      const validAddressIds = addresses
        .map((a) => a._id)
        .filter(isValidObjectId);
      if (!validAddressIds.length) {
        return res
          .status(200)
          .json(
            new ApiResponse(204, [], 'No addresses found for your pincodes')
          );
      }
      const rejectedBookings = await ProviderRejection.find({
        provider: user._id,
      });
      const rejectedBookingIds = new Set(
        rejectedBookings.map((r) => r.booking.toString())
      );
      const now = new Date();
      const bookings = await Booking.find({
        service: { $in: serviceIds },
        location: { $in: validAddressIds },
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
      })
        .populate({
          path: 'service',
          select:
            'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment ',
        })
        .populate({
          path: 'user',
          select: 'fullName email',
        })
        .populate({
          path: 'location',
        });
      if (!bookings.length) {
        return res
          .status(200)
          .json(
            new ApiResponse(
              204,
              [],
              'No booking-requested bookings found for your services and pincodes'
            )
          );
      }
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            bookings,
            'Booking-requested bookings for your services and pincodes retrieved'
          )
        );
    } else {
      const filter = { provider: user._id };
      if (status) {
        filter.bookingStatus = status;
      }
      const bookings = await Booking.find(filter)
        .populate({
          path: 'service',
          select:
            'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment ',
        })
        .populate({
          path: 'user',
          select: 'fullName email',
        })
        .populate({
          path: 'location',
        })
        .populate({
          path: 'provider',
          select: 'phoneNumber fullName avatar',
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
        .json(new ApiResponse(200, bookings, 'Provider bookings retrieved'));
    }
  }
});

const createBooking = asyncHandler(async (req, res) => {
  // If scheduledTime is a full ISO string, extract only the time part

  const {
    serviceId,
    selectedPricingOption,
    specialInstructions,
    scheduledDate,
    location,
    paymentMethod,
  } = req.body;
  let scheduledTime = req.body.scheduledTime;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(scheduledTime)) {
    scheduledTime = scheduledTime.split('T')[1];
  }
  logger.info(`[BOOKING] createBooking called by user: ${req.user?._id}`);
  logger.debug(`[BOOKING] Request body: ${JSON.stringify(req.body)}`);

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

  // Validate scheduledDate format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    logger.warn(
      `[BOOKING] scheduledDate is not in YYYY-MM-DD format: ${scheduledDate}`
    );
    throw new ApiError(400, 'scheduledDate must be in YYYY-MM-DD format');
  }

  // Validate scheduledTime format (HH:mm or HH:mm:ss or HH:mm:ss.sss)
  if (!/^\d{2}:\d{2}(:\d{2}(\.\d{3})?)?$/.test(scheduledTime)) {
    logger.warn(
      `[BOOKING] scheduledTime is not in valid format: ${scheduledTime}`
    );
    throw new ApiError(
      400,
      'scheduledTime must be in HH:mm or HH:mm:ss or HH:mm:ss.sss format'
    );
  }

  // Construct ISO string for scheduledDateTime
  const scheduledDateTimeString = `${scheduledDate}T${scheduledTime.length === 5 ? scheduledTime + ':00' : scheduledTime}`;
  const scheduledDateTime = new Date(scheduledDateTimeString);
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
    // Populate user and service for response
    const populatedBooking = await Booking.findById(booking[0]._id)
      .populate({
        path: 'service',
        select:
          'title description category duration createdAt image media bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment',
      })
      .populate({
        path: 'user',
        select: 'fullName email',
      })
      .populate({
        path: 'location',
      });
    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { booking: populatedBooking, order },
          'Booking created'
        )
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
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };
    if (status) {
      filter.bookingStatus = { $eq: status };
    }
    const bookings = await Booking.find(filter)
      .populate({
        path: 'service',
        select:
          'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment ',
      })
      .populate({
        path: 'user',
        select: 'fullName email',
      })
      .populate({
        path: 'location',
      })
      .populate({
        path: 'provider',
        select: 'phoneNumber fullName avatar',
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
// Utility to check for valid ObjectId

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
    const serviceIds = Object.keys(serviceIdToPincodes);

    // Collect all pincodes from all availableLocations
    const allPincodesSet = new Set();
    Object.values(serviceIdToPincodes).forEach((pinSet) => {
      pinSet.forEach((pin) => allPincodesSet.add(pin));
    });
    const allPincodes = Array.from(allPincodesSet);
    if (!allPincodes.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(204, [], 'No pincodes found for your service areas')
        );
    }

    // Find addresses with any of these pincodes
    const Address = (await import('../models/address.model.js')).Address;
    const addresses = await Address.find({
      pincode: { $in: allPincodes },
    }).select('_id');
    const validAddressIds = addresses.map((a) => a._id).filter(isValidObjectId);
    if (!validAddressIds.length) {
      return res
        .status(200)
        .json(new ApiResponse(204, [], 'No addresses found for your pincodes'));
    }

    // Exclude bookings that this provider has rejected
    const rejectedBookings = await ProviderRejection.find({ provider: userId });
    const rejectedBookingIds = new Set(
      rejectedBookings.map((r) => r.booking.toString())
    );

    // Find bookings for all services and all valid addresses, status 'booking-requested', not expired
    const now = new Date();
    const bookings = await Booking.find({
      service: { $in: serviceIds },
      location: { $in: validAddressIds },
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
    })
      .populate({
        path: 'service',
        select:
          'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment ',
      })
      .populate({
        path: 'user',
        select: 'fullName email',
      })
      .populate({
        path: 'location',
      });

    if (!bookings.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            204,
            [],
            'No booking-requested bookings found for your services and pincodes'
          )
        );
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          bookings,
          'Booking-requested bookings for your services and pincodes retrieved'
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

const bookingInProgress = asyncHandler(async (req, res) => {
  logger.info(
    `[BOOKING] bookingInProgress called by provider: ${req.user?._id}`
  );
  logger.debug(`[BOOKING] Request body: ${JSON.stringify(req.body)}`);
  try {
    const providerId = req.user._id;
    const { bookingId, latitude, longitude } = req.body;

    if (!bookingId) {
      throw new ApiError(400, 'Booking ID is required');
    }
    if (!latitude || !longitude) {
      throw new ApiError(400, 'Latitude and longitude are required');
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      provider: providerId,
    }).populate({ path: 'location', select: 'pincode' });
    if (!booking) {
      throw new ApiError(404, 'Booking not found for this provider');
    }

    // Only allow status change if current status is 'booking-confirmed'
    if (booking.bookingStatus !== 'booking-confirmed') {
      throw new ApiError(
        400,
        'Booking status can only be changed to in-progress from confirmed status'
      );
    }

    // Get pincode from lat/lng
    let pincode;
    try {
      const locationController = await import('./location.controller.js');
      if (typeof locationController.getPincodeFromLatLng === 'function') {
        pincode = await locationController.getPincodeFromLatLng(
          latitude,
          longitude
        );
      } else {
        throw new Error('Location controller does not support pincode lookup');
      }
    } catch (err) {
      logger.error('[BOOKING] Error getting pincode from coordinates:', err);
      throw new ApiError(500, 'Failed to get pincode from coordinates');
    }
    if (!pincode) {
      throw new ApiError(404, 'No pincode found for provided coordinates');
    }

    // Compare pincodes
    if (String(booking.location?.pincode) !== String(pincode)) {
      throw new ApiError(
        400,
        'Provider location pincode does not match booking address pincode'
      );
    }

    booking.bookingStatus = 'booking-in-progress';
    await booking.save();

    return res
      .status(200)
      .json(new ApiResponse(200, { booking }, 'Booking marked in-progress'));
  } catch (error) {
    logger.error('Error in bookingInProgress:', error);
    throw new ApiError(500, 'Failed to mark booking as in-progress');
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
        select:
          'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment',
      })
      .populate({
        path: 'user',
        select: 'fullName email',
      })
      .populate({
        path: 'location',
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

// Update booking status to any allowed value
const allowedStatuses = [
  'booking-requested',
  'booking-confirmed',
  'booking-in-progress',
  'booking-completed',
  'booking-cancelled',
  // 'booking-rejected',
];

const updateBookingStatus = asyncHandler(async (req, res) => {
  try {
    const { bookingId, status, latitude, longitude } = req.body;
    if (!bookingId || !status) {
      return res.status(400).json({
        statusCode: 400,
        data: null,
        success: false,
        message: 'bookingId and status are required',
        errors: ['bookingId and status are required'],
      });
    }
    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({
        statusCode: 400,
        data: null,
        success: false,
        message: 'Invalid bookingId',
        errors: ['Invalid bookingId'],
      });
    }
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        statusCode: 400,
        data: null,
        success: false,
        message: 'Invalid status value',
        errors: ['Invalid status value'],
      });
    }
    const booking = await Booking.findById(bookingId).populate({
      path: 'location',
      select: 'pincode',
    });
    if (!booking) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        success: false,
        message: 'Booking not found',
        errors: ['Booking not found'],
      });
    }

    // For booking-confirmed, check user's location is in service area
    if (status === 'booking-confirmed') {
      if (!latitude || !longitude) {
        return res.status(400).json({
          statusCode: 400,
          data: null,
          success: false,
          message: 'Latitude and longitude are required for confirmation',
          errors: ['Latitude and longitude are required for confirmation'],
        });
      }
      let pincode;
      try {
        const locationController = await import('./location.controller.js');
        if (typeof locationController.getPincodeFromLatLng === 'function') {
          pincode = await locationController.getPincodeFromLatLng(
            latitude,
            longitude
          );
        } else {
          throw new Error(
            'Location controller does not support pincode lookup'
          );
        }
      } catch (err) {
        logger.error('[BOOKING] Error getting pincode from coordinates:', err);
        return res.status(500).json({
          statusCode: 500,
          data: null,
          success: false,
          message: 'Failed to get pincode from coordinates',
          errors: ['Failed to get pincode from coordinates'],
        });
      }
      if (!pincode) {
        return res.status(404).json({
          statusCode: 404,
          data: null,
          success: false,
          message: 'No pincode found for provided coordinates',
          errors: ['No pincode found for provided coordinates'],
        });
      }
      if (String(booking.location?.pincode) !== String(pincode)) {
        return res.status(400).json({
          statusCode: 400,
          data: null,
          success: false,
          message:
            'User location pincode does not match booking address pincode',
          errors: [
            'User location pincode does not match booking address pincode',
          ],
        });
      }
    }

    // For booking-in-progress and booking-completed, check pincode match
    if (status === 'booking-in-progress' || status === 'booking-completed') {
      if (!latitude || !longitude) {
        return res.status(400).json({
          statusCode: 400,
          data: null,
          success: false,
          message: 'Latitude and longitude are required',
          errors: ['Latitude and longitude are required'],
        });
      }
      let pincode;
      try {
        const locationController = await import('./location.controller.js');
        if (typeof locationController.getPincodeFromLatLng === 'function') {
          pincode = await locationController.getPincodeFromLatLng(
            latitude,
            longitude
          );
        } else {
          throw new Error(
            'Location controller does not support pincode lookup'
          );
        }
      } catch (err) {
        logger.error('[BOOKING] Error getting pincode from coordinates:', err);
        return res.status(500).json({
          statusCode: 500,
          data: null,
          success: false,
          message: 'Failed to get pincode from coordinates',
          errors: ['Failed to get pincode from coordinates'],
        });
      }
      if (!pincode) {
        return res.status(404).json({
          statusCode: 404,
          data: null,
          success: false,
          message: 'No pincode found for provided coordinates',
          errors: ['No pincode found for provided coordinates'],
        });
      }
      if (String(booking.location?.pincode) !== String(pincode)) {
        return res.status(400).json({
          statusCode: 400,
          data: null,
          success: false,
          message:
            'User location pincode does not match booking address pincode',
          errors: [
            'User location pincode does not match booking address pincode',
          ],
        });
      }
      if (status === 'booking-completed') {
        booking.completedAt = new Date();
      }
    }

    booking.bookingStatus = status;
    await booking.save();
    logger.info(
      `[BOOKING] Status updated for booking ${bookingId} to ${status}`
    );
    return res
      .status(200)
      .json(new ApiResponse(200, booking, 'Booking status updated'));
  } catch (error) {
    logger.error('[BOOKING] Error in updateBookingStatus:', error);
    return res.status(500).json({
      statusCode: 500,
      data: null,
      success: false,
      message: 'Failed to update booking status',
      errors: [error?.message || 'Failed to update booking status'],
    });
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
        select:
          'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment',
      })
      .populate({
        path: 'user',
        select: 'fullName email',
      })
      .populate({
        path: 'location',
      })
      .populate({
        path: 'provider',
        select: 'phoneNumber fullName avatar',
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

// Get all bookings for all users (admin/testing)
const getAllBookings = asyncHandler(async (req, res) => {
  logger.info(`[BOOKING] getAllBookings called`);
  logger.debug(`[BOOKING] Query params: ${JSON.stringify(req.query)}`);
  try {
    const { status } = req.query;
    const filter = {};
    // Only apply status filter if it is a non-empty string and not "string"
    if (status && typeof status === 'string' && status !== 'string') {
      filter.bookingStatus = { $eq: status };
    }
    let bookings = await Booking.find(filter).lean();

    // Filter out bookings with invalid location ObjectId
    bookings = bookings.filter(
      (booking) => !booking.location || isValidObjectId(booking.location)
    );

    // Populate service, user, provider, location for valid bookings
    bookings = await Promise.all(
      bookings.map(async (booking) => {
        const populated = await Booking.findById(booking._id)
          .populate({
            path: 'service',
            select:
              'title description category duration createdAt image bookingStatus scheduledDate scheduledTime location selectedPricingOption finalPrice specialInstructions payment',
          })
          .populate({
            path: 'user',
            select: 'fullName email',
          })
          .populate({
            path: 'location',
          })
          .lean();
        // Attach selected pricing option details
        if (
          populated &&
          populated.service &&
          Array.isArray(populated.service.pricingOptions) &&
          populated.selectedPricingOption !== null
        ) {
          const option = populated.service.pricingOptions.find(
            (opt) =>
              opt &&
              opt._id &&
              populated.selectedPricingOption &&
              opt._id.toString() === populated.selectedPricingOption.toString()
          );
          populated.selectedPricingOption = option || null;
        } else if (populated) {
          populated.selectedPricingOption = null;
        }
        return populated;
      })
    );

    return res
      .status(200)
      .json(new ApiResponse(200, bookings, 'All bookings retrieved'));
  } catch (error) {
    logger.error('Error in getAllBookings:', error);
    throw new ApiError(500, 'Failed to retrieve all bookings');
  }
});

// Mark booking as completed by provider, with pincode check
const bookingComplete = asyncHandler(async (req, res) => {
  logger.info(`[BOOKING] bookingComplete called by provider: ${req.user?._id}`);
  logger.debug(`[BOOKING] Request body: ${JSON.stringify(req.body)}`);
  try {
    const providerId = req.user._id;
    const { bookingId, latitude, longitude } = req.body;

    if (!bookingId) {
      throw new ApiError(400, 'Booking ID is required');
    }
    if (!latitude || !longitude) {
      throw new ApiError(400, 'Latitude and longitude are required');
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      provider: providerId,
    }).populate({ path: 'location', select: 'pincode' });
    if (!booking) {
      throw new ApiError(404, 'Booking not found for this provider');
    }

    // Only allow status change if current status is 'booking-in-progress'
    if (booking.bookingStatus !== 'booking-in-progress') {
      throw new ApiError(
        400,
        'Booking status can only be changed to completed from in-progress status'
      );
    }

    // Get pincode from lat/lng
    let pincode;
    try {
      const locationController = await import('./location.controller.js');
      if (typeof locationController.getPincodeFromLatLng === 'function') {
        pincode = await locationController.getPincodeFromLatLng(
          latitude,
          longitude
        );
      } else {
        throw new Error('Location controller does not support pincode lookup');
      }
    } catch (err) {
      logger.error('[BOOKING] Error getting pincode from coordinates:', err);
      throw new ApiError(500, 'Failed to get pincode from coordinates');
    }
    if (!pincode) {
      throw new ApiError(404, 'No pincode found for provided coordinates');
    }

    // Compare pincodes
    if (String(booking.location?.pincode) !== String(pincode)) {
      throw new ApiError(
        400,
        'Provider location pincode does not match booking address pincode'
      );
    }

    booking.bookingStatus = 'booking-completed';
    booking.completedAt = new Date();
    await booking.save();

    return res
      .status(200)
      .json(new ApiResponse(200, { booking }, 'Booking marked as completed'));
  } catch (error) {
    logger.error('Error in bookingComplete:', error);
    throw new ApiError(500, 'Failed to mark booking as completed');
  }
});

// Mark booking as cancelled by provider, with pincode check
const bookingCancel = asyncHandler(async (req, res) => {
  logger.info(`[BOOKING] bookingCancel called by provider: ${req.user?._id}`);
  logger.debug(`[BOOKING] Request body: ${JSON.stringify(req.body)}`);
  try {
    const providerId = req.user._id;
    const { bookingId, latitude, longitude, cancellationReason } = req.body;

    if (!bookingId) {
      throw new ApiError(400, 'Booking ID is required');
    }
    if (!latitude || !longitude) {
      throw new ApiError(400, 'Latitude and longitude are required');
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      provider: providerId,
    }).populate({ path: 'location', select: 'pincode' });
    if (!booking) {
      throw new ApiError(404, 'Booking not found for this provider');
    }

    // Only allow status change if current status is 'booking-confirmed' or 'booking-in-progress'
    if (
      booking.bookingStatus !== 'booking-confirmed' &&
      booking.bookingStatus !== 'booking-in-progress'
    ) {
      throw new ApiError(
        400,
        'Booking can only be cancelled from confirmed or in-progress status'
      );
    }

    // Get pincode from lat/lng
    let pincode;
    try {
      const locationController = await import('./location.controller.js');
      if (typeof locationController.getPincodeFromLatLng === 'function') {
        pincode = await locationController.getPincodeFromLatLng(
          latitude,
          longitude
        );
      } else {
        throw new Error('Location controller does not support pincode lookup');
      }
    } catch (err) {
      logger.error('[BOOKING] Error getting pincode from coordinates:', err);
      throw new ApiError(500, 'Failed to get pincode from coordinates');
    }
    if (!pincode) {
      throw new ApiError(404, 'No pincode found for provided coordinates');
    }

    // Compare pincodes
    if (String(booking.location?.pincode) !== String(pincode)) {
      throw new ApiError(
        400,
        'Provider location pincode does not match booking address pincode'
      );
    }

    booking.bookingStatus = 'booking-cancelled';
    booking.cancelledAt = new Date();
    if (cancellationReason) booking.cancellationReason = cancellationReason;
    await booking.save();

    return res
      .status(200)
      .json(new ApiResponse(200, { booking }, 'Booking marked as cancelled'));
  } catch (error) {
    logger.error('Error in bookingCancel:', error);
    throw new ApiError(500, 'Failed to mark booking as cancelled');
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
  getAllBookings,
  bookingInProgress,
  bookingComplete,
  bookingCancel,
  updateBookingStatus,
  booking,
};
