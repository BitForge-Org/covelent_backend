/**
 * Entry point for the backend server application.
 *
 * - Loads environment variables from a `.env` file using dotenv.
 * - Uses Node.js cluster module to utilize all CPU cores for better performance.
 * - On the primary process, forks worker processes equal to the number of CPU cores.
 * - Automatically respawns worker processes if they exit unexpectedly.
 * - Each worker connects to the database and starts the Express server.
 *
 * @module index
 * @requires dotenv
 * @requires ./db/index.js
 * @requires ./app.js
 * @requires cluster
 * @requires os
 *
 * @function
 * @name main
 * @description Initializes environment, sets up clustering, connects to the database, and starts the server.
 *
 * @example
 * // To start the server, run:
 * // node src/index.js
 */
// require('dotenv').config({path: './env'})
import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import cluster from "cluster";
import os from "os";
import { logHealthStats } from "./controllers/healthcheck.controller.js";

dotenv.config({
  path: "./.env",
});

// Disable cluster if running locally
const isLocal =
  process.env.NODE_ENV === "development" || process.env.CLUSTER_MODE === "off";

if (!isLocal && cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary process ${process.pid} is running`);
  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  // Listen for worker exit events and restart workers automatically
  cluster.on("exit", (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
  // NOTE: If using sessions or WebSockets, implement sticky sessions or shared storage (e.g., Redis)
} else {
  connectDB()
    .then(() => {
      console.log(
        `MongoDB connected (Worker ${process.pid}) !! DB HOST: ${process.env.MONGODB_URI || "localhost"}`
      );
      app.listen(process.env.PORT || 8000, () => {
        console.log(
          `Worker ${process.pid} running server at port : ${process.env.PORT}`
        );
      });
    })
    .catch((err) => {
      console.log("MONGO db connection failed !!! ", err);
    });
}

// Run health logging every 1 minute
typeof setInterval !== "undefined" && setInterval(logHealthStats, 60 * 1000);

/*
import express from "express"
const app = express()
( async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        app.on("errror", (error) => {
            console.log("ERRR: ", error);
            throw error
        })

        app.listen(process.env.PORT, () => {
            console.log(`App is listening on port ${process.env.PORT}`);
        })

    } catch (error) {
        console.error("ERROR: ", error)
        throw err
    }
})()

*/
