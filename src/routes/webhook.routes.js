import { Router } from 'express';
import {
  verifyPayment,
  getPaymentStatus,
  syncPendingPaymentsWithRazorpay,
} from '../controllers/webhook.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import logger from '../utils/logger.js';

const router = Router();

// Webhook endpoint - no authentication required for Razorpay webhooks
// Razorpay webhook endpoint - log 404 errors
router.post('/razorpay', (req, res) => {
  // Log the error for debugging
  logger.error(
    '[Webhook] 404: /api/v1/webhook/razorpay endpoint not implemented'
  );
  res.status(404).json({
    success: false,
    message: 'Webhook endpoint not implemented',
    error: '404 Not Found',
  });
});

// Payment verification endpoint - requires authentication
router.post('/verify-payment', verifyJWT, verifyPayment);

// Get payment status - requires authentication
router.get('/payment-status/:bookingId', verifyJWT, getPaymentStatus);

// Endpoint to manually trigger sync of pending payments with Razorpay
router.post('/sync-pending-payments', async (req, res) => {
  try {
    await syncPendingPaymentsWithRazorpay();
    res
      .status(200)
      .json({ success: true, message: 'Pending payments sync triggered.' });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: 'Sync failed.', error: err?.message });
  }
});

export default router;
