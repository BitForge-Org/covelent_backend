import { URL } from 'url';
// src/scripts/fillCoordinatesWorker.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Worker } from 'worker_threads';
import Area from '../models/area.model.js';
import City from '../models/city.model.js';
import SubArea from '../models/subarea.model.js';
import Pincode from '../models/pincode.model.js';
import { DB_NAME } from '../constants.js';
import logger from '../utils/logger.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI + DB_NAME;
const CITY_NAME = 'Nagpur'; // replace with your city
const CONCURRENCY = 5; // Number of workers

const nagpurPincodes = {
  dhantoli: '440012',
  burdi: '440012', // Sitabuldi
  dharampeth: '440010',
  'laxmi nagar': '440022',
  jaripatka: '440014',
  khamla: '440025',
  'medical square': '440009',
  sonegaon: '440005',
};

await mongoose.connect(MONGO_URI, {});
logger.info('✅ Connected to MongoDB');

async function geocodePincodes(cityId) {
  const pincodes = await Pincode.find({ cityId });
  const pincodeCoordMap = new Map();

  logger.info(`⏳ Geocoding ${pincodes.length} pincodes...`);

  for (const pin of pincodes) {
    if (
      pin.coordinates.coordinates[0] !== 0 ||
      pin.coordinates.coordinates[1] !== 0
    ) {
      pincodeCoordMap.set(pin.pincode, pin.coordinates.coordinates);
      continue;
    }

    // Worker thread for geocoding pincode
    const coords = await runWorker({ name: pin.pincode, city: CITY_NAME });
    if (coords) {
      const lngLat = [coords[1], coords[0]];
      pin.coordinates.coordinates = lngLat;
      await pin.save();
      pincodeCoordMap.set(pin.pincode, lngLat);
      logger.info(`✅ Pincode ${pin.pincode} -> [${coords[0]}, ${coords[1]}]`);
    } else {
      logger.info(`⚠️ Could not geocode pincode ${pin.pincode}`);
    }
  }
  return pincodeCoordMap;
}

async function geocodeSubAreas(subAreas, pincodeCoordMap) {
  logger.info(
    `⏳ Geocoding ${subAreas.length} SubAreas using ${CONCURRENCY} workers...`
  );

  let index = 0;
  async function next() {
    if (index >= subAreas.length) return;
    const sub = subAreas[index++];

    // Fallback from pincode
    if (
      sub.coordinates.coordinates[0] === 0 &&
      sub.coordinates.coordinates[1] === 0
    ) {
      const fallback = pincodeCoordMap.get(sub.pincode);
      if (fallback) sub.coordinates.coordinates = fallback;
    }

    // Special handling for Nagpur areas to ensure correct pincode is saved
    const cleanName = sub.name.toLowerCase().trim();
    if (CITY_NAME === 'Nagpur' && nagpurPincodes[cleanName]) {
      const distinctPin = nagpurPincodes[cleanName];
      if (sub.pincode !== Number(distinctPin)) {
        sub.pincode = distinctPin;
        await sub.save();
        logger.info(`📍 Updated Pincode for ${sub.name} -> ${distinctPin}`);
      }
    }

    // Geocode by name
    const coords = await runWorker({ name: sub.name, city: CITY_NAME });
    if (coords) {
      sub.coordinates.coordinates = [coords[1], coords[0]];
      await sub.save();
      logger.info(`✅ SubArea ${sub.name} -> [${coords[0]}, ${coords[1]}]`);
    } else {
      logger.info(`⚠️ Could not geocode SubArea ${sub.name}`);
    }
    return next(); // call next task
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(next());
  await Promise.all(workers);
}

// Function to run worker thread
function runWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workerGeocode.js', import.meta.url), {
      workerData: data,
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

// ... existing imports

async function main() {
  try {
    const city = await City.findOne({ name: CITY_NAME });
    if (!city) {
      throw new Error(`City '${CITY_NAME}' not found in database.`);
    }
    logger.info(`✅ Found City: ${CITY_NAME} (${city._id})`);

    // Filter Pincodes by City
    const pincodeCoordMapResolved = await geocodePincodes(city._id);

    const areas = await Area.find({ cityId: city._id });
    for (const area of areas) {
      const pin = area.pincodes[0];
      const coords = pincodeCoordMapResolved.get(pin);
      if (coords) {
        area.centroid.coordinates = coords;
        await area.save();
      }
    }

    const subAreas = await SubArea.find({ cityId: city._id });
    await geocodeSubAreas(subAreas, pincodeCoordMapResolved);

    logger.info('✅ All coordinates updated!');
    process.exit(0);
// ...
  } catch (err) {
    logger.error('❌ Error:', err);
    process.exit(1);
  }
}

await main();
