import mongoose from 'mongoose';
import { Service } from '../models/service.model.js';

async function addMissingPricingIds() {
  try {
    await mongoose.connect('mongodb+srv:///covelent');
    // console.log('✅ Connected to MongoDB\n');

    const services = await Service.find({});
    let _updatedCount = 0;

    for (const service of services) {
      let modified = false;

      // Create new array with _ids
      const updatedOptions = service.pricingOptions.map((option) => {
        if (!option._id) {
          modified = true;
          // Create a plain object with _id
          return {
            _id: new mongoose.Types.ObjectId(),
            label: option.label,
            price: option.price,
            duration: option.duration,
          };
        }
        return option;
      });

      if (modified) {
        // Replace the entire pricingOptions array
        service.pricingOptions = updatedOptions;

        // Mark as modified (important for Mongoose to detect changes)
        service.markModified('pricingOptions');

        await service.save();
        _updatedCount++;

        // console.log(`✅ Updated: "${service.title}"`);
        updatedOptions.forEach(() => {
          // console.log('');
        });
        // console.log('');
      }
    }

    // console.log('='.repeat(70));
    // console.log(`\n✨ Complete! Updated ${updatedCount} services.`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (_) {
    // console.error('❌ Error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

addMissingPricingIds();
