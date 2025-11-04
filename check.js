import mongoose from 'mongoose';

const MONGODB_URI =
  'mongodb+srv://sonawaneteju4:bgx1KVAmM81rOgu3@cluster0.pqpzbne.mongodb.net/';
const DB_NAME = 'covelent'; // replace with your actual DB name

const areaSchema = new mongoose.Schema({}, { collection: 'areas' });
const Area = mongoose.model('Area', areaSchema);

async function checkAreas() {
  try {
    await mongoose.connect(`${MONGODB_URI}${DB_NAME}`);
    console.log('Connected to MongoDB');
    const areas = await Area.find({});
    console.log(`Found ${areas.length} areas:`);
    console.log(areas);
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
  }
}

checkAreas();
