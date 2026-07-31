import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const required = ['MONGODB_URI', 'GROQ_API_KEY', 'PORT', 'CLIENT_URL'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

// Cloudinary is optional — photos will use placeholder URLs if not set
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.warn('⚠️  CLOUDINARY not configured — photo uploads will store locally');
}

export default {
  mongoUri: process.env.NODE_ENV === 'test'
    ? (process.env.MONGODB_TEST_URI || process.env.MONGODB_URI)
    : process.env.MONGODB_URI,
  groqApiKey:          process.env.GROQ_API_KEY,
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey:    process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  port:                parseInt(process.env.PORT, 10) || 3001,
  clientUrl:           process.env.CLIENT_URL || 'http://localhost:5173',
};
