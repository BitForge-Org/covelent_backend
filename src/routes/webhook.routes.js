import { Router } from 'express';
import {
  handleRazorpayWebhook,
  verifyPayment,
  getPaymentStatus,
} from '../controllers/webhook.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Webhook endpoint - no authentication required for Razorpay webhooks
router.post('/razorpay', handleRazorpayWebhook);

// Payment verification endpoint - requires authentication
router.post('/verify-payment', verifyJWT, verifyPayment);

// Get payment status - requires authentication
router.get('/payment-status/:bookingId', verifyJWT, getPaymentStatus);

export default router;
