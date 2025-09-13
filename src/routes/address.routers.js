import { Router } from 'express';
import {
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  getAddressById,
} from '../controllers/address.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

// Add a new address
router.post('/', verifyJWT, addAddress);

// Get all addresses for logged-in user
router.get('/', verifyJWT, getAddresses);

// Update an existing address
router.put('/:id', verifyJWT, updateAddress);

// Delete an address
router.delete('/:id', verifyJWT, deleteAddress);

// Get a single address by ID
router.get('/:id', verifyJWT, getAddressById);

export default router;
