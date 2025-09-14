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
        new ApiResponse(201, { booking: booking[0], order }, 'Booking created')
      );
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(
      500,
      'Booking creation failed, please try again: ' + err
    );
  }
});

const getBookingsHistory = asyncHandler(async (req, res) => {
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
    if (booking.service && booking.selectedPricingOption) {
      const option = booking.service.pricingOptions.find(
        (opt) => opt._id.toString() === booking.selectedPricingOption.toString()
      );
      booking.selectedPricingOption = option || null;
    }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { bookings }, 'Bookings retrieved'));
});

const getAvailableBookings = asyncHandler(async (req, res) => {
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
          { bookings: [] },
          'No approved provider applications found' + approvedProviderApps
        )
      );
  }

  // Get all service IDs from these provider applications
  const serviceIds = approvedProviderApps.map((app) => app.service.toString());

  // Find bookings where the service matches any of these service IDs and status is 'pending'
  const bookings = await Booking.find({
    service: { $in: serviceIds },
    bookingStatus: 'pending',
  }).populate('service');

  if (!bookings.length) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          204,
          { bookings: [] },
          'No pending bookings found for your approved services'
        )
      );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { bookings },
        'Pending bookings for your approved services retrieved'
      )
    );
});

export { createBooking, getBookingsHistory, getAvailableBookings };
