import mongoose from 'mongoose';
import config from './env.js';

export async function connectDB() {
  try {
    // Use 127.0.0.1 for local, mongodb+srv:// for Atlas
    await mongoose.connect(config.mongoUri);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB runtime error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected — Mongoose will auto-reconnect');
  });
}
