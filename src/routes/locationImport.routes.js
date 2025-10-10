import express from 'express';
import * as locationImportController from '../controllers/locationImport.controller.js';
// import { authAdmin } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Import city data (admin only)
router.post('/import', locationImportController.importCity);

// Get import status by log id
router.get(
  '/import-status/:importLogId',
  locationImportController.getImportStatus
);

// List all cities
router.get('/cities', locationImportController.getCities);

// Get city by id (with recent imports)
router.get('/cities/:cityId', locationImportController.getCityById);

// List areas by city
router.get('/cities/:cityId/areas', locationImportController.getAreasByCity);

// List sub-areas by area
router.get(
  '/areas/:areaId/subareas',
  locationImportController.getSubAreasByArea
);

// Update area serviceability (admin only)
router.patch(
  '/areas/:areaId/serviceability',
  //   authAdmin,
  locationImportController.updateAreaServiceability
);

// Update sub-area serviceability (admin only)
router.patch(
  '/subareas/:subAreaId/serviceability',
  //   authAdmin,
  locationImportController.updateSubAreaServiceability
);

// Get all areas
router.get('/areas', locationImportController.getAllAreas);

// Get area by id
router.get('/areas/:areaId', locationImportController.getAreaById);

// Get all subareas
router.get('/subareas', locationImportController.getAllSubAreas);

// Get subarea by id
router.get('/subareas/:subAreaId', locationImportController.getSubAreaById);

// Get all pincodes
router.get('/pincodes', locationImportController.getAllPincodes);

// Get pincode by id
router.get('/pincodes/:pincodeId', locationImportController.getPincodeById);

// Bulk update area serviceability (admin only)
router.patch(
  '/areas/bulk-serviceability',
  //   authAdmin,
  locationImportController.bulkUpdateAreaServiceability
);

// Get pincode details
router.get('/pincode/:pincode', locationImportController.getPincodeDetails);

// Search locations (areas, subareas, pincodes)
router.get('/search', locationImportController.searchLocations);

export default router;
