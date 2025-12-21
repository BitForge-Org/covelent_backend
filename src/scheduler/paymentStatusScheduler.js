import cron from 'node-cron';
import {
  checkAndUpdatePendingPayments,
  syncFailedBookings,
} from '../controllers/webhook.controller.js';
import logger from '../utils/logger.js';

// Run Razorpay pending status check every 3 hours
cron.schedule('0 */3 * * *', async () => {
  logger.info(`[Scheduler] Running Razorpay payment status check...${new Date()}`);
  await checkAndUpdatePendingPayments();
});

// Run Sync Failed Bookings at the end of every day (Midnight)
cron.schedule('0 0 * * *', async () => {
  logger.info(`[Sync Scheduler] Running failed booking sync...${new Date()}`);
  await syncFailedBookings();
});

logger.info('[Scheduler] Razorpay payment status scheduler started.');
