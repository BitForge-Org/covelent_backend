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
  booking, // <-- add main booking controller
  bookingInProgress,
  bookingComplete,
  bookingCancel,
  updateBookingStatus,
} from '../controllers/booking.controller.js';

import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Create a new booking (user only)
router.post('/', verifyJWT, createBooking);

// Get booking history for logged-in user
router.get('/', verifyJWT, booking);
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

// Provider marks booking as in-progress
router.post('/in-progress', verifyJWT, bookingInProgress);

// Provider marks booking as completed
router.post('/complete', verifyJWT, bookingComplete);

// Provider cancels a booking
router.post('/cancel', verifyJWT, bookingCancel);

// Get booking by ID
router.get('/:bookingId', verifyJWT, getBookingById);

// Update booking status (generic)
router.post('/update-status', verifyJWT, updateBookingStatus);

export default router;
