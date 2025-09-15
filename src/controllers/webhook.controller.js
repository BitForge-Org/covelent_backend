import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Booking } from '../models/booking.model.js';
import crypto from 'crypto';
import razorpay from '../utils/razorpay.js';
import logger from '../utils/logger.js';

// Webhook handler for Razorpay events
const handleRazorpayWebhook = asyncHandler(async (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_KEY_SECRET;

    if (!webhookSecret) {
      throw new ApiError(500, 'Webhook secret not configured');
    }

    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new ApiError(400, 'Invalid webhook signature: ' + signature);
    }

    const event = req.body;

    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;

      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;

      case 'order.paid':
        await handleOrderPaid(event.payload.order.entity);
        break;

      default:
        logger.warn(`Unhandled event type: ${event.event}`);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Webhook processed successfully'));
  } catch (error) {
    logger.error('Webhook processing error:', error);
    throw new ApiError(500, 'Webhook processing failed');
  }
});

// Handle successful payment capture
const handlePaymentCaptured = async (payment) => {
  try {
    const booking = await Booking.findOne({
      'payment.orderId': payment.order_id,
    });

    if (!booking) {
      logger.error(`Booking not found for order ID: ${payment.order_id}`);
      return;
    }

    // Update booking with payment details
    booking.payment.paymentId = payment.id;
    booking.payment.paymentStatus = 'completed';
    booking.payment.paidAmount = payment.amount / 100; // Convert paise to rupees
    booking.payment.paymentDate = new Date();
    booking.payment.paymentMethod = payment.method;

    // Update booking status to confirmed if payment is successful
    if (booking.bookingStatus === 'pending') {
      booking.bookingStatus = 'confirmed';
    }

    await booking.save();

    logger.info(`Payment captured for booking: ${booking._id}`);

    // TODO: Send notification to user and provider
    // await sendBookingConfirmationNotification(booking);
  } catch (error) {
    logger.error('Error handling payment captured:', error);
    throw error;
  }
};

// Handle failed payment
const handlePaymentFailed = async (payment) => {
  try {
    const booking = await Booking.findOne({
      'payment.orderId': payment.order_id,
    });

    if (!booking) {
      logger.error(`Booking not found for order ID: ${payment.order_id}`);
      return;
    }

    // Update payment status
    booking.payment.paymentId = payment.id;
    booking.payment.paymentStatus = 'failed';
    booking.payment.failureReason =
      payment.error_description || 'Payment failed';

    // Update booking status to cancelled if payment failed
    if (booking.bookingStatus === 'pending') {
      booking.bookingStatus = 'cancelled';
      booking.cancellationReason = 'Payment failed';
      booking.cancelledAt = new Date();
    }

    await booking.save();

    logger.info(`Payment failed for booking: ${booking._id}`);

    // TODO: Send notification to user about payment failure
    // await sendPaymentFailureNotification(booking);
  } catch (error) {
    logger.error('Error handling payment failed:', error);
    throw error;
  }
};

// Handle order paid event
const handleOrderPaid = async (order) => {
  try {
    const booking = await Booking.findOne({
      'payment.orderId': order.id,
    });

    if (!booking) {
      logger.error(`Booking not found for order ID: ${order.id}`);
      return;
    }

    // Update order status
    booking.payment.orderStatus = order.status;
    booking.payment.paidAmount = order.amount_paid / 100; // Convert paise to rupees

    await booking.save();

    logger.info(`Order paid event processed for booking: ${booking._id}`);
  } catch (error) {
    logger.error('Error handling order paid:', error);
    throw error;
  }
};

// Verify payment manually (for client-side verification)
const verifyPayment = asyncHandler(async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new ApiError(
        400,
        'Missing required payment verification parameters'
      );
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      throw new ApiError(400, 'Invalid payment signature');
    }

    // Find and update booking
    const booking = await Booking.findOne({
      'payment.orderId': razorpay_order_id,
    }).populate('service');

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    // Update booking with payment details
    booking.payment.paymentId = razorpay_payment_id;
    booking.payment.paymentStatus = 'completed';
    booking.payment.paidAmount = payment.amount / 100;
    booking.payment.paymentDate = new Date();
    booking.payment.paymentMethod = payment.method;

    // Update booking status
    if (booking.bookingStatus === 'pending') {
      booking.bookingStatus = 'confirmed';
    }

    await booking.save();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { booking },
          'Payment verified and booking confirmed successfully'
        )
      );
  } catch (error) {
    logger.error('Payment verification error:', error);
    throw new ApiError(500, 'Payment verification failed');
  }
});

// Get payment status for a booking
const getPaymentStatus = asyncHandler(async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId).select(
      'payment bookingStatus'
    );

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    // Check if user owns this booking
    if (booking.user.toString() !== req.user._id.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          paymentStatus: booking.payment.paymentStatus,
          bookingStatus: booking.bookingStatus,
          orderId: booking.payment.orderId,
          paymentId: booking.payment.paymentId,
          paidAmount: booking.payment.paidAmount,
        },
        'Payment status retrieved successfully'
      )
    );
  } catch (error) {
    logger.error('Get payment status error:', error);
    throw new ApiError(500, 'Failed to retrieve payment status');
  }
});

export { handleRazorpayWebhook, verifyPayment, getPaymentStatus };
