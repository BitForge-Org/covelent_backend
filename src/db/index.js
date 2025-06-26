import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

/**
 * Asynchronously connects to the MongoDB database using the connection URI and database name
 * specified in environment variables. Logs the connection host on success.
 * Exits the process with code 1 if the connection fails.
 *
 * @async
 * @function connectDB
 * @throws Will exit the process if the MongoDB connection fails.
 */
const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}${DB_NAME}`
    );
    console.log(
      `\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("MONGODB connection FAILED ", error);
    process.exit(1);
  }
};

export default connectDB;
