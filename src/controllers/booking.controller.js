import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Booking } from '../models/booking.model.js';
import { ProviderApplication } from '../models/provider-application.model.js';
import { Service } from '../models/service.model.js';
import { User } from '../models/user.model.js';
import { Notification } from '../models/notification.model.js';
import mongoose from 'mongoose';
import razorpay from '../utils/razorpay.js';

const createBooking = asyncHandler(async (req, res) => {
  const {
    serviceId,
    scheduledTime,
    specialInstructions,
    scheduledDate,
    location,
    paymentMethod,
  } = req.body;
  if (req.user.role !== 'user') {
    throw new ApiError(403, 'Only users can create bookings');
  }
  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) {
    throw new ApiError(404, 'Service not found or inactive');
  }

  const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
  if (scheduledDateTime <= new Date()) {
    throw new ApiError(400, 'Scheduled date and time must be in the future');
  }
  if (
    !location ||
    !location.address ||
    !location.city ||
    !location.state ||
    !location.pincode ||
    !location.coordinates
  ) {
    throw new ApiError(400, 'Location details are required');
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
          providerApplication: service.providerApplication,
          scheduledDate,
          scheduledTime,
          specialInstructions: specialInstructions || '',
          pricing: {
            basePrice: service.price,
            totalAmount: service.price,
          },
          location,
          payment: { paymentMethod },
        },
      ],
      { session }
    );

    if (paymentMethod !== 'cash') {
      order = await razorpay.orders.create({
        amount: service.price * 100,
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
    throw new ApiError(500, 'Booking creation failed, please try again');
  }
});

const getBookingsHistory = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { user: req.user._id };
  if (status) {
    filter.status = status;
  }
  const bookings = await Booking.find(filter).populate('service');
  if (!bookings || bookings.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, { bookings: [] }, 'No bookings found'));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { bookings }, 'Bookings retrieved'));
});

const getAvailableBookings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const serviceRequest = await ServiceRequest.findOne({ user: userId });
  if (!serviceRequest) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, 'Service request not found'));
  }
  return res
    .status(200)
    .json(
      new ApiResponse(200, { serviceRequest }, 'Service request retrieved')
    );
});

export { createBooking, getBookingsHistory, getAvailableBookings };
