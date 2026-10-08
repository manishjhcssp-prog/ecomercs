/**
 * utils/seedProducts.js — development seed for the Product collection.
 *
 * Usage (run from backend/):
 *   node utils/seedProducts.js            # seeds ONLY when collection is empty
 *   node utils/seedProducts.js --reset    # wipes products, then seeds fresh
 *
 * Sample data mirrors the frontend's demo catalog so the UI looks identical
 * once connected. Remove or replace freely — it is throwaway dev data.
 */
'use strict';

const fs = require('fs');
const path = require('path');
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  /* no .env — MONGODB_URI may come from the real environment */
}

const mongoose = require('mongoose');
const Product = require('../models/Product');

const SAMPLE_PRODUCTS = [
  // Pair 1: Laptop & Accessories
  { name: 'MacBook Pro M3', description: '14-inch MacBook Pro premium laptop with M3 chip, 18GB Unified Memory, and 512GB SSD. Ultimate performance for pros.', price: 169900, originalPrice: 169900, category: 'Electronics', brand: 'Apple', rating: 4.9, numReviews: 432, stock: 45, isFeatured: true },
  { name: 'Premium Leather Laptop Sleeve', description: 'Handcrafted full-grain leather sleeve designed to perfectly fit 13 & 14-inch laptops.', price: 4999, originalPrice: 6500, category: 'Accessories', brand: 'NovaLeather', rating: 4.8, numReviews: 120, stock: 85, isFeatured: true },
  { name: 'Magic Mouse 3', description: 'Wireless and rechargeable. Features an optimized foot design that lets it glide smoothly across your desk.', price: 8500, originalPrice: 9500, category: 'Electronics', brand: 'Apple', rating: 4.5, numReviews: 310, stock: 50, isFeatured: false },

  // Pair 2: Smartphone & Cases
  { name: 'iPhone 15 Pro Max', description: 'Forged in titanium. Features the A17 Pro chip and a revolutionary 5x Telephoto camera. The ultimate smartphone.', price: 159900, originalPrice: 159900, category: 'Electronics', brand: 'Apple', rating: 4.8, numReviews: 890, stock: 35, isFeatured: true },
  { name: 'MagSafe Clear Case', description: 'Thin, light, and easy to grip securely. Shows off the brilliant colored finish of your iPhone while providing extra protection.', price: 4900, originalPrice: 5900, category: 'Accessories', brand: 'Apple', rating: 4.6, numReviews: 420, stock: 120, isFeatured: false },

  // Pair 3: Audio
  { name: 'Sony WH-1000XM5 Headphones', description: 'Industry leading noise cancellation with two processors controlling eight microphones.', price: 29990, originalPrice: 34990, category: 'Electronics', brand: 'Sony', rating: 4.7, numReviews: 1205, stock: 60, isFeatured: true },
  { name: 'Anodized Aluminum Headphone Stand', description: 'Minimalist desk stand to safely display and store your premium over-ear headphones.', price: 1999, originalPrice: 2499, category: 'Accessories', brand: 'NovaDesign', rating: 4.3, numReviews: 85, stock: 200, isFeatured: false },

  // Generic Apparel
  { name: 'Classic Cotton T-Shirt', description: 'Soft 100% combed cotton t-shirt with a regular fit and reinforced stitching — an everyday essential.', price: 799, originalPrice: 999, category: 'Fashion', brand: 'UrbanNova', rating: 4.2, numReviews: 2210, stock: 150, isFeatured: true },
  { name: 'Slim-Fit Denim Jeans', description: 'Stretchable slim-fit jeans with a clean look, comfortable all-day stretch and durable denim weave.', price: 1899, originalPrice: 2499, category: 'Fashion', brand: 'UrbanNova', rating: 4.1, numReviews: 876, stock: 64, isFeatured: false },
];

(async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('[seed] MONGODB_URI is not set. Paste your MongoDB URI into backend/.env first.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    console.error('[seed] MongoDB connection failed:', err.message);
    process.exit(1);
  }

  const reset = process.argv.includes('--reset');
  const existing = await Product.countDocuments({});

  if (existing > 0 && !reset) {
    console.log(`[seed] Collection already has ${existing} product(s) — skipping. Use --reset to wipe and reseed.`);
  } else {
    if (reset) {
      const removed = await Product.deleteMany({});
      console.log(`[seed] Removed ${removed.deletedCount} existing product(s).`);
    }
    const inserted = await Product.insertMany(SAMPLE_PRODUCTS);
    console.log(`[seed] Inserted ${inserted.length} sample products.`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
