import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import logger from './logger.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a local file to Cloudinary and deletes the local file after upload.
 *
 * @async
 * @function uploadOnCloudinary
 * @param {string} localFilePath - The path to the local file to be uploaded.
 * @param {string} [folder] - Optional Cloudinary folder to upload the file into.
 * @returns {Promise<Object|null>} The Cloudinary upload response object if successful, or null if upload fails or no file path is provided.
 */
const uploadOnCloudinary = async (localFilePath, folder) => {
  try {
    if (!localFilePath) return null;
    const targetFolder = folder || 'public';
    //upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto',
      folder: targetFolder,
    });
    // file has been uploaded successful
    //console.log("file is uploaded on cloudinary ", response.url);
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload operation got failed
    logger.error(error);
    return error;
  }
};

export { uploadOnCloudinary };
