import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
let connectionPromise: Promise<typeof mongoose> | null = null;

if (!MONGODB_URI) {
  logger.error('MONGODB_URI is not defined in environment variables');
}

export const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined');
  }

  if (connectionPromise) {
    await connectionPromise;
    return;
  }

  connectionPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 20000,
  });

  try {
    await connectionPromise;
    logger.info('Successfully connected to MongoDB Atlas');
  } catch (error) {
    connectionPromise = null;
    logger.error({ error }, 'Error connecting to MongoDB');
    throw error;
  }
};
