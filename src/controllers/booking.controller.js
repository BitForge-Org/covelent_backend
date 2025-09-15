import { ProviderRejection } from '../models/provider-rejection.model.js';
// Provider accepts a booking (transactional)

import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';

import { Booking } from '../models/booking.model.js';
import { ProviderApplication } from '../models/provider-application.model.js';
import { Service } from '../models/service.model.js';
import { Address } from '../models/address.model.js';
// import { Notification } from '../models/notification.model.js';
import mongoose from 'mongoose';
import razorpay from '../utils/razorpay.js';

const createBooking = asyncHandler(async (req, res) => {
  try {
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
      throw new ApiError(404, 'Service not found or inactive');
    }

    const option = service.pricingOptions.id(selectedPricingOption);
    if (!option) {
      throw new ApiError(400, 'Invalid pricing option selected');
    }

    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    if (scheduledDateTime <= new Date()) {
      throw new ApiError(400, 'Scheduled date and time must be in the future');
    }

    // Location logic: Accepts either an address ObjectId or a full address object
    let addressId;
    if (!location) {
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
    } else {
      throw new ApiError(400, 'Invalid location details');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

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

      if (paymentMethod !== 'cash') {
        order = await razorpay.orders.create({
          amount: option.price * 100,
          currency: 'INR',
          receipt: `receipt_${booking[0]._id}`,
        });

        booking[0].payment.orderId = order.id;
        await booking[0].save({ session });
      }

      await session.commitTransaction();
      session.endSession();
      return res
        .status(201)
        .json(
          new ApiResponse(
            201,
            { booking: booking[0], order },
            'Booking created'
          )
        );
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw new ApiError(
        500,
        'Booking creation failed, please try again: ' + err
      );
    }
  } catch (error) {
    logger.error('Error in createBooking:', error);
    throw new ApiError(500, 'Failed to create booking');
  }
});

// Get user's booking history with optional status filter
const getBookingsHistory = asyncHandler(async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };
    if (status) {
      filter.bookingStatus = status;
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
  try {
    const userId = req.user._id;

    // Find provider applications where provider is the current user and status is approved
    const approvedProviderApps = await ProviderApplication.find({
      provider: userId,
      applicationStatus: 'approved',
    });

    if (!approvedProviderApps.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            bookings,
            'No approved provider applications found'
          )
        );
    }

    // Get all service IDs and availableLocations from these provider applications
    const serviceIdToLocations = {};
    approvedProviderApps.forEach((app) => {
      const sid = app.service.toString();
      if (!serviceIdToLocations[sid]) serviceIdToLocations[sid] = new Set();
      (app.availableLocations || []).forEach((locId) =>
        serviceIdToLocations[sid].add(locId.toString())
      );
    });
    let serviceIds = Object.keys(serviceIdToLocations);

    // Exclude bookings that this provider has rejected
    const rejectedBookings = await ProviderRejection.find({ provider: userId });
    const rejectedBookingIds = new Set(
      rejectedBookings.map((r) => r.booking.toString())
    );

    // Find bookings where the service matches and status is 'booking-requested', and not expired
    const now = new Date();
    const bookings = await Booking.find({
      service: { $in: serviceIds },
      bookingStatus: 'booking-requested',
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
      _id: { $nin: Array.from(rejectedBookingIds) },
    }).populate('service');

    // Filter bookings to only those where the booking location matches provider's approved locations
    const filteredBookings = bookings.filter((booking) => {
      const sid = booking.service._id.toString();
      const bookingLocId = booking.locationAvailable
        ? booking.locationAvailable.toString()
        : null;
      if (!bookingLocId) return false;
      return (
        serviceIdToLocations[sid] && serviceIdToLocations[sid].has(bookingLocId)
      );
    });

    if (!filteredBookings.length) {
      return res
        .status(200)
        .json(
          new ApiResponse(
            204,
            bookings,
            'No booking-requested bookings found for your approved services and locations'
          )
        );
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          filteredBookings,
          'Booking-requested bookings for your approved services and locations retrieved'
        )
      );
  } catch (error) {
    logger.error('Error in getAvailableBookings:', error);
    throw new ApiError(500, 'Failed to retrieve available bookings');
  }
});

const acceptBooking = asyncHandler(async (req, res) => {
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
      const providerApp = await ProviderApplication.findOne({
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
import logger from '../utils/logger.js';
const rejectBooking = asyncHandler(async (req, res) => {
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

export {
  createBooking,
  getBookingsHistory,
  getAvailableBookings,
  acceptBooking,
  getAcceptedBookings,
  rejectBooking,
};
