// src/scripts/fillCoordinatesWorker.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Worker } from 'worker_threads';
import Area from '../models/area.model.js';
import SubArea from '../models/subarea.model.js';
import Pincode from '../models/pincode.model.js';
import { DB_NAME } from '../constants.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI + DB_NAME;
const CITY_NAME = 'Pune'; // replace with your city
const CONCURRENCY = 5; // Number of workers

await mongoose.connect(MONGO_URI, {});
console.log('✅ Connected to MongoDB');

async function geocodePincodes() {
  const pincodes = await Pincode.find({});
  const pincodeCoordMap = new Map();

  console.log(`⏳ Geocoding ${pincodes.length} pincodes...`);

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
      console.log(`✅ Pincode ${pin.pincode} -> [${coords[0]}, ${coords[1]}]`);
    } else {
      console.log(`⚠️ Could not geocode pincode ${pin.pincode}`);
    }
  }
  return pincodeCoordMap;
}

async function geocodeSubAreas(subAreas, pincodeCoordMap) {
  console.log(
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

    // Geocode by name
    const coords = await runWorker({ name: sub.name, city: CITY_NAME });
    if (coords) {
      sub.coordinates.coordinates = [coords[1], coords[0]];
      await sub.save();
      console.log(`✅ SubArea ${sub.name} -> [${coords[0]}, ${coords[1]}]`);
    } else {
      console.log(`⚠️ Could not geocode SubArea ${sub.name}`);
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

async function main() {
  try {
    const pincodeCoordMap = await geocodePincodes();

    const areas = await Area.find({});
    for (const area of areas) {
      const pin = area.pincodes[0];
      const coords = pincodeCoordMap.get(pin);
      if (coords) {
        area.centroid.coordinates = coords;
        await area.save();
      }
    }

    const subAreas = await SubArea.find({});
    await geocodeSubAreas(subAreas, pincodeCoordMap);

    console.log('✅ All coordinates updated!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

await main();
