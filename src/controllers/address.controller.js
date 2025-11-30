import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Address } from '../models/address.model.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

//Location
// const getPincodeFromCoordinates = asyncHandler(async (req, res) => {
//   const { latitude, longitude } = req.body;

//   if (!latitude || !longitude) {
//     throw new ApiError(400, 'Latitude and longitude are required');
//   }

//   if (!GOOGLE_API_KEY) {
//     throw new ApiError(500, 'Google API key not configured');
//   }

//   try {
//     const response = await axios.get(
//       'https://maps.googleapis.com/maps/api/geocode/json',
//       {
//         params: {
//           latlng: `${latitude},${longitude}`,
//           key: GOOGLE_API_KEY,
//         },
//       }
//     );

//     if (response.data.status !== 'OK') {
//       throw new ApiError(400, `Geocoding failed: ${response.data.status}`);
//     }

//     const result = response.data.results[0];

//     if (!result) {
//       throw new ApiError(404, 'No address found for these coordinates');
//     }

//     // Extract pincode/postal_code
//     const postalCodeComponent = result.address_components.find((component) =>
//       component.types.includes('postal_code')
//     );

//     if (!postalCodeComponent) {
//       throw new ApiError(404, 'Pincode not found for this location');
//     }

//     // Extract other useful address components
//     const city = result.address_components.find((c) =>
//       c.types.includes('locality')
//     )?.long_name;

//     const state = result.address_components.find((c) =>
//       c.types.includes('administrative_area_level_1')
//     )?.long_name;

//     const area = result.address_components.find(
//       (c) =>
//         c.types.includes('sublocality') ||
//         c.types.includes('sublocality_level_1')
//     )?.long_name;

//     res.status(200).json(
//       new ApiResponse(200, 'Pincode retrieved successfully', {
//         pincode: postalCodeComponent.long_name,
//         fullAddress: result.formatted_address,
//         city: city || '',
//         state: state || '',
//         area: area || '',
//         coordinates: {
//           latitude,
//           longitude,
//         },
//       })
//     );
//   } catch (error) {
//     if (error instanceof ApiError) {
//       throw error;
//     }
//     throw new ApiError(500, 'Failed to get pincode', error);
//   }
// });

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

  // Validate service area for coordinates & pincode using location.controller.js logic
  let serviceability;
  try {
    const locationController = await import('./location.controller.js');
    if (typeof locationController.checkServiceability === 'function') {
      let addressData = { pincode, area: coordinates?.area };
      serviceability =
        await locationController.checkServiceability(addressData);
      if (!serviceability.isServiceable) {
        // Return 400 with clear message and details
        return res.status(400).json(
          new ApiResponse(
            400,
            'Address location is not within a service area',
            {
              serviceability,
            }
          )
        );
      }
    } else {
      logger.error('Serviceability check function not found');
      return res
        .status(500)
        .json(new ApiResponse(500, 'Serviceability check function not found'));
    }
  } catch (err) {
    logger.error('Serviceability check error:', err);
    return res.status(500).json(
      new ApiResponse(500, 'Failed to check service area', {
        error: err?.message || err,
      })
    );
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
  const { isDefault } = req.query;
  let filter = { user: req.user._id };
  if (isDefault === 'true') {
    filter.isDefault = true;
  }
  const addresses = await Address.find(filter).sort({
    createdAt: -1,
  });
  res
    .status(200)
    .json(new ApiResponse(200, addresses, 'Addresses fetched successfully'));
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
        new ApiResponse(200, updatedAddress, 'Address updated successfully')
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
    .json(new ApiResponse(200, deletedAddress, 'Address deleted successfully'));
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
    .json(new ApiResponse(200, address, 'Address fetched successfully'));
});

export {
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  getAddressById,
};
