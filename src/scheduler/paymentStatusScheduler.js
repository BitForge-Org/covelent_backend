import cron from 'node-cron';
import { checkAndUpdatePendingPayments } from '../controllers/webhook.controller.js';
import logger from '../utils/logger.js';

// Run every 10 minutes

// Run every 30 minutes
cron.schedule('*/60 * * * *', async () => {
  logger.info('[Scheduler] Running Razorpay payment status check...');
  await checkAndUpdatePendingPayments();
});

logger.info('[Scheduler] Razorpay payment status scheduler started.');
