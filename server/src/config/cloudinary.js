import { v2 as cloudinary } from 'cloudinary';
import config from './env.js';

if (config.cloudinaryCloudName) {
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key:    config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
  });
  console.log('✅ Cloudinary configured');
} else {
  console.warn('⚠️  Cloudinary not configured — uploads will use local fallback');
}

export default cloudinary;
