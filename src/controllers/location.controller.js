// Utility function to get pincode from coordinates (returns value, not Express response)
export const getPincodeFromLatLng = async (latitude, longitude) => {
  try {
    const { lat, lng } = validateCoordinates(latitude, longitude);
    const geoData = await callGeocodingAPI(lat, lng);
    let addressData;
    if (GEOCODE_PROVIDER === 'google') {
      if (
        geoData.status !== 'OK' ||
        !geoData.results ||
        geoData.results.length === 0
      ) {
        throw new ApiError(404, 'No address found');
      }
      addressData = extractGoogleComponents(geoData.results[0]);
    } else {
      addressData = extractFreeProviderComponents(geoData);
    }
    // Google fallback for pincode
    if (
      !addressData.pincode &&
      GOOGLE_API_KEY &&
      GEOCODE_PROVIDER !== 'google'
    ) {
      try {
        const googleData = await callGoogleGeocodingAPI(lat, lng);
        if (
          googleData.status === 'OK' &&
          googleData.results &&
          googleData.results.length > 0
        ) {
          const googleAddress = extractGoogleComponents(googleData.results[0]);
          if (googleAddress.pincode) {
            addressData.pincode = googleAddress.pincode;
          }
        }
      } catch (err) {
        // Ignore fallback error
      }
    }
    if (!addressData.pincode) {
      throw new ApiError(404, 'No pincode found for provided coordinates');
    }
    return addressData.pincode;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to get pincode from coordinates', error);
  }
};
// GET endpoint for address from lat/lng

import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import axios from 'axios';
import { redisClient } from '../utils/redisClient.js';
import logger from '../utils/logger.js';

import Pincode from '../models/pincode.model.js';

const GEOCODE_CACHE_TTL = 86400;
const GEOCODE_PROVIDER = process.env.GEOCODE_PROVIDER || 'google';
const GOOGLE_API_KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const OPEN_CAGE_KEY = process.env.OPEN_CAGE_API_KEY;
const CACHE_ENABLED = process.env.GEOCODE_CACHE_ENABLED !== 'false';
const REQUEST_TIMEOUT = 10000;

export const getCacheKey = (latitude, longitude) => {
  const lat = parseFloat(latitude).toFixed(6);
  const lng = parseFloat(longitude).toFixed(6);
  return `geocode:${GEOCODE_PROVIDER}:${lat}:${lng}`;
};

export const validateCoordinates = (latitude, longitude) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    throw new ApiError(400, 'Invalid coordinate format');
  }
  if (lat < -90 || lat > 90) {
    throw new ApiError(400, 'Latitude must be between -90 and 90');
  }
  if (lng < -180 || lng > 180) {
    throw new ApiError(400, 'Longitude must be between -180 and 180');
  }

  return { lat, lng };
};

export const callGoogleGeocodingAPI = async (
  latitude,
  longitude,
  retries = 2
) => {
  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          latlng: `${latitude},${longitude}`,
          key: GOOGLE_API_KEY,
          language: 'en',
        },
        timeout: REQUEST_TIMEOUT,
      }
    );
    logger.info('Google Geocoding API response received', {
      latitude,
      longitude,
      provider: GEOCODE_PROVIDER,
      status: response.data,
    });

    return response.data;
  } catch (error) {
    if (retries > 0 && error.code !== 'ENOTFOUND') {
      logger.warn(`Google API retry. Retries left: ${retries}`);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1000));
      return callGoogleGeocodingAPI(latitude, longitude, retries - 1);
    }
    throw error;
  } finally {
    logger.info('Google Geocoding API call completed', {
      latitude,
      longitude,
      provider: GEOCODE_PROVIDER,
      // response: response.data,
    });
  }
};

export const callOpenCageAPI = async (latitude, longitude) => {
  const response = await axios.get(
    'https://api.opencagedata.com/geocode/v1/json',
    {
      params: {
        q: `${latitude},${longitude}`,
        key: OPEN_CAGE_KEY,
        language: 'en',
      },
      timeout: REQUEST_TIMEOUT,
    }
  );
  logger.info('OpenCage API response received', {
    latitude,
    longitude,
    provider: GEOCODE_PROVIDER,
    status: response.data,
  });
  return response.data;
};

export const callNominatimAPI = async (latitude, longitude) => {
  const response = await axios.get(
    'https://nominatim.openstreetmap.org/reverse',
    {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
        addressdetails: 1,
      },
      headers: {
        'User-Agent': 'CovalentBackend/1.0 (contact@yourdomain.com)',
        'Accept-Language': 'en',
      },
      timeout: REQUEST_TIMEOUT,
    }
  );
  return response.data;
};

export const callBigDataCloudAPI = async (latitude, longitude) => {
  const response = await axios.get(
    'https://api.bigdatacloud.net/data/reverse-geocode-client',
    {
      params: {
        latitude,
        longitude,
        localityLanguage: 'en',
      },
      timeout: REQUEST_TIMEOUT,
    }
  );
  return response.data;
};

export const callGeocodingAPI = async (latitude, longitude) => {
  try {
    switch (GEOCODE_PROVIDER) {
      case 'google':
        if (!GOOGLE_API_KEY)
          throw new ApiError(500, 'Google API key not configured');
        return await callGoogleGeocodingAPI(latitude, longitude);
      case 'opencage':
        if (!OPEN_CAGE_KEY)
          throw new ApiError(500, 'OpenCage API key not configured');
        return await callOpenCageAPI(latitude, longitude);
      case 'nominatim':
        return await callNominatimAPI(latitude, longitude);
      case 'bigdatacloud':
        return await callBigDataCloudAPI(latitude, longitude);
      default:
        throw new ApiError(
          500,
          `Unsupported geocode provider: ${GEOCODE_PROVIDER}`
        );
    }
  } catch (error) {
    logger.error('Error in callGeocodingAPI', {
      latitude,
      longitude,
      provider: GEOCODE_PROVIDER,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

export const extractGoogleComponents = (result) => {
  const components = result.address_components;
  const get = (types) =>
    components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ||
    '';
  const getShort = (types) =>
    components.find((c) => types.some((t) => c.types.includes(t)))
      ?.short_name || '';

  return {
    pincode: get(['postal_code']),
    area: get(['sublocality', 'sublocality_level_1', 'sublocality_level_2']),
    city: get(['locality', 'administrative_area_level_2']),
    district: get(['administrative_area_level_2']),
    state: get(['administrative_area_level_1']),
    stateCode: getShort(['administrative_area_level_1']),
    country: get(['country']),
    countryCode: getShort(['country']),
    fullAddress: result.formatted_address,
    placeId: result.place_id,
  };
};

export const extractFreeProviderComponents = (data) => {
  if (GEOCODE_PROVIDER === 'opencage') {
    const comp = data.results[0]?.components || {};
    return {
      pincode: comp.postcode || '',
      area: comp.area || comp._normalized_city || '',
      city: comp.county || comp.town || '',
      district: comp.state_district || comp.county || '',
      state: comp.state || '',
      country: comp.country || '',
      fullAddress: data.results[0]?.formatted || '',
      coordinates: {
        latitude: data.results[0]?.geometry?.lat || null,
        longitude: data.results[0]?.geometry?.lng || null,
      },
      provider: 'opencage',
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };
  }

  if (GEOCODE_PROVIDER === 'nominatim') {
    const addr = data.address || {};
    return {
      pincode: addr.postcode,
      area: addr.suburb || addr.neighbourhood,
      city: addr.city || addr.town,
      district: addr.county,
      state: addr.state,
      country: addr.country,
      fullAddress: data.display_name,
    };
  }

  if (GEOCODE_PROVIDER === 'bigdatacloud') {
    return {
      pincode: data.postcode,
      area: data.locality,
      city: data.city || data.locality,
      district: data.principalSubdivision,
      state: data.principalSubdivision,
      country: data.countryName,
      fullAddress: data.localityInfo?.informative
        ?.map((x) => x.name)
        .join(', '),
    };
  }

  return {};
};

export const checkServiceability = async (addressData) => {
  const { pincode, area } = addressData;

  logger.info('=== SERVICEABILITY CHECK START ===', { pincode, area });

  // Simple check: If pincode exists in DB, it's serviceable
  if (!pincode) {
    logger.info('No pincode provided');
    return {
      isServiceable: false,
      serviceableCity: null,
      serviceableCityId: null,
      serviceableArea: null,
      serviceableAreaId: null,
      matchedPincode: null,
      checkMethod: null,
    };
  }

  logger.info('[Pincode Check] Looking for pincode in database', { pincode });

  const pincodeDoc = await Pincode.findOne({
    pincode: parseInt(pincode),
  })
    .populate('cityId', 'name isActive')
    .populate('areaIds', 'name isServiceable');

  logger.info('[Pincode Check] Database query result', {
    found: !!pincodeDoc,
    pincode: pincodeDoc?.pincode,
    cityName: pincodeDoc?.cityId?.name,
    cityActive: pincodeDoc?.cityId?.isActive,
    areasCount: pincodeDoc?.areaIds?.length || 0,
    areaNames: pincodeDoc?.areaIds?.map((a) => a.name) || [],
  });

  if (!pincodeDoc) {
    logger.info('[Pincode Check] ✗ Pincode NOT found in database');
    return {
      isServiceable: false,
      serviceableCity: null,
      serviceableCityId: null,
      serviceableArea: null,
      serviceableAreaId: null,
      matchedPincode: null,
      checkMethod: null,
    };
  }

  // Pincode exists - it's serviceable!
  let serviceableCity = null;
  let serviceableCityId = null;
  let serviceableArea = null;
  let serviceableAreaId = null;

  if (pincodeDoc.cityId) {
    serviceableCity = pincodeDoc.cityId.name;
    serviceableCityId = pincodeDoc.cityId._id.toString();
  }

  // Try to match area
  if (area && pincodeDoc.areaIds && pincodeDoc.areaIds.length > 0) {
    logger.info('[Pincode Check] Searching for area match', {
      searchingFor: area,
      availableAreas: pincodeDoc.areaIds.map((a) => a.name),
    });

    // Try exact match
    let matchedArea = pincodeDoc.areaIds.find(
      (a) => a.name && a.name.toLowerCase() === area.toLowerCase()
    );

    // Try partial match
    if (!matchedArea) {
      matchedArea = pincodeDoc.areaIds.find(
        (a) =>
          a.name &&
          (a.name.toLowerCase().includes(area.toLowerCase()) ||
            area.toLowerCase().includes(a.name.toLowerCase()))
      );
    }

    if (matchedArea) {
      serviceableArea = matchedArea.name;
      serviceableAreaId = matchedArea._id.toString();
      logger.info('[Pincode Check] ✓ Area matched', {
        area: serviceableArea,
        areaId: serviceableAreaId,
      });
    } else if (pincodeDoc.areaIds.length > 0) {
      // Use first area
      serviceableArea = pincodeDoc.areaIds[0].name;
      serviceableAreaId = pincodeDoc.areaIds[0]._id.toString();
      logger.info('[Pincode Check] Using first area', {
        area: serviceableArea,
        areaId: serviceableAreaId,
      });
    }
  }

  logger.info('[Pincode Check] ✓ SERVICEABLE - Pincode exists', {
    pincode: pincodeDoc.pincode,
    city: serviceableCity,
    cityId: serviceableCityId,
    area: serviceableArea,
    areaId: serviceableAreaId,
  });

  return {
    isServiceable: true,
    serviceableCity,
    serviceableCityId,
    serviceableArea,
    serviceableAreaId,
    matchedPincode: pincodeDoc.pincode,
    checkMethod: 'pincode_exists',
  };
};

export const getPincodeFromCoordinates = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const { lat, lng } = validateCoordinates(latitude, longitude);
  const cacheKey = getCacheKey(lat, lng);

  logger.info('=== REQUEST START ===', {
    lat,
    lng,
    provider: GEOCODE_PROVIDER,
  });

  // Check cache
  if (CACHE_ENABLED) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        logger.info('✓ Served from cache', {
          isServiceable: cachedData.isServiceable,
        });

        const message = cachedData.isServiceable
          ? 'Great! We serve this location'
          : 'Sorry, we do not serve this location yet.';

        return res
          .status(200)
          .json(
            new ApiResponse(200, message, { ...cachedData, fromCache: true })
          );
      }
      logger.info('Cache miss');
    } catch (err) {
      logger.warn('Redis error', { error: err.message });
    }
  }

  try {
    // Get address from geocoding
    logger.info('Calling geocoding API');
    const data = await callGeocodingAPI(lat, lng);
    let addressData;

    if (GEOCODE_PROVIDER === 'google') {
      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        throw new ApiError(404, 'No address found');
      }
      addressData = extractGoogleComponents(data.results[0]);
    } else {
      addressData = extractFreeProviderComponents(data);
    }

    logger.info('✓ Address extracted', {
      pincode: addressData.pincode,
      city: addressData.city,
      area: addressData.area,
    });

    // Google fallback for pincode
    if (
      !addressData.pincode &&
      GOOGLE_API_KEY &&
      GEOCODE_PROVIDER !== 'google'
    ) {
      logger.info('Trying Google fallback for pincode');
      try {
        const googleData = await callGoogleGeocodingAPI(lat, lng);
        if (
          googleData.status === 'OK' &&
          googleData.results &&
          googleData.results.length > 0
        ) {
          const googleAddress = extractGoogleComponents(googleData.results[0]);
          if (googleAddress.pincode) {
            addressData.pincode = googleAddress.pincode;
            logger.info('✓ Google fallback successful', {
              pincode: googleAddress.pincode,
            });
          }
        }
      } catch (err) {
        logger.warn('Google fallback failed', { error: err.message });
      }
    }

    // Check serviceability
    const serviceabilityCheck = await checkServiceability(addressData);

    const responseData = {
      ...addressData,
      coordinates: { latitude: lat, longitude: lng },
      provider: GEOCODE_PROVIDER,
      fromCache: false,
      ...serviceabilityCheck,
    };

    // Cache result
    if (CACHE_ENABLED) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(responseData), {
          EX: GEOCODE_CACHE_TTL,
        });
        logger.info('✓ Result cached');
      } catch (err) {
        logger.warn('Redis write error', { error: err.message });
      }
    }

    // Send response
    const message = serviceabilityCheck.isServiceable
      ? 'Great! We serve this location'
      : 'Sorry, we do not serve this location yet.';

    logger.info('=== RESULT ===', {
      isServiceable: serviceabilityCheck.isServiceable,
      checkMethod: serviceabilityCheck.checkMethod,
    });

    res.status(200).json(new ApiResponse(200, message, responseData));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new ApiError(504, 'Geocoding service timeout');
      }
      if (error.code === 'ENOTFOUND') {
        throw new ApiError(503, 'Unable to reach geocoding service');
      }
      throw new ApiError(500, 'Geocoding service error');
    }
    if (error instanceof ApiError) throw error;
    logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack,
    });
    throw new ApiError(500, 'Failed to retrieve pincode information');
  }
});

export const getAddressFromCoordinates = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.query;
  // Validate coordinates using existing function
  const { lat, lng } = validateCoordinates(latitude, longitude);
  const cacheKey = getCacheKey(lat, lng);

  logger.info('=== GET ADDRESS REQUEST ===', {
    lat,
    lng,
    provider: GEOCODE_PROVIDER,
  });

  // Check cache
  if (CACHE_ENABLED) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        logger.info('✓ Served from cache', {
          address: cachedData.fullAddress,
        });
        return res.status(200).json(
          new ApiResponse(200, 'Address retrieved from cache', {
            ...cachedData,
            fromCache: true,
          })
        );
      }
      logger.info('Cache miss');
    } catch (err) {
      logger.warn('Redis error', { error: err.message });
    }
  }

  try {
    // Get address from geocoding
    logger.info('Calling geocoding API');
    const data = await callGeocodingAPI(lat, lng);
    let addressData;

    if (GEOCODE_PROVIDER === 'google') {
      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        throw new ApiError(404, 'No address found');
      }
      addressData = extractGoogleComponents(data.results[0]);
    } else {
      addressData = extractFreeProviderComponents(data);
    }

    logger.info('✓ Address extracted', {
      fullAddress: addressData.fullAddress,
      city: addressData.city,
      area: addressData.area,
      pincode: addressData.pincode,
    });

    // Google fallback for pincode
    if (
      !addressData.pincode &&
      GOOGLE_API_KEY &&
      GEOCODE_PROVIDER !== 'google'
    ) {
      logger.info('Trying Google fallback for pincode');
      try {
        const googleData = await callGoogleGeocodingAPI(lat, lng);
        if (
          googleData.status === 'OK' &&
          googleData.results &&
          googleData.results.length > 0
        ) {
          const googleAddress = extractGoogleComponents(googleData.results[0]);
          if (googleAddress.pincode) {
            addressData.pincode = googleAddress.pincode;
            logger.info('✓ Google fallback successful', {
              pincode: googleAddress.pincode,
            });
          }
        }
      } catch (err) {
        logger.warn('Google fallback failed', { error: err.message });
      }
    }

    const responseData = {
      ...addressData,
      coordinates: { latitude: lat, longitude: lng },
      provider: GEOCODE_PROVIDER,
      fromCache: false,
    };

    // Cache result
    if (CACHE_ENABLED) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(responseData), {
          EX: GEOCODE_CACHE_TTL,
        });
        logger.info('✓ Result cached');
      } catch (err) {
        logger.warn('Redis write error', { error: err.message });
      }
    }

    res
      .status(200)
      .json(
        new ApiResponse(200, responseData, 'Address retrieved successfully')
      );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new ApiError(504, 'Geocoding service timeout');
      }
      if (error.code === 'ENOTFOUND') {
        throw new ApiError(503, 'Unable to reach geocoding service');
      }
      throw new ApiError(500, 'Geocoding service error');
    }
    if (error instanceof ApiError) throw error;
    logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack,
    });
    throw new ApiError(500, 'Failed to retrieve address information');
  }
});
