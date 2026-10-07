const mongoose = require('mongoose');
const env = require('./env');

/**
 * Establish a Mongoose connection to MongoDB.
 * Throws on failure so the caller can decide whether to exit.
 */
async function connectDB() {
  await mongoose.connect(env.MONGO_URI);
  console.info('✅ MongoDB connected successfully');
}

/**
 * Gracefully close the Mongoose connection.
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.info('🔌 MongoDB connection closed');
  }
}

module.exports = { connectDB, disconnectDB };
