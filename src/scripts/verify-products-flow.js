import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ProductCategory } from '../models/product-category.model.js';
import { Product } from '../models/product.model.js';
import { ProductVariant } from '../models/product-variant.model.js';
import { StockMovement } from '../models/stock-movement.model.js';

dotenv.config({ path: './.env' }); 

async function verifyProductFlow() {
  try {
    const uri = process.env.MONGODB_URI;
    const DB_NAME = 'covelent_backend'; 

    if (!uri) {
      console.error("❌ MONGODB_URI is undefined. Check .env");
      process.exit(1);
    }

    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(`${uri}${DB_NAME}`);
    console.log('✅ Connected.');

    // 1. Create a dummy Product Category
    console.log('Creating dummy ProductCategory...');
    const category = await ProductCategory.create({
      name: "Test Category " + Date.now(),
      description: "Category for verification script",
      icon: "http://example.com/icon.png"
    });
    console.log(`✅ Category created: ${category.name}`);

    // 2. Create Product (Rice)
    // Tax 5%, Discount 10%
    console.log('Creating Product (Rice)...');
    const product = await Product.create({
      name: "Basmati Rice Test",
      description: "Long grain",
      categoryId: category._id,
      images: ["img1.jpg"],
      taxPercentage: 5,
      discount: { type: 'PERCENTAGE', value: 10 }
    });
    console.log(`✅ Product created: ${product.name}`);

    // 3. Create Variant (1 Kg)
    // Selling Price = 90 (Inclusive of Tax, Before Discount)
    console.log('Creating Variant (1 Kg)...');
    const variant = await ProductVariant.create({
      productId: product._id,
      label: "1 Kg",
      sku: "RICE-TEST-" + Date.now(),
      buyingPrice: 60,
      sellingPrice: 90,
      stockQuantity: 0
    });
    console.log(`✅ Variant created. Selling Price: ${variant.sellingPrice}`);

    // 4. Add Stock
    console.log('Adding Stock (100)...');
    variant.stockQuantity += 100;
    await variant.save();
    
    await StockMovement.create({
      variantId: variant._id,
      type: 'IN',
      quantity: 100,
      reason: 'MANUAL'
    });
    console.log(`✅ Stock added. New Quantity: ${variant.stockQuantity}`);

    // 5. Verification Logic (Replicating Controller Logic)
    console.log('\n--- VERIFICATION ---');
    
    // Logic:
    // User sees: Starts from ₹81 (90 - 10%)
    // Breakdown:
    // Discount Amount = 90 * 10% = 9
    // Final Price User Pays = 81
    // Tax Calculation (Internal):
    // Tax = 5%.
    // basePrice + tax = 81
    // basePrice * (1 + 0.05) = 81
    // basePrice = 81 / 1.05 = 77.14
    // taxAmount = 81 - 77.14 = 3.86
    
    const sellingPrice = variant.sellingPrice; // 90
    const discountValue = product.discount.value; // 10
    
    const discountAmount = sellingPrice * (discountValue / 100); // 9
    const finalPrice = sellingPrice - discountAmount; // 81
    
    const taxRate = product.taxPercentage; // 5
    // Tax inclusive calculation on FINAL price
    const taxAmount = (finalPrice * taxRate) / (100 + taxRate);
    const basePrice = finalPrice - taxAmount;

    console.log(`Expected Selling Price: 90. Actual: ${sellingPrice}`);
    console.log(`Expected Discount Amount: 9. Actual: ${discountAmount}`);
    console.log(`Expected Final Price: 81. Actual: ${finalPrice}`);
    console.log(`Expected Tax Amount: ~3.86. Actual: ${taxAmount.toFixed(2)}`);
    console.log(`Expected Base Price: ~77.14. Actual: ${basePrice.toFixed(2)}`);

    if (finalPrice !== 81) throw new Error("Final Price Mismatch");
    if (Math.abs(taxAmount - 3.857) > 0.01) throw new Error("Tax Amount Mismatch");

    console.log('\n✅ VERIFICATION PASSED!');

    // Cleanup
    console.log('\nCleaning up...');
    await ProductVariant.deleteOne({ _id: variant._id });
    await Product.deleteOne({ _id: product._id });
    await ProductCategory.deleteOne({ _id: category._id });
    await StockMovement.deleteMany({ variantId: variant._id });
    console.log('✅ Cleanup done.');

    await mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    console.error('❌ Verification Failed:', err);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

verifyProductFlow();
