import { Router } from 'express';
import {
  getPincodeFromCoordinates,
  getAddressFromCoordinates,
} from '../controllers/location.controller.js';
// GET /get-address route

import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter - 100 requests per 15 minutes
const geocodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Validation rules
const coordinateValidation = [
  body('latitude')
    .notEmpty()
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .notEmpty()
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
];

// Route
router.post(
  '/get-pincode',
  geocodeLimiter,
  coordinateValidation,
  validate,
  getPincodeFromCoordinates
);
router.get('/get-address', geocodeLimiter, getAddressFromCoordinates);

export default router;

// ============================================
// ENVIRONMENT VARIABLES (.env)
// ============================================

/*
# Google Geocoding API
GOOGLE_GEOCODING_API_KEY=your_google_api_key_here

# Geocoding Cache
GEOCODE_CACHE_ENABLED=true

# Node Environment
NODE_ENV=production
*/

// ============================================
// PACKAGE INSTALLATION
// ============================================

/*
npm install express-validator node-cache express-rate-limit axios
*/

// ============================================
// REGISTER ROUTE IN app.js
// ============================================

/*
import locationRoutes from './routes/location.routes.js';
app.use('/api/v1/location', locationRoutes);
*/

// ============================================
// API USAGE EXAMPLE
// ============================================

/*

POST /api/v1/location/get-pincode
Content-Type: application/json

{
  "latitude": 21.1458,
  "longitude": 79.0882
}

// Success Response:
{
  "success": true,
  "message": "Pincode retrieved successfully",
  "data": {
    "pincode": "440001",
    "area": "Civil Lines",
    "city": "Nagpur",
    "district": "Nagpur",
    "state": "Maharashtra",
    "stateCode": "MH",
    "country": "India",
    "countryCode": "IN",
    "fullAddress": "Civil Lines, Nagpur, Maharashtra 440001, India",
    "placeId": "ChIJ...",
    "coordinates": {
      "latitude": 21.1458,
      "longitude": 79.0882
    },
    "accuracy": "ROOFTOP",
    "fromCache": false
  }
}

// Error Response (Invalid Coordinates):
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "latitude",
      "message": "Latitude must be between -90 and 90"
    }
  ]
}

// Error Response (No Pincode Found):
{
  "success": false,
  "message": "Pincode not available for this location",
  "statusCode": 404
}

*/

// ============================================
// FRONTEND USAGE
// ============================================

/*

// JavaScript/React Example
const getPincode = async (latitude, longitude) => {
  try {
    const response = await fetch('http://localhost:3000/api/v1/location/get-pincode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ latitude, longitude }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('Pincode:', data.data.pincode);
      console.log('City:', data.data.city);
      console.log('Full Address:', data.data.fullAddress);
      return data.data;
    } else {
      console.error('Error:', data.message);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
};

// Get current location and fetch pincode
navigator.geolocation.getCurrentPosition(
  async (position) => {
    const result = await getPincode(
      position.coords.latitude,
      position.coords.longitude
    );
    console.log(result);
  },
  (error) => {
    console.error('Geolocation error:', error);
  }
);

*/
