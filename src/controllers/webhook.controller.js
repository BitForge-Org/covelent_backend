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
    const rawBody = req.body; // Buffer
    logger.info(
      `[Webhook] rawBody for signature verification: ${rawBody ? rawBody.toString('utf8').slice(0, 200) : 'undefined'}`
    );
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new ApiError(400, 'Invalid webhook signature: ' + signature);
    }

    const event = JSON.parse(rawBody.toString());

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
      case 'payment.authorized':
        await handlePaymentAuthorized(event.payload.payment.entity);
        break;
      default:
        logger.warn(`Unhandled event type: ${event.event}`);
    }
    // Handle payment authorized event
    const handlePaymentAuthorized = async (payment) => {
      try {
        logger.info(
          `[Webhook] handlePaymentAuthorized called for order_id: ${payment.order_id}, payment_id: ${payment.id}`
        );
        const booking = await Booking.findOne({
          'payment.orderId': payment.order_id,
        });

        if (!booking) {
          logger.error(
            `[Webhook] Booking not found for order ID: ${payment.order_id}. Payment entity: ${JSON.stringify(payment)}`
          );
          return;
        }

        logger.info(
          `[Webhook] Booking found: ${booking._id}, current payment status: ${booking.payment.paymentStatus}`
        );

        // Update payment status
        booking.payment.paymentId = payment.id;
        booking.payment.paymentStatus = 'authorized';
        booking.payment.paidAmount = payment.amount / 100;
        booking.payment.paymentDate = new Date();
        booking.payment.paymentMethod = payment.method;

        // Update booking status to requested if payment is authorized
        if (
          booking.bookingStatus === 'pending' ||
          booking.bookingStatus === 'booking-requested'
        ) {
          booking.bookingStatus = 'booking-requested';
        }

        await booking.save();

        logger.info(
          `[Webhook] Payment authorized and booking updated: ${booking._id}, new payment status: ${booking.payment.paymentStatus}`
        );
        // TODO: Send notification to user/provider if needed
      } catch (error) {
        logger.error('Error handling payment authorized:', error);
        throw error;
      }
    };

    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Webhook processed successfully'));
  } catch (error) {
    logger.error('Webhook processing error:', error);
    throw new ApiError(500, 'Webhook processing failed');
  }
});

const handlePaymentFailed = async (payment) => {
  try {
    logger.info(
      `[Webhook] handlePaymentFailed called for order_id: ${payment.order_id}, payment_id: ${payment.id}`
    );
    const booking = await Booking.findOne({
      'payment.orderId': payment.order_id,
    });

    if (!booking) {
      logger.error(
        `[Webhook] Booking not found for order ID: ${payment.order_id}. Payment entity: ${JSON.stringify(payment)}`
      );
      return;
    }

    logger.info(
      `[Webhook] Booking found: ${booking._id}, current payment status: ${booking.payment.paymentStatus}`
    );

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

    logger.info(
      `[Webhook] Payment failed and booking updated: ${booking._id}, new payment status: ${booking.payment.paymentStatus}`
    );

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
    logger.info(`[Webhook] handleOrderPaid called for order_id: ${order.id}`);
    const booking = await Booking.findOne({
      'payment.orderId': order.id,
    });

    if (!booking) {
      logger.error(
        `[Webhook] Booking not found for order ID: ${order.id}. Order entity: ${JSON.stringify(order)}`
      );
      return;
    }

    logger.info(
      `[Webhook] Booking found: ${booking._id}, current order status: ${booking.payment.orderStatus}`
    );

    // Update order status
    booking.payment.orderStatus = order.status;
    booking.payment.paidAmount = order.amount_paid / 100; // Convert paise to rupees

    await booking.save();

    logger.info(
      `[Webhook] Order paid and booking updated: ${booking._id}, new order status: ${booking.payment.orderStatus}`
    );
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
      .update(body)
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
      'payment bookingStatus user'
    );

    if (!booking) {
      throw new ApiError(404, 'Booking not found');
    }

    // Check if user owns this booking
    if (!booking.user) {
      logger.error(
        `Booking found but user field is missing. Booking: ${JSON.stringify(booking)}`
      );
      throw new ApiError(500, 'Booking user field is missing');
    }
    if (booking.user.toString() !== req.user._id.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    // Fetch payment status from Razorpay using orderId
    let razorpayOrderStatus = null;
    let razorpayPayments = [];
    let newBookingStatus = booking.bookingStatus;
    try {
      if (booking.payment && booking.payment.orderId) {
        // Fetch order details from Razorpay
        const razorpayOrder = await razorpay.orders.fetch(
          booking.payment.orderId
        );
        razorpayOrderStatus = razorpayOrder.status;
        // Fetch all payments for this order using correct SDK method
        const paymentsResp = await razorpay.payments.all({
          order_id: booking.payment.orderId,
        });
        razorpayPayments = paymentsResp.items || [];

        // Find payments for this booking's orderId
        const relevantPayments = razorpayPayments.filter(
          (p) => p.order_id === booking.payment.orderId
        );
        // Determine status
        if (relevantPayments.some((p) => p.status === 'captured')) {
          newBookingStatus = 'booking-confirmed';
        } else if (relevantPayments.some((p) => p.status === 'authorized')) {
          newBookingStatus = 'booking-requested';
        } else if (
          relevantPayments.some(
            (p) => p.status === 'failed' || p.status === 'refunded'
          )
        ) {
          newBookingStatus = 'booking-cancelled';
        }
        // Optionally update booking in DB if status changed
        if (newBookingStatus !== booking.bookingStatus) {
          logger.info(
            `[PaymentStatus] Updating booking ${booking._id} status from ${booking.bookingStatus} to ${newBookingStatus} based on Razorpay payments.`
          );
          booking.bookingStatus = newBookingStatus;
          await booking.save();
        } else {
          logger.info(
            `[PaymentStatus] Booking ${booking._id} status remains ${booking.bookingStatus}. No change needed.`
          );
        }
      }
    } catch (err) {
      logger.error(
        `Error fetching Razorpay order/payment status: ${err.message}`
      );
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
          razorpayOrderStatus,
          razorpayPayments,
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
