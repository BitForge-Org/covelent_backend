import schedule from 'node-schedule';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Booking } from '../models/booking.model.js';
import razorpay from '../utils/razorpay.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

// Scheduler to run syncPendingPaymentsWithRazorpay every hour
// export function scheduleSyncPendingPayments() {
//   schedule.scheduleJob('0 * * * *', async () => {
//     await syncPendingPaymentsWithRazorpay();
//   });
//   logger.info(
//     '[Webhook] Scheduled syncPendingPaymentsWithRazorpay to run every hour.'
//   );
// }
// Sync all pending payments with Razorpay and update booking status
export async function syncPendingPaymentsWithRazorpay() {
  try {
    const pendingBookings = await Booking.find({
      'payment.status': 'pending',
      'payment.paymentId': { $exists: true, $ne: null },
      bookingStatus: { $in: ['booking-requested', 'pending'] },
    });
    for (const booking of pendingBookings) {
      try {
        const paymentId = booking.payment.paymentId;
        const paymentDetails = await razorpay.payments.fetch(paymentId);
        if (
          paymentDetails.status === 'captured' ||
          paymentDetails.status === 'authorized'
        ) {
          booking.payment.status = 'completed';
          booking.bookingStatus = 'booking-confirmed';
          booking.payment.paidAmount = paymentDetails.amount / 100;
          booking.payment.paymentDate = new Date(
            paymentDetails.created_at * 1000
          );
          await booking.save();
          logger.info(
            `[Webhook] Booking ${booking._id} marked as paid via Razorpay sync.`
          );
        } else if (
          paymentDetails.status === 'failed' ||
          paymentDetails.status === 'expired'
        ) {
          booking.payment.status = 'failed';
          booking.bookingStatus = 'booking-cancelled';
          booking.cancelledAt = new Date();
          booking.cancellationReason =
            'Payment failed or expired (Razorpay sync)';
          await booking.save();
          logger.info(
            `[Webhook] Booking ${booking._id} cancelled due to failed/expired payment.`
          );
        } else {
          logger.info(
            `[Webhook] Booking ${booking._id} still pending in Razorpay.`
          );
        }
      } catch (err) {
        logger.error(
          `[Webhook] Razorpay fetch failed for booking ${booking._id}:`,
          err
        );
        // If Razorpay returns BAD_REQUEST_ERROR for paymentId, mark booking as failed/cancelled
        if (err?.error?.code === 'BAD_REQUEST_ERROR') {
          booking.payment.status = 'failed';
          booking.bookingStatus = 'booking-cancelled';
          booking.cancelledAt = new Date();
          booking.cancellationReason =
            'Invalid paymentId (Razorpay BAD_REQUEST_ERROR)';
          await booking.save();
          logger.info(
            `[Webhook] Booking ${booking._id} cancelled due to invalid paymentId.`
          );
        }
      }
    }
  } catch (err) {
    logger.error('[Webhook] syncPendingPaymentsWithRazorpay error:', err);
  }
}

/* ========================================================
   Helper: Update booking payment safely
======================================================== */
async function applyPaymentUpdate(booking, fields) {
  Object.assign(booking.payment, fields);
  await booking.save();
}

/* ========================================================
   Event: payment.authorized
======================================================== */
async function handlePaymentAuthorized(payment) {
  try {
    logger.info(
      `[Webhook] payment.authorized → order=${payment.order_id} pay=${payment.id}`
    );

    const booking = await Booking.findOne({
      'payment.orderId': payment.order_id,
    });
    if (!booking)
      return logger.error(
        `[Webhook] Booking not found for order ${payment.order_id}`
      );

    await applyPaymentUpdate(booking, {
      paymentId: payment.id,
      status: 'completed',
      paymentMethod: payment.method,
      paidAmount: payment.amount / 100,
      paymentDate: new Date(),
    });

    if (['pending', 'booking-requested'].includes(booking.bookingStatus)) {
      booking.bookingStatus = 'booking-requested';
      await booking.save();
    }

    logger.info(`[Webhook] Booking ${booking._id} → AUTHORIZED`);
  } catch (err) {
    logger.error('handlePaymentAuthorized error:', err);
    throw err;
  }
}

/* ========================================================
   Event: payment.captured
======================================================== */
async function handlePaymentCaptured(payment) {
  try {
    logger.info(
      `[Webhook] payment.captured → order=${payment.order_id} pay=${payment.id}`
    );

    const booking = await Booking.findOne({
      'payment.orderId': payment.order_id,
    });
    if (!booking)
      return logger.error(
        `[Webhook] Booking not found for order ${payment.order_id}`
      );

    await applyPaymentUpdate(booking, {
      paymentId: payment.id,
      status: 'completed',
      paymentMethod: payment.method,
      paidAmount: payment.amount / 100,
      paymentDate: new Date(),
    });

    if (booking.bookingStatus === 'pending') {
      booking.bookingStatus = 'booking-confirmed';
      await booking.save();
    }

    logger.info(`[Webhook] Booking ${booking._id} → CAPTURED`);
  } catch (err) {
    logger.error('handlePaymentCaptured error:', err);
    throw err;
  }
}

/* ========================================================
   Event: payment.failed
======================================================== */
async function handlePaymentFailed(payment) {
  try {
    logger.info(
      `[Webhook] payment.failed → order=${payment.order_id} pay=${payment.id}`
    );

    const booking = await Booking.findOne({
      'payment.orderId': payment.order_id,
    });
    if (!booking)
      return logger.error(
        `[Webhook] Booking not found for order ${payment.order_id}`
      );

    await applyPaymentUpdate(booking, {
      paymentId: payment.id,
      status: 'failed',
      failureReason: payment.error_description || 'Payment failed',
      paymentDate: new Date(),
    });

    if (booking.bookingStatus === 'pending') {
      booking.bookingStatus = 'booking-cancelled';
      booking.cancellationReason = 'Payment failed';
      booking.cancelledAt = new Date();
      await booking.save();
    }

    logger.info(`[Webhook] Booking ${booking._id} → FAILED`);
  } catch (err) {
    logger.error('handlePaymentFailed error:', err);
    throw err;
  }
}

/* ========================================================
   Event: order.paid (rare)
======================================================== */
async function handleOrderPaid(order) {
  try {
    logger.info(`[Webhook] order.paid → ${order.id}`);

    const booking = await Booking.findOne({ 'payment.orderId': order.id });
    if (!booking)
      return logger.error(`[Webhook] Booking not found for order ${order.id}`);

    await applyPaymentUpdate(booking, {
      orderStatus: order.status,
      paidAmount: order.amount_paid / 100,
    });

    logger.info(`[Webhook] Booking ${booking._id} → ORDER PAID`);
  } catch (err) {
    logger.error('handleOrderPaid error:', err);
    throw err;
  }
}

/* ========================================================
   MAIN: Razorpay Webhook Handler
======================================================== */
const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new ApiError(500, 'Webhook secret missing');

    const rawBody = req.body; // buffer
    const signature = req.headers['x-razorpay-signature'];
    logger.info(`[Webhook] Headers: ${JSON.stringify(req.headers)}`);
    logger.info(
      `[Webhook] Complete request headers: ${JSON.stringify(req.headers, null, 2)}`
    );
    logger.info(`[Webhook] Raw headers object:`, req.headers);

    logger.info(
      `[Webhook] Raw Body (first 200 chars): ${rawBody.toString().slice(0, 200)}`
    );
    logger.info(`[Webhook] Signature: ${signature}`);
    logger.info(`[Webhook] Headers: ${JSON.stringify(req.headers)}`);
    logger.info(`[Webhook] Secret used: ${secret ? 'YES' : 'NO'}`);
    logger.info(req.headers['x-razorpay-signature']);

    // Verify signature
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (expected !== signature) {
      logger.error('[Webhook] Invalid signature');
      throw new ApiError(400, 'Invalid Razorpay signature');
    }

    const event = JSON.parse(rawBody.toString());

    switch (event.event) {
      case 'payment.authorized':
        await handlePaymentAuthorized(event.payload.payment.entity);
        break;
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
        logger.warn(`[Webhook] Unhandled event → ${event.event}`);
    }

    return res.status(200).json(new ApiResponse(200, {}, 'Webhook OK'));
  } catch (err) {
    logger.error('Webhook processing error:', err);
    throw new ApiError(500, err, 'Webhook failed');
  }
});

/* ========================================================
   verifyPayment (manual verification from frontend)
======================================================== */
const verifyPayment = asyncHandler(async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new ApiError(400, 'Missing required parameters');
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expected !== razorpay_signature) {
      logger.error(
        'verifyPayment: Invalid signature',
        expected,
        razorpay_signature
      );
      throw new ApiError(400, 'Invalid signature');
    }

    const booking = await Booking.findOne({
      'payment.orderId': razorpay_order_id,
    }).populate('service');
    if (!booking) throw new ApiError(404, 'Booking not found');

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    await applyPaymentUpdate(booking, {
      paymentId: razorpay_payment_id,
      status: 'completed',
      paidAmount: payment.amount / 100,
      paymentMethod: payment.method,
      paymentDate: new Date(),
    });

    if (booking.bookingStatus === 'pending') {
      booking.bookingStatus = 'booking-confirmed';
      await booking.save();
    }

    return res
      .status(200)
      .json(new ApiResponse(200, { booking }, 'Payment verified successfully'));
  } catch (err) {
    logger.error('verifyPayment error:', err);
    throw new ApiError(500, 'Payment verification failed');
  }
});

/* ========================================================
   getPaymentStatus — kept exactly as needed, corrected to use payment.status
======================================================== */
const getPaymentStatus = asyncHandler(async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId).select(
      'payment bookingStatus user'
    );
    if (!booking) throw new ApiError(404, 'Booking not found');

    // ownership check
    if (booking.user.toString() !== req.user._id.toString()) {
      throw new ApiError(403, 'Access denied');
    }

    let razorpayOrderStatus = null;
    let razorpayPayments = [];

    try {
      if (booking.payment.orderId) {
        const order = await razorpay.orders.fetch(booking.payment.orderId);
        razorpayOrderStatus = order.status;

        const paymentsResp = await razorpay.payments.all({
          order_id: booking.payment.orderId,
        });
        razorpayPayments = paymentsResp.items || [];

        const relevant = razorpayPayments.filter(
          (p) => p.order_id === booking.payment.orderId
        );

        // Determine booking status
        if (relevant.some((p) => p.status === 'captured')) {
          booking.bookingStatus = 'booking-confirmed';
        } else if (relevant.some((p) => p.status === 'authorized')) {
          booking.bookingStatus = 'booking-requested';
        } else if (
          relevant.some((p) => ['failed', 'refunded'].includes(p.status))
        ) {
          booking.bookingStatus = 'booking-cancelled';
        }

        await booking.save();
      }
    } catch (e) {
      logger.error('Error fetching Razorpay order/payment status:', e.message);
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          paymentStatus: booking.payment.status,
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
  } catch (err) {
    logger.error('getPaymentStatus error:', err);
    throw new ApiError(500, 'Failed to retrieve payment status');
  }
});

/* ========================================================
   EXPORT CONTROLLER
======================================================== */
export { handleRazorpayWebhook, verifyPayment, getPaymentStatus };
