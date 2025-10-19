import { Router } from 'express';
import {
  safeCreateBooking,
  safeGetBookingsHistory,
  safeGetAvailableBookings,
  safeAcceptBooking,
  safeGetAcceptedBookings,
  safeRejectBooking,
  safeGetBookingById,
} from '../controllers/booking.controller.js';

import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Create a new booking (user only)
router.post('/', verifyJWT, safeCreateBooking);

// Get booking history for logged-in user
router.get('/history', verifyJWT, safeGetBookingsHistory);

// Get available bookings for provider (approved applications)
router.get('/available', verifyJWT, safeGetAvailableBookings);

// Get accepted bookings/history for provider
router.get('/accepted', verifyJWT, safeGetAcceptedBookings);

// Provider accepts a booking
router.post('/accept', verifyJWT, safeAcceptBooking);

// Provider rejects a booking
router.post('/reject', verifyJWT, safeRejectBooking);

// Get booking by ID
router.get('/:bookingId', verifyJWT, safeGetBookingById);

export default router;
