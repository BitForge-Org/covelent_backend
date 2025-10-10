// areaMapService.js
// Core logic for fetching, grouping, and organizing areas/subareas as in city-area.js
// This will be imported and used by locationImportService

import axios from 'axios';

// You can move/adjust these configs as needed
const CITY_CONFIG = {
  Pune: {
    ranges: [
      { start: 411001, end: 411062 },
      { start: 412101, end: 412115 },
      { start: 410501, end: 410510 },
      { start: 412201, end: 412216 },
    ],
    centerCoords: [18.5204, 73.8567],
    zoomLevel: 11,
  },
  Mumbai: {
    ranges: [
      { start: 400001, end: 400104 },
      { start: 421001, end: 421306 },
    ],
    centerCoords: [19.076, 72.8777],
    zoomLevel: 11,
  },
};

const CONFIG = {
  batchSize: 30, // Increased for faster processing
  requestTimeout: 10000,
  batchDelay: 300,
  maxRetries: 3,
  retryDelay: 2000,
};

function log(message, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', progress: '🔄' };
  const icon = icons[type] || icons.info;
  // eslint-disable-next-line no-console
  console.log(`${icon} ${message}`);
}

// --- API 1: INDIA POST API ---
async function fetchFromIndiaPost(pincode) {
  try {
    log(`Fetching India Post data for pincode: ${pincode}`, 'progress');
    const url = `https://api.postalpincode.in/pincode/${pincode}`;
    const resp = await axios.get(url, { timeout: CONFIG.requestTimeout });
    const json = resp.data;
    if (json[0]?.Status === 'Success' && json[0].PostOffice) {
      return {
        postOffices: json[0].PostOffice.map((po) => ({
          name: po.Name,
          branchType: po.BranchType,
          deliveryStatus: po.DeliveryStatus,
          district: po.District,
          state: po.State,
          division: po.Division,
          region: po.Region,
          latitude: po.Latitude ? parseFloat(po.Latitude) : null,
          longitude: po.Longitude ? parseFloat(po.Longitude) : null,
        })),
      };
    }
    log(`No data found for pincode: ${pincode}`, 'error');
    return null;
  } catch (err) {
    log(`Error fetching India Post for ${pincode}: ${err.message}`, 'error');
    return null;
  }
}

// --- API 2: NOMINATIM ---
async function geocodeWithNominatim(locationName, city) {
  try {
    log(`Geocoding ${locationName}, ${city}`, 'progress');
    const query = encodeURIComponent(`${locationName}, ${city}, India`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'ServiceAreaMapper/1.0' },
      timeout: CONFIG.requestTimeout,
    });
    if (Array.isArray(resp.data) && resp.data.length > 0) {
      return {
        latitude: parseFloat(resp.data[0].lat),
        longitude: parseFloat(resp.data[0].lon),
      };
    }
    log(`No geocode found for ${locationName}, ${city}`, 'error');
    return null;
  } catch (err) {
    log(`Error geocoding ${locationName}, ${city}: ${err.message}`, 'error');
    return null;
  }
}

// --- Combined Data Fetching ---
async function fetchPincodeData(
  pincode,
  cityName,
  retries = CONFIG.maxRetries
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    log(
      `Fetching data for pincode ${pincode} (attempt ${attempt + 1})`,
      'info'
    );
    try {
      const indiaPostData = await fetchFromIndiaPost(pincode);
      if (!indiaPostData) {
        if (attempt < retries) {
          log(`Retrying pincode ${pincode}...`, 'progress');
          await new Promise((r) => setTimeout(r, CONFIG.retryDelay));
          continue;
        }
        log(`No data found after retries for pincode ${pincode}`, 'error');
        return { pincode, found: false };
      }
      const enrichedPostOffices = [];
      for (const po of indiaPostData.postOffices) {
        let coords = null;
        if (po.latitude && po.longitude) {
          coords = [po.latitude, po.longitude];
        } else {
          const geocoded = await geocodeWithNominatim(po.name, cityName);
          if (geocoded) {
            coords = [geocoded.latitude, geocoded.longitude];
            await new Promise((r) => setTimeout(r, 1000)); // Nominatim rate limit
          }
        }
        enrichedPostOffices.push({
          name: po.name,
          branchType: po.branchType,
          deliveryStatus: po.deliveryStatus,
          district: po.district,
          state: po.state,
          division: po.division,
          region: po.region,
          coordinates: coords,
        });
      }
      log(`Fetched and enriched data for pincode ${pincode}`, 'success');
      return {
        pincode,
        found: true,
        mainArea: indiaPostData.postOffices[0]?.district || cityName,
        district: indiaPostData.postOffices[0]?.district,
        state: indiaPostData.postOffices[0]?.state,
        postOffices: enrichedPostOffices,
      };
    } catch (err) {
      if (attempt === retries) {
        log(
          `Failed to fetch data for pincode ${pincode} after ${retries + 1} attempts`,
          'error'
        );
        return { pincode, found: false };
      }
    }
  }
  return { pincode, found: false };
}

async function fetchPincodesInBatches(pincodes, cityName) {
  const results = [];
  const total = pincodes.length;
  log(`Fetching ${total} pincodes in batches...`, 'progress');
  for (let i = 0; i < total; i += CONFIG.batchSize) {
    const batch = pincodes.slice(i, i + CONFIG.batchSize);
    log(
      `Processing batch ${i / CONFIG.batchSize + 1} (${batch.length} pincodes)`,
      'info'
    );
    const batchResults = await Promise.all(
      batch.map((pin) => fetchPincodeData(pin, cityName))
    );
    results.push(...batchResults);
    if (i + CONFIG.batchSize < total) {
      log(`Waiting ${CONFIG.batchDelay}ms before next batch...`, 'progress');
      await new Promise((r) => setTimeout(r, CONFIG.batchDelay));
    }
  }
  log(`Completed fetching all pincodes.`, 'success');
  return results;
}

// --- Service Area Mapping for Pune ---
// This mapping is derived from output.json and should be expanded as needed
const PINCODE_TO_SERVICE_AREA = {
  // Central Pune
  411001: 'Central Pune',
  411002: 'Central Pune',
  411003: 'Central Pune',
  411004: 'Central Pune',
  411005: 'Central Pune',
  411006: 'Central Pune',
  411007: 'Central Pune',
  // North Pune
  411008: 'North Pune',
  411009: 'North Pune',
  411011: 'North Pune',
  411012: 'North Pune',
  411013: 'North Pune',
  411014: 'North Pune',
  411015: 'North Pune',
  411016: 'North Pune',
  411017: 'North Pune',
  411018: 'North Pune',
  411019: 'North Pune',
  // East Pune
  411020: 'East Pune',
  411021: 'East Pune',
  411022: 'East Pune',
  411023: 'East Pune',
  411024: 'East Pune',
  411025: 'East Pune',
  411026: 'East Pune',
  411027: 'East Pune',
  411028: 'East Pune',
  411030: 'East Pune',
  411031: 'East Pune',
  411032: 'East Pune',
  411033: 'East Pune',
  411034: 'East Pune',
  411035: 'East Pune',
  411036: 'East Pune',
  411037: 'East Pune',
  411038: 'East Pune',
  411039: 'East Pune',
  // South Pune
  411040: 'South Pune',
  411041: 'South Pune',
  411042: 'South Pune',
  411043: 'South Pune',
  411044: 'South Pune',
  411045: 'South Pune',
  411046: 'South Pune',
  411047: 'South Pune',
  411048: 'South Pune',
  // West Pune
  411051: 'West Pune',
  411052: 'West Pune',
  411057: 'West Pune',
  411058: 'West Pune',
  411060: 'West Pune',
  411061: 'West Pune',
  411062: 'West Pune',
  // Pimpri-Chinchwad
  412101: 'Pimpri-Chinchwad',
  412102: 'Pimpri-Chinchwad',
  412103: 'Pimpri-Chinchwad',
  412104: 'Pimpri-Chinchwad',
  412105: 'Pimpri-Chinchwad',
  412106: 'Pimpri-Chinchwad',
  412107: 'Pimpri-Chinchwad',
  412108: 'Pimpri-Chinchwad',
  412109: 'Pimpri-Chinchwad',
  412110: 'Pimpri-Chinchwad',
  412112: 'Pimpri-Chinchwad',
  412115: 'Pimpri-Chinchwad',
};

function organizeAreas(pincodeData, cityName) {
  log(`Organizing areas and subareas...`, 'progress');
  // For Pune, use PINCODE_TO_SERVICE_AREA mapping
  let useServiceAreaMap = cityName === 'Pune';
  const mainAreas = new Map();
  pincodeData.forEach((data) => {
    if (!data.found) return;
    let mainAreaName;
    if (useServiceAreaMap && PINCODE_TO_SERVICE_AREA[data.pincode]) {
      mainAreaName = PINCODE_TO_SERVICE_AREA[data.pincode];
    } else {
      mainAreaName = data.mainArea;
    }
    if (!mainAreas.has(mainAreaName)) {
      mainAreas.set(mainAreaName, {
        areaName: mainAreaName,
        pincodes: new Set(),
        subAreas: [],
        coordinates: [],
        totalLocalities: 0,
        geometry: {},
        coverage: {},
        metadata: {},
      });
    }
    const area = mainAreas.get(mainAreaName);
    area.pincodes.add(data.pincode);
    data.postOffices.forEach((po) => {
      // Each subarea is a locality with its pincode
      if (po.name) {
        area.subAreas.push({
          name: po.name,
          pincode: data.pincode,
          branchType: po.branchType,
          deliveryStatus: po.deliveryStatus,
          coordinates: po.coordinates,
          district: po.district,
          state: po.state,
          division: po.division,
          region: po.region,
        });
        area.totalLocalities++;
      }
      if (po.coordinates && po.coordinates.length === 2) {
        area.coordinates.push(po.coordinates);
      }
    });
  });
  // Calculate centroids and finalize
  for (const area of mainAreas.values()) {
    area.pincodes = Array.from(area.pincodes); // ensure unique
    if (area.coordinates.length > 0) {
      const avgLat =
        area.coordinates.reduce((sum, c) => sum + c[0], 0) /
        area.coordinates.length;
      const avgLng =
        area.coordinates.reduce((sum, c) => sum + c[1], 0) /
        area.coordinates.length;
      area.geometry.centroid = [avgLat, avgLng];
    }
    area.coverage = { isActive: true, serviceTypes: ['standard', 'express'] };
    // Optionally deduplicate subAreas by name+pincode
    const seen = new Set();
    area.subAreas = area.subAreas.filter((sa) => {
      const key = sa.name + '-' + sa.pincode;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    log(
      `Area: ${area.areaName} | Unique pincodes: ${area.pincodes.length} | Subareas: ${area.subAreas.length}`,
      'info'
    );
  }
  return Array.from(mainAreas.values());
}

// --- Main Generation ---
export async function generateAreaMap(cityName) {
  log(`Starting area map generation for city: ${cityName}`, 'info');
  const cityConfig = CITY_CONFIG[cityName];
  if (!cityConfig) throw new Error('City config not found');
  const pincodes = [];
  cityConfig.ranges.forEach((range) => {
    for (let p = range.start; p <= range.end; p++) {
      pincodes.push(p);
    }
  });
  log(`Total pincodes to process: ${pincodes.length}`, 'info');
  const results = await fetchPincodesInBatches(pincodes, cityName);
  const validResults = results.filter((r) => r.found);
  log(`Valid pincodes found: ${validResults.length}`, 'success');
  const areas = organizeAreas(validResults, cityName);
  log(`Area map generation complete for city: ${cityName}`, 'success');
  return {
    city: cityName,
    centerCoords: cityConfig.centerCoords,
    zoomLevel: cityConfig.zoomLevel,
    areas,
    summary: {
      totalMainAreas: areas.length,
      totalSubAreas: areas.reduce((sum, a) => sum + a.totalLocalities, 0),
      totalPincodes: validResults.length,
    },
  };
}
