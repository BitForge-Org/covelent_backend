import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Address } from '../models/address.model.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const addAddress = asyncHandler(async (req, res) => {
  const {
    fullName,
    phone,
    houseNo,
    street,
    city,
    state,
    pincode,
    coordinates,
    isDefault,
    addressType,
  } = req.body;

  if (
    !fullName ||
    !phone ||
    !houseNo ||
    !street ||
    !city ||
    !state ||
    !pincode ||
    !addressType
  ) {
    throw new ApiError(400, 'All address fields are required');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (isDefault) {
      // If the new address is set as default, unset previous default addresses
      await Address.updateMany(
        { user: req.user._id, isDefault: true },
        { isDefault: false },
        { session }
      );
    }

    const newAddress = new Address({
      user: req.user._id,
      fullName,
      phone,
      houseNo,
      street,
      city,
      state,
      pincode,
      coordinates,
      isDefault,
      addressType,
    });

    await newAddress.save({ session });
    await session.commitTransaction();
    res
      .status(201)
      .json(new ApiResponse(201, 'Address added successfully', newAddress));
  } catch (error) {
    logger.error('Error adding address:', error);
    await session.abortTransaction();
    throw new ApiError(500, 'Failed to add address', error);
  } finally {
    session.endSession();
  }
});

const getAddresses = asyncHandler(async (req, res) => {
  const addresses = await Address.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  res
    .status(200)
    .json(new ApiResponse(200, 'Addresses fetched successfully', addresses));
});

const updateAddress = asyncHandler(async (req, res) => {
  const addressId = req.params.id;
  const {
    fullName,
    phone,
    houseNo,
    street,
    city,
    state,
    pincode,
    coordinates,
    isDefault,
    addressType,
  } = req.body;

  if (
    !fullName ||
    !phone ||
    !houseNo ||
    !street ||
    !city ||
    !state ||
    !pincode ||
    !addressType
  ) {
    throw new ApiError(400, 'All address fields are required');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (isDefault) {
      // If the updated address is set as default, unset previous default addresses
      await Address.updateMany(
        { user: req.user._id, isDefault: true },
        { isDefault: false },
        { session }
      );
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      {
        fullName,
        phone,
        houseNo,
        street,
        city,
        state,
        pincode,
        coordinates,
        isDefault,
        addressType,
      },
      { new: true, session }
    );

    if (!updatedAddress) {
      throw new ApiError(404, 'Address not found');
    }

    await session.commitTransaction();
    res
      .status(200)
      .json(
        new ApiResponse(200, 'Address updated successfully', updatedAddress)
      );
  } catch (error) {
    await session.abortTransaction();
    throw new ApiError(500, 'Failed to update address', error);
  } finally {
    session.endSession();
  }
});

const deleteAddress = asyncHandler(async (req, res) => {
  const addressId = req.params.id;
  const deletedAddress = await Address.findOneAndDelete({
    _id: addressId,
    user: req.user._id,
  });
  if (!deletedAddress) {
    throw new ApiError(404, 'Address not found or already deleted');
  }
  res
    .status(200)
    .json(new ApiResponse(200, 'Address deleted successfully', deletedAddress));
});

// Additional controller to get a single address by ID
const getAddressById = asyncHandler(async (req, res) => {
  const addressId = req.params.id;
  const address = await Address.findOne({ _id: addressId, user: req.user._id });
  if (!address) {
    throw new ApiError(404, 'Address not found');
  }
  res
    .status(200)
    .json(new ApiResponse(200, 'Address fetched successfully', address));
});

export {
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  getAddressById,
};
