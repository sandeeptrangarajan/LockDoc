/* ============================================================
   LockDoc — MongoDB Connection Manager
   Robust Mongoose connection handling, auto-reconnect listeners,
   connection pooling, and graceful shutdown handlers.
   ============================================================ */
const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }
  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve, reject) => {
      mongoose.connection.once('connected', () => {
        isConnected = true;
        resolve(mongoose.connection);
      });
      mongoose.connection.once('error', (err) => reject(err));
    });
  }

  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lockdoc';
  
  if (!process.env.MONGODB_URI) {
    console.warn('⚠️ MONGODB_URI not defined in environment — using fallback local URI:', MONGODB_URI);
  }

  // Setup connection lifecycle event listeners once
  if (mongoose.connection.listenerCount('connected') === 0) {
    mongoose.connection.on('connected', () => {
      isConnected = true;
      console.log('🟢 [MongoDB] Connected to database cluster successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('🔴 [MongoDB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('⚠️ [MongoDB] Disconnected from database. Attempting reconnect...');
    });
  }

  // Graceful shutdown handling
  if (process.listenerCount('SIGINT') === 0) {
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('🔌 [MongoDB] Connection closed through app termination (SIGINT)');
        process.exit(0);
      } catch (err) {
        process.exit(1);
      }
    });
  }

  try {
    const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      autoIndex: !isProduction
    });

    isConnected = conn.connection.readyState === 1;
    console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

// Function to get current database connection status metadata
function getDBStatus() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const stateCode = mongoose.connection.readyState;
  return {
    status: states[stateCode] || 'unknown',
    readyState: stateCode,
    isConnected: stateCode === 1,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
}

module.exports = connectDB;
module.exports.getDBStatus = getDBStatus;
