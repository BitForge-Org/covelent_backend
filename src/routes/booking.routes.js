import { Router } from 'express';
import {
  createBooking,
  getBookingsHistory,
  getAvailableBookings,
} from '../controllers/booking.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Create a new booking (user only)
router.post('/', verifyJWT, createBooking);

// Get booking history for logged-in user
router.get('/history', verifyJWT, getBookingsHistory);

// Get available bookings for provider (approved applications)
router.get('/available', verifyJWT, getAvailableBookings);

export default router;
