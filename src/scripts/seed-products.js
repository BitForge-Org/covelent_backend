import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ProductCategory } from '../models/product-category.model.js';
import { Product } from '../models/product.model.js';
import { ProductVariant } from '../models/product-variant.model.js';
import { StockMovement } from '../models/stock-movement.model.js';

dotenv.config({ path: './.env' });

const CATEGORIES_DATA = [
    {
        name: "Electronics",
        description: "Gadgets and appliances",
        nounList: ['Smart Watch', 'Bluetooth Speaker', 'Power Bank', 'Charger', 'Headphones', 'Tablet', 'Monitor', 'Keyboard'],
        icon: "https://placehold.co/100x100?text=Electronics"
    },
    {
        name: "Hardware",
        description: "Tools and construction material",
        nounList: ['Hammer', 'Screwdriver Set', 'Drill Machine', 'Wrench', 'Pliers', 'Saw', 'Tape Measure', 'Nails Pack'],
        icon: "https://placehold.co/100x100?text=Hardware"
    },
    {
        name: "Paints",
        description: "Home and exterior paints",
        nounList: ['Wall Paint', 'Primer', 'Varnish', 'Spray Paint', 'Brush Set', 'Roller', 'Thinner', 'Emulsion'],
        icon: "https://placehold.co/100x100?text=Paints"
    },
    {
        name: "Groceries",
        description: "Daily kitchen essentials",
        nounList: ['Basmati Rice', 'Wheat Flour', 'Toor Dal', 'Almonds', 'Cashews', 'Olive Oil', 'Honey', 'Sugar'],
        icon: "https://placehold.co/100x100?text=Groceries"
    }
];

const ADJECTIVES = ['Premium', ' Durable', 'High Quality', 'Pro', 'Classic', 'Standard', 'Ultra', 'Heavy Duty'];

const IMAGES = [
    'https://placehold.co/600x400/orange/white?text=Product',
    'https://placehold.co/600x400/green/white?text=Top+Quality',
    'https://placehold.co/600x400/blue/white?text=Best+Seller'
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function seedProducts() {
    try {
        const uri = process.env.MONGODB_URI;
        const DB_NAME = 'covelent';
        
        if (!uri) {
            console.error("❌ MONGODB_URI is undefined");
            process.exit(1);
        }

        console.log('🌱 Connecting to MongoDB...');
        await mongoose.connect(`${uri}${DB_NAME}`); // using default DB from URI if not specified
        console.log('✅ Connected.');

        // 1. Create Categories Map
        console.log('Creating/Fetching product categories...');
        const categoryMap = {};

        for (const catData of CATEGORIES_DATA) {
            let category = await ProductCategory.findOne({ name: catData.name });
            if (!category) {
                category = await ProductCategory.create({
                    name: catData.name,
                    description: catData.description,
                    icon: catData.icon
                });
                console.log(`+ Created Product Category: ${category.name}`);
            }
            categoryMap[catData.name] = {
                id: category._id,
                nouns: catData.nounList
            };
        }

        console.log('🚀 Starting generation of ~100 products...');

        const products = [];
        const variants = [];
        const stockMovements = [];

        // Distribute 100 products across categories
        for (let i = 0; i < 100; i++) {
            // Pick a random category
            const catKey = randomItem(Object.keys(categoryMap));
            const catData = categoryMap[catKey];
            
            const noun = randomItem(catData.nouns);
            const name = `${randomItem(ADJECTIVES)} ${noun}`;
            
            // Create Product
            const product = new Product({
                name: name,
                description: `Best in class ${noun} for your needs.`,
                categoryId: catData.id,
                images: [randomItem(IMAGES)],
                isFeatured: Math.random() > 0.85,
                isActive: true,
                taxPercentage: randomItem([5, 12, 18, 28]),
                discount: {
                    type: Math.random() > 0.6 ? 'PERCENTAGE' : 'NONE',
                    value: Math.random() > 0.6 ? randomInt(5, 20) : 0
                }
            });
            products.push(product);

            // Create Variants
            const numVariants = randomInt(1, 3);
            for (let j = 0; j < numVariants; j++) {
                let label, skuPrefix;
                
                // Determine Variant Labels based on Category
                if (catKey === 'Groceries' || catKey === 'Paints') {
                    const idx = j % 4;
                    label = ['500g', '1 Kg', '5 Kg', '10 Kg'][idx] || 'Standard';
                    if (catKey === 'Paints') label = ['1 Ltr', '4 Ltr', '10 Ltr', '20 Ltr'][idx];
                } else {
                    const idx = j % 3;
                    label = ['Standard', 'Pro', 'Max'][idx];
                }

                const basePrice = randomInt(100, 5000);
                const sellingPrice = basePrice;
                const stock = randomInt(0, 50);

                const variant = new ProductVariant({
                    productId: product._id,
                    label: label,
                    sku: `${catKey.substring(0,3).toUpperCase()}-${i}-${j}-${randomInt(1000,9999)}`,
                    buyingPrice: Math.floor(sellingPrice * 0.75),
                    sellingPrice: sellingPrice,
                    stockQuantity: stock,
                    isActive: true,
                    lowStockThreshold: 5
                });
                variants.push(variant);

                if (stock > 0) {
                    stockMovements.push({
                        variantId: variant._id,
                        type: 'IN',
                        quantity: stock,
                        reason: 'INITIAL_SEED',
                        createdAt: new Date()
                    });
                }
            }
        }

        console.log('💾 Saving Products...');
        await Product.insertMany(products);
        
        console.log('💾 Saving Variants...');
        await ProductVariant.insertMany(variants);
        
        console.log('💾 Saving Stock Movements...');
        await StockMovement.insertMany(stockMovements);

        console.log(`\n🎉 Successfully seeded:`);
        console.log(`- ${products.length} Products`);
        console.log(`- ${variants.length} Variants`);
        console.log(`- ${stockMovements.length} Stock Movements`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
}

seedProducts();
