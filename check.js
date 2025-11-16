import mongoose from 'mongoose';
import logger from './logger.js';

const MONGODB_URI =
  'mongodb+srv://sonawaneteju4:bgx1KVAmM81rOgu3@cluster0.pqpzbne.mongodb.net/';
const DB_NAME = 'covelent'; // replace with your actual DB name

const areaSchema = new mongoose.Schema({}, { collection: 'areas' });
const Area = mongoose.model('Area', areaSchema);

async function checkAreas() {
  try {
    await mongoose.connect(`${MONGODB_URI}${DB_NAME}`);
    logger.log('Connected to MongoDB');
    const areas = await Area.find({});
    logger.log(`Found ${areas.length} areas:`);
    logger.log(areas);
    await mongoose.disconnect();
  } catch (err) {
    logger.error('Error connecting to MongoDB:', err);
  }
}

checkAreas();
