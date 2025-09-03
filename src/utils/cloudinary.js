import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";

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
const UPLOADS_ROOT = path.resolve("uploads/tmp");   // Use your actual uploads temp dir here
const uploadOnCloudinary = async (localFilePath, folder) => {
  try {
    if (!localFilePath) return null;
    const targetFolder = folder || "public";
    //upload the file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: targetFolder,
    });
    // file has been uploaded successfully
    //console.log("file is uploaded on cloudinary ", response.url);
    const absoluteFilePath = path.resolve(localFilePath);
    if (absoluteFilePath.startsWith(UPLOADS_ROOT)) {
      fs.unlinkSync(absoluteFilePath);
    } else {
      console.warn(`Unsafe file path detected for deletion: ${absoluteFilePath}`);
    }
    return response;
  } catch (error) {
    const absoluteFilePath = path.resolve(localFilePath);
    if (absoluteFilePath.startsWith(UPLOADS_ROOT)) {
      try {
        fs.unlinkSync(absoluteFilePath); // remove locally saved temp file as upload failed
      } catch (e) {
        console.warn("Failed to delete unsafe or missing file:", absoluteFilePath, e);
      }
    } else {
      console.warn(`Unsafe file path detected for deletion (error branch): ${absoluteFilePath}`);
    }
    console.error(error);
    return error;
  }
};

export { uploadOnCloudinary };
