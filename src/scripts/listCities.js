
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import City from '../models/city.model.js';
import { DB_NAME } from '../constants.js';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI + DB_NAME;

import SubArea from '../models/subarea.model.js';

async function listCities() {
  try {
    await mongoose.connect(MONGO_URI, {});
    console.log('Connected to DB');
    const cities = await City.find({}, 'name slug');
    console.log('Available Cities:', cities);
    
    const subCount = await SubArea.countDocuments({});
    console.log('Total SubAreas:', subCount);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listCities();
