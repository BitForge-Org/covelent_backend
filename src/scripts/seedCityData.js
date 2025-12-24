
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

// Models
import City from '../models/city.model.js';
import Area from '../models/area.model.js';
import SubArea from '../models/subarea.model.js';
import Pincode from '../models/pincode.model.js';
import { DB_NAME } from '../constants.js';
import logger from '../utils/logger.js';

dotenv.config();

// ==========================================
// 🔧 CONFIGURATION SECTION: EDIT THIS
// ==========================================
const CITY_NAME = 'Nagpur';
const STATE_NAME = 'Maharashtra';

// Add your locations here. The script will create/update them and geocode automatically.
const LOCATIONS = [
  { name: 'Dharampeth', pincode: '440010' },
  { name: 'Dhantoli', pincode: '440012' },
  { name: 'Burdi', pincode: '440012' }, // Sitabuldi
  { name: 'Laxmi Nagar', pincode: '440022' },
  { name: 'Jaripatka', pincode: '440014' },
  { name: 'Khamla', pincode: '440025' },
  { name: 'Medical Square', pincode: '440009' },
  { name: 'Sonegaon', pincode: '440005' },
];
// ==========================================

const MONGO_URI = process.env.MONGODB_URI + DB_NAME;

// Helper to run geocode worker
function runWorker(data) {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'workerGeocode.js'
    );
    const worker = new Worker(workerPath, {
      workerData: { ...data, city: CITY_NAME },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

async function seedCityData() {
  try {
    await mongoose.connect(MONGO_URI, {});
    logger.info('✅ Connected to MongoDB');

    // 1. Check/Create City
    let city = await City.findOne({
      name: { $regex: new RegExp(`^${CITY_NAME}$`, 'i') },
    });

    if (city) {
        logger.info(`🧹 Cleaning up existing data for ${city.name} to ensure correct structure...`);
        // Cleanup old data to allow fresh hierarchical creation
        await SubArea.deleteMany({ cityId: city._id });
        await Area.deleteMany({ cityId: city._id });
        // We keep the city itself, or we could recreate it. Let's keep it.
    } else {
      city = await City.create({
        name: CITY_NAME,
        slug: CITY_NAME.toLowerCase().replace(/\s+/g, '-'),
        state: STATE_NAME,
        centerCoordinates: { coordinates: [0, 0] },
      });
      logger.info(`✅ Created City: ${city.name}`);
    }

    // 2. Process Locations as AREAS (not SubAreas)
    logger.info(`⏳ Processing ${LOCATIONS.length} Areas...`);

    for (const loc of LOCATIONS) {
      const pinVal = parseInt(loc.pincode);

      // A. Check/Create Pincode (Master list)
      let pincodeDoc = await Pincode.findOne({ pincode: pinVal, cityId: city._id });
      if (!pincodeDoc) {
        pincodeDoc = await Pincode.create({
          pincode: pinVal,
          cityId: city._id,
          coordinates: { coordinates: [0, 0] },
        });
        logger.info(`   + Created Pincode Master: ${pinVal}`);
      }

      // B. Create AREA
      // Each location provided by user is now an AREA
      const areaName = loc.name;
      let area = await Area.create({
          cityId: city._id,
          name: areaName,
          slug: areaName.toLowerCase().replace(/\s+/g, '-'),
          type: 'locality',
          pincodes: [pinVal], // Assign specific pincode to this Area
          centroid: { coordinates: [0, 0] },
      });
      logger.info(`   + Created Area: ${areaName}`);

      // C. Geocode the Area
      logger.info(`   ⏳ Geocoding Area: ${areaName} (${pinVal})...`);
      try {
        const coords = await runWorker({
          name: areaName,
          pincode: loc.pincode,
        });

        if (coords) {
          const lngLat = [coords[1], coords[0]];
          
          // Update Area Centroid
          area.centroid.coordinates = lngLat;
          await area.save();
          logger.info(`   ✅ Geocoded Area: ${areaName} -> ${lngLat}`);

          // Update Pincode Master Coordinates (if empty)
          if (pincodeDoc.coordinates.coordinates[0] === 0) {
              pincodeDoc.coordinates.coordinates = lngLat;
              await pincodeDoc.save();
          }
        } else {
          logger.warn(`   ⚠️ Could not geocode Area: ${areaName}`);
        }
      } catch (err) {
        logger.error(`   ❌ Geocode Error for ${areaName}: ${err.message}`);
      }
    }

    logger.info('🎉 Data restructuring completed!');
    // Log counts for verification
    const cityCount = await City.countDocuments({ _id: city._id });
    const areaCount = await Area.countDocuments({ cityId: city._id });
    const subAreaCount = await SubArea.countDocuments({ cityId: city._id });
    
    logger.info('📊 Verification Stats:');
    logger.info(`   1. City: ${cityCount}`);
    logger.info(`   2. Areas (with Pincodes): ${areaCount}`);
    logger.info(`   3. SubAreas: ${subAreaCount} (Populate these if you have specific locality lists)`);

    process.exit(0);
  } catch (error) {
    logger.error('❌ Script Error:', error);
    process.exit(1);
  }
}

seedCityData();
