import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Product } from '../models/product.model.js';
import { ProductVariant } from '../models/product-variant.model.js';
import { StockMovement } from '../models/stock-movement.model.js';
import { ProductCategory } from '../models/product-category.model.js';
import { ProductReview } from '../models/product-review.model.js';
import { redisClient } from '../utils/redisClient.js';
import { withRedisFallback } from '../utils/redisHelper.js';
import mongoose from 'mongoose';

// --- Admin Controllers ---

const createProduct = asyncHandler(async (req, res) => {
  const { name, description, categoryId, images, isFeatured, isActive, taxPercentage, discount } = req.body;

  if (!name || !categoryId) {
    throw new ApiError(400, "Name and Category ID are required");
  }

  const categoryExists = await ProductCategory.findById(categoryId);
  if (!categoryExists) {
    throw new ApiError(400, "Invalid Category ID");
  }

  const product = await Product.create({
    name,
    description,
    categoryId,
    images,
    isFeatured,
    isActive,
    taxPercentage,
    discount
  });
  
  // Invalidate cache
  await withRedisFallback(() => redisClient.del('products:list:*'));

  return res.status(201).json(new ApiResponse(201, product, "Product created successfully"));
});

const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: req.body },
    { new: true, runValidators: true }
  );

  if (!product) {
    throw new ApiError(404, "Product not found");
  }
  
  // Invalidate cache
  await withRedisFallback(async () => {
    await redisClient.del('products:list:*');
    await redisClient.del(`product:${id}`);
  });

  return res.status(200).json(new ApiResponse(200, product, "Product updated successfully"));
});

const addVariant = asyncHandler(async (req, res) => {
  const { id } = req.params; // productId
  const { label, sku, buyingPrice, sellingPrice, stockQuantity, lowStockThreshold, isActive } = req.body;

  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  // Check if SKU already exists
  const existingSku = await ProductVariant.findOne({ sku });
  if (existingSku) {
    throw new ApiError(409, "SKU already exists");
  }

  const variant = await ProductVariant.create({
    productId: id,
    label,
    sku,
    buyingPrice,
    sellingPrice,
    stockQuantity, 
    lowStockThreshold,
    isActive
  });

  // If initial stock provided > 0, record it as a movement (MANUAL/INITIAL)
  if (stockQuantity > 0) {
    await StockMovement.create({
      variantId: variant._id,
      type: 'IN',
      quantity: stockQuantity,
      reason: 'MANUAL',
      createdBy: req.user?._id
    });
  }
  
  // Invalidate cache
  await withRedisFallback(async () => {
    await redisClient.del('products:list:*');
    await redisClient.del(`product:${id}`);
  });

  return res.status(201).json(new ApiResponse(201, variant, "Variant added successfully"));
});

const addStock = asyncHandler(async (req, res) => {
  const { id } = req.params; // variantId
  const { quantity, reason } = req.body;

  if (!quantity || quantity <= 0) {
    throw new ApiError(400, "Quantity must be greater than 0");
  }

  const variant = await ProductVariant.findById(id);
  if (!variant) {
    throw new ApiError(404, "Product variant not found");
  }

  // Use transaction to ensure consistency
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    variant.stockQuantity += quantity;
    await variant.save({ session });

    await StockMovement.create([{
      variantId: id,
      type: 'IN',
      quantity,
      reason: reason || 'RESTOCK',
      createdBy: req.user?._id
    }], { session });

    await session.commitTransaction();
    
    // Invalidate cache associated with the product of this variant
    await withRedisFallback(async () => {
      await redisClient.del('products:list:*');
      await redisClient.del(`product:${variant.productId}`);
    });

    return res.status(200).json(new ApiResponse(200, variant, "Stock added successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

const removeStock = asyncHandler(async (req, res) => {
  const { id } = req.params; // variantId
  const { quantity, reason } = req.body;

  if (!quantity || quantity <= 0) {
    throw new ApiError(400, "Quantity must be greater than 0");
  }

  const variant = await ProductVariant.findById(id);
  if (!variant) {
    throw new ApiError(404, "Product variant not found");
  }

  if (variant.stockQuantity < quantity) {
    throw new ApiError(400, "Insufficient stock");
  }

  // Use transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    variant.stockQuantity -= quantity;
    await variant.save({ session });

    await StockMovement.create([{
      variantId: id,
      type: 'OUT',
      quantity,
      reason: reason || 'manual',
      createdBy: req.user?._id
    }], { session });

    await session.commitTransaction();
    
    // Invalidate cache
    await withRedisFallback(async () => {
      await redisClient.del('products:list:*');
      await redisClient.del(`product:${variant.productId}`);
    });

    return res.status(200).json(new ApiResponse(200, variant, "Stock removed successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// --- Public Controllers ---

const listProducts = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search, 
    categoryId, 
    minPrice, 
    maxPrice, 
    sortBy = 'createdAt', 
    sortOrder = 'desc' 
  } = req.query;

  // Cache Key Generation
  const cacheKey = `products:list:${JSON.stringify(req.query)}`;
  
  // Try Cache
  const cachedData = await withRedisFallback(() => redisClient.get(cacheKey));
  if (cachedData) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedData), "Products retrieved from cache"));
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // 1. Build Match Query for Products (Search, Category, Active)
  const matchQuery = { isActive: true };

  if (search) {
    matchQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  if (categoryId) {
    matchQuery.categoryId = new mongoose.Types.ObjectId(categoryId);
  }

  // 2. Build Sort Object
  const sortObj = {};
  if (sortBy === 'price') {
    // Sorting by price is tricky because price is in variants
    // We will handle this in pipeline
  } else {
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;
  }
  
  // If no specific sort, default to featured & new
  if (Object.keys(sortObj).length === 0) {
    sortObj['isFeatured'] = -1;
    sortObj['createdAt'] = -1;
  }

  // Aggregation Pipeline
  const pipeline = [
    { $match: matchQuery },
    
    // Join Variants
    {
      $lookup: {
        from: 'productvariants',
        localField: '_id',
        foreignField: 'productId',
        as: 'variants'
      }
    },
    
    // Filter Active Variants with Stock
    {
      $addFields: {
        variants: {
          $filter: {
            input: '$variants',
            as: 'variant',
            cond: { 
              $and: [
                { $eq: ['$$variant.isActive', true] },
                { $gt: ['$$variant.stockQuantity', 0] }
              ]
            }
          }
        }
      }
    },

    // Ensure products have at least one valid variant
    // (If you want to hide out-of-stock products, keep this. If you want to show them as OOS, remove/adjust this)
    { $match: { 'variants.0': { $exists: true } } },

    // Calculate Min Price for Sorting/Filtering
    {
      $addFields: {
        minPrice: { $min: '$variants.sellingPrice' }
      }
    },
    
    // Filter by Price Range if provided
    ...(minPrice || maxPrice ? [{
        $match: {
            filters: { // Helper field, not output
                $expr: {
                    $and: [
                         minPrice ? { $gte: ['$minPrice', parseInt(minPrice)] } : {},
                         maxPrice ? { $lte: ['$minPrice', parseInt(maxPrice)] } : {}
                    ]
                }
            }
        }
    }] : []),
    // Fix: Using $expr directly in match might be cleaner or separate matches
  ];
  
  // Apply Price Filters properly
  if (minPrice || maxPrice) {
      const priceMatch = {};
      if (minPrice) priceMatch['minPrice'] = { $gte: parseInt(minPrice) };
      if (maxPrice) priceMatch['minPrice'] = { ...priceMatch['minPrice'], $lte: parseInt(maxPrice) };
      pipeline.push({ $match: priceMatch });
  }

  // Sort by Price if requested
  if (sortBy === 'price') {
      const priceSort = {};
      priceSort['minPrice'] = sortOrder === 'asc' ? 1 : -1;
      pipeline.push({ $sort: priceSort });
  } else {
      pipeline.push({ $sort: sortObj });
  }

  // Pagination Logic (Facet for count & data)
  pipeline.push({
      $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limitNum },
            {
               $project: {
                 name: 1,
                 description: 1,
                 images: 1,
                 taxPercentage: 1,
                 discount: 1,
                 minPrice: 1,
                 variants: { 
                   $map: {
                      input: "$variants",
                      as: "v",
                      in: {
                        variantId: "$$v._id",
                        label: "$$v.label",
                        sku: "$$v.sku",
                        price: "$$v.sellingPrice",
                        stock: "$$v.stockQuantity"
                      }
                   } 
                 }
               }
            }
          ]
      }
  });

  const result = await Product.aggregate(pipeline);
  
  const productsRaw = result[0].data;
  const total = result[0].metadata[0] ? result[0].metadata[0].total : 0;
  
  // Post-process logic (Discount calculation)
  const formattedProducts = productsRaw.map(p => {
    const processedVariants = p.variants.map(v => {
      let finalPrice = v.price;
      let discountAmount = 0;
      
      if (p.discount && p.discount.value > 0) {
        if (p.discount.type === 'PERCENTAGE') {
          discountAmount = v.price * (p.discount.value / 100);
        } else if (p.discount.type === 'FLAT') {
          discountAmount = p.discount.value;
        }
        finalPrice = v.price - discountAmount;
      }
      
      return {
        ...v,
        originalPrice: v.price,
        price: Number(finalPrice.toFixed(2)),
        discountAmount: Number(discountAmount.toFixed(2))
      };
    });

    const minPrice = Math.min(...processedVariants.map(v => v.price));
    
    let discountLabel = "";
    if (p.discount && p.discount.value > 0) {
        discountLabel = p.discount.type === 'PERCENTAGE' 
          ? `${p.discount.value}% OFF` 
          : `₹${p.discount.value} OFF`;
    }

    return {
      id: p._id,
      name: p.name,
      image: p.images[0] || null,
      description: p.description,
      discountLabel,
      startingFrom: minPrice,
      variants: processedVariants
    };
  });

  const responseData = {
      products: formattedProducts,
      pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
      }
  };

  // Set Cache
  await withRedisFallback(() => redisClient.set(cacheKey, JSON.stringify(responseData), { EX: 300 }));

  return res.status(200).json(new ApiResponse(200, responseData, "Products retrieved successfully"));
});

const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Try Cache
  const cachedData = await withRedisFallback(() => redisClient.get(`product:${id}`));
  if (cachedData) {
    return res.status(200).json(new ApiResponse(200, JSON.parse(cachedData), "Product details retrieved from cache"));
  }

  const product = await Product.findById(id).lean();
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  // Fetch variants
  const variants = await ProductVariant.find({ 
    productId: id, 
    isActive: true,
    stockQuantity: { $gt: 0 }
  }).lean();

  // Calculate pricing details
  const processedVariants = variants.map(v => {
    let finalPrice = v.sellingPrice;
    let discountAmount = 0;
    
    if (product.discount && product.discount.value > 0) {
      if (product.discount.type === 'PERCENTAGE') {
        discountAmount = v.sellingPrice * (product.discount.value / 100);
      } else if (product.discount.type === 'FLAT') {
        discountAmount = product.discount.value;
      }
      finalPrice = v.sellingPrice - discountAmount;
    }

   const taxRate = product.taxPercentage || 0;
   const taxAmount = (finalPrice * taxRate) / (100 + taxRate);
   const basePrice = finalPrice - taxAmount;

    return {
      variantId: v._id,
      label: v.label,
      sku: v.sku,
      price: Number(finalPrice.toFixed(2)),
      originalPrice: v.sellingPrice,
      discountAmount: Number(discountAmount.toFixed(2)),
      stock: v.stockQuantity,
      taxDetails: {
        rate: taxRate,
        amount: Number(taxAmount.toFixed(2)),
        base: Number(basePrice.toFixed(2))
      }
    };
  });
  
  let discountLabel = "";
  if (product.discount && product.discount.value > 0) {
      discountLabel = product.discount.type === 'PERCENTAGE' 
        ? `${product.discount.value}% OFF` 
        : `₹${product.discount.value} OFF`;
  }

  const response = {
    id: product._id,
    name: product.name,
    description: product.description,
    images: product.images,
    discountLabel,
    variants: processedVariants
  };

  // Set Cache
  await withRedisFallback(() => redisClient.set(`product:${id}`, JSON.stringify(response), { EX: 3600 }));

  return res.status(200).json(new ApiResponse(200, response, "Product details retrieved successfully"));
});

const addReview = asyncHandler(async (req, res) => {
  const { id } = req.params; // productId
  const { rating, comment } = req.body;
  const userId = req.user._id;

  if (!rating || rating < 1 || rating > 5) {
    throw new ApiError(400, "Rating must be between 1 and 5");
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  // Check if user already reviewed
  const existingReview = await ProductReview.findOne({ productId: id, userId });
  if (existingReview) {
    throw new ApiError(409, "You have already reviewed this product");
  }

  const review = await ProductReview.create({
    productId: id,
    userId,
    rating,
    comment
  });

  // Update Product Average Rating (Optimized)
  const stats = await ProductReview.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(id) } },
    { 
      $group: { 
        _id: '$productId', 
        avgRating: { $avg: '$rating' }, 
        count: { $sum: 1 } 
      } 
    }
  ]);

  if (stats.length > 0) {
    product.averageRating = Number(stats[0].avgRating.toFixed(1));
    product.ratingCount = stats[0].count;
    await product.save();
  }

  // Invalidate Cache
  await withRedisFallback(async () => {
    await redisClient.del('products:list:*');
    await redisClient.del(`product:${id}`);
  });

  return res.status(201).json(new ApiResponse(201, review, "Review added successfully"));
});

export {
  createProduct,
  updateProduct,
  addVariant,
  addStock,
  removeStock,
  listProducts,
  getProduct,
  addReview
};
