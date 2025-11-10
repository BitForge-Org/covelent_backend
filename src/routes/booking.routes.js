import { Router } from 'express';
import {
  createBooking,
  getBookingsHistory,
  getAvailableBookings,
  acceptBooking,
  getAcceptedBookings,
  rejectBooking,
  getBookingById,
  getAllBookings,
} from '../controllers/booking.controller.js';

import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Create a new booking (user only)
router.post('/', verifyJWT, createBooking);

// Get booking history for logged-in user
router.get('/history', verifyJWT, getBookingsHistory);

// Get all bookings for all users (admin/testing)
router.get('/all', getAllBookings);

// Get available bookings for provider (approved applications)
router.get('/available', verifyJWT, getAvailableBookings);

// Get accepted bookings/history for provider
router.get('/accepted', verifyJWT, getAcceptedBookings);

// Provider accepts a booking
router.post('/accept', verifyJWT, acceptBooking);

// Provider rejects a booking
router.post('/reject', verifyJWT, rejectBooking);

// Get booking by ID
router.get('/:bookingId', verifyJWT, getBookingById);

export default router;
