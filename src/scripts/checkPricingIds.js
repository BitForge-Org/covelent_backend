import mongoose from 'mongoose';
import { Service } from '../models/service.model.js';

async function fixPricingIds() {
  try {
    console.log('🔧 Fixing missing _id fields in pricing options...\n');

    await mongoose.connect(
      'mongodb+srv://sonawaneteju4:bgx1KVAmM81rOgu3@cluster0.pqpzbne.mongodb.net/covelent'
    );
    console.log('✅ Connected to MongoDB\n');

    // Get raw documents
    const services = await Service.find({}).lean();
    console.log(`📦 Found ${services.length} services\n`);
    console.log('='.repeat(70));

    let updatedCount = 0;
    let totalIdsAdded = 0;

    for (const service of services) {
      let needsUpdate = false;

      // Create new pricing options with _ids
      const updatedPricingOptions = service.pricingOptions.map((option) => {
        if (!option._id) {
          needsUpdate = true;
          return {
            _id: new mongoose.Types.ObjectId(),
            label: option.label,
            price: option.price,
            duration: option.duration,
          };
        }
        return option;
      });

      if (needsUpdate) {
        // Direct MongoDB update - bypassing Mongoose document save
        await Service.updateOne(
          { _id: service._id },
          { $set: { pricingOptions: updatedPricingOptions } }
        );

        const idsAdded = updatedPricingOptions.filter(
          (opt) =>
            !service.pricingOptions.find(
              (old) => old._id?.toString() === opt._id.toString()
            )
        ).length;

        totalIdsAdded += idsAdded;
        updatedCount++;

        console.log(`\n✅ Updated: "${service.title}"`);
        updatedPricingOptions.forEach((opt, idx) => {
          const isNew = !service.pricingOptions[idx]?._id;
          console.log(
            `   ${idx + 1}. "${opt.label}" → ${isNew ? '🆕' : '✓'} _id: ${opt._id}`
          );
        });
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n📊 MIGRATION SUMMARY:');
    console.log('='.repeat(70));
    console.log(`Total Services:                    ${services.length}`);
    console.log(`Services Updated:                  ${updatedCount} ✅`);
    console.log(
      `Services Unchanged:                ${services.length - updatedCount} ⏭️`
    );
    console.log(`Total _ids Added:                  ${totalIdsAdded} 🆕`);
    console.log('='.repeat(70));

    if (updatedCount > 0) {
      console.log('\n✨ Migration completed successfully!');
      console.log('\n🔍 Verifying changes...');

      // Verify
      const verifyService = await Service.findOne({
        _id: services[0]._id,
      }).lean();
      const allHaveIds = verifyService.pricingOptions.every((opt) => opt._id);

      if (allHaveIds) {
        console.log(
          '✅ Verification passed - all pricing options now have _ids!'
        );
      } else {
        console.log('⚠️  Verification failed - some _ids may still be missing');
      }
    } else {
      console.log('\n✨ No updates needed!');
    }

    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

fixPricingIds();
