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
  { name: 'Wireless Noise-Canceling Headphones', description: 'Over-ear Bluetooth headphones with active noise cancellation, deep bass and a lightweight fit for all-day listening.', price: 1999, originalPrice: 2999, category: 'Electronics', brand: 'NovaAudio', rating: 4.5, numReviews: 1284, stock: 24, isFeatured: true },
  { name: 'Smart Fitness Watch', description: 'Track steps, heart rate, sleep and workouts on a bright color display with up to 10 days of battery life.', price: 2499, originalPrice: 3499, category: 'Electronics', brand: 'NovaFit', rating: 4.3, numReviews: 932, stock: 18, isFeatured: true },
  { name: '4K Action Camera', description: 'Rugged 4K action camera with image stabilization, waterproof body and a wide-angle lens for adventure footage.', price: 5499, originalPrice: 6999, category: 'Electronics', brand: 'NovaCam', rating: 4.4, numReviews: 415, stock: 0, isFeatured: true },
  { name: 'Classic Cotton T-Shirt', description: 'Soft 100% combed cotton t-shirt with a regular fit and reinforced stitching — an everyday essential.', price: 499, originalPrice: 999, category: 'Fashion', brand: 'UrbanNova', rating: 4.2, numReviews: 2210, stock: 150, isFeatured: true },
  { name: 'Slim-Fit Denim Jeans', description: 'Stretchable slim-fit jeans with a clean look, comfortable all-day stretch and durable denim weave.', price: 1299, originalPrice: 2199, category: 'Fashion', brand: 'UrbanNova', rating: 4.1, numReviews: 876, stock: 64, isFeatured: true },
  { name: 'Running Sneakers', description: 'Lightweight running sneakers with cushioned midsole support and a breathable knit upper.', price: 2299, originalPrice: 3299, category: 'Sports', brand: 'SwiftStep', rating: 4.6, numReviews: 1540, stock: 45, isFeatured: true },
  { name: 'Vitamin C Glow Serum', description: 'Lightweight vitamin C serum that brightens skin tone and reduces dullness with regular use.', price: 649, originalPrice: 999, category: 'Beauty', brand: 'GlowLab', rating: 4.4, numReviews: 3105, stock: 210, isFeatured: true },
  { name: 'Matte Lipstick Set', description: 'Set of five long-wear matte lipsticks in everyday nude and bold shades with a non-drying finish.', price: 799, originalPrice: 1299, category: 'Beauty', brand: 'GlowLab', rating: 4.0, numReviews: 654, stock: 88, isFeatured: true },
  { name: 'Ceramic Dinner Set (16 pc)', description: 'Elegant 16-piece glazed ceramic dinner set that is microwave and dishwasher safe — service for four.', price: 2499, originalPrice: 3999, category: 'Home', brand: 'HomeHearth', rating: 4.3, numReviews: 289, stock: 0, isFeatured: false },
  { name: 'LED Table Lamp', description: 'Minimal LED table lamp with three brightness levels and a warm, flicker-free light for desk or bedside.', price: 899, originalPrice: 1499, category: 'Home', brand: 'HomeHearth', rating: 4.2, numReviews: 512, stock: 73, isFeatured: false },
  { name: 'Leather Crossbody Bag', description: 'Compact genuine-leather crossbody bag with an adjustable strap and secure zip compartments.', price: 1899, originalPrice: 2999, category: 'Accessories', brand: 'NovaLeather', rating: 4.5, numReviews: 743, stock: 31, isFeatured: false },
  { name: 'Minimalist Analog Watch', description: 'Slim analog watch with a scratch-resistant glass face, stainless-steel case and quick-release strap.', price: 2999, originalPrice: 4499, category: 'Accessories', brand: 'NovaTime', rating: 4.6, numReviews: 980, stock: 26, isFeatured: false },
  { name: 'Yoga Mat 6 mm', description: 'High-density 6 mm yoga mat with an anti-slip textured surface and carrying strap.', price: 749, originalPrice: 1299, category: 'Sports', brand: 'SwiftStep', rating: 4.4, numReviews: 1120, stock: 96, isFeatured: false },
  { name: 'Stainless Steel Water Bottle', description: 'Double-walled vacuum-insulated steel bottle that keeps drinks cold for 24 h or hot for 12 h.', price: 599, originalPrice: 899, category: 'Sports', brand: 'SwiftStep', rating: 4.3, numReviews: 2015, stock: 240, isFeatured: false },
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
