
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import City from '../models/city.model.js';
import Area from '../models/area.model.js';
import { Service } from '../models/service.model.js';
import { DB_NAME } from '../constants.js';
import logger from '../utils/logger.js';

dotenv.config();

// ==========================================
// 🔧 CONFIGURATION SECTION: EDIT THIS
// ==========================================
const CITY_NAME = 'Nagpur';
// ==========================================

const MONGO_URI = process.env.MONGODB_URI + DB_NAME;

async function activateCityInServices() {
  try {
    await mongoose.connect(MONGO_URI, {});
    logger.info('✅ Connected to MongoDB');

    // 1. Find City
    const city = await City.findOne({
      name: { $regex: new RegExp(`^${CITY_NAME}$`, 'i') },
    });
    if (!city) {
      throw new Error(`City '${CITY_NAME}' not found. Please seed it first.`);
    }
    logger.info(`✅ Found City: ${city.name} (${city._id})`);

    // 2. Find All Areas for this City
    const areas = await Area.find({ cityId: city._id });
    const areaIds = areas.map((a) => a._id);
    logger.info(
      `found ${areas.length} Areas for ${city.name} (IDs: ${areaIds.length})`
    );

    if (areaIds.length === 0) {
      logger.warn('⚠️ No areas found for this city. Nothing to activate.');
      process.exit(0);
    }

    // 3. Update All Services
    // We add the City ID to 'serviceableCities'
    // And add ALL Area IDs to 'serviceableAreas'
    const result = await Service.updateMany(
      {}, // Match ALL services
      {
        $addToSet: {
          serviceableCities: city._id,
          serviceableAreas: { $each: areaIds },
        },
      }
    );

    logger.info(
      `✅ Updated ${result.modifiedCount} Services.`
    );
    logger.info(
      `   - Added City: ${city.name}`
    );
    logger.info(
      `   - Added ${areaIds.length} Areas to reachable list.`
    );

    logger.info('🎉 Activation completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Script Error:', error);
    process.exit(1);
  }
}

activateCityInServices();
