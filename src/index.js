import dotenv from 'dotenv';
import cluster from 'cluster';
import os from 'os';

import connectDB from './db/index.js';
import { app } from './app.js';

import { logHealthStats } from './controllers/healthcheck.controller.js';
import logger from './utils/logger.js';
dotenv.config({
  path: './.env',
});

// Disable cluster if running locally
const isLocal =
  process.env.NODE_ENV === 'development' || process.env.CLUSTER_MODE === 'off';

if (!isLocal && cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  logger.warn(`Primary process ${process.pid} is running`);
  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  // Listen for worker exit events and restart workers automatically
  cluster.on('exit', (worker) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
  // NOTE: If using sessions or WebSockets, implement sticky sessions or shared storage (e.g., Redis)
} else {
  connectDB()
    .then(() => {
      logger.info(
        `MongoDB connected (Worker ${process.pid}) !! DB HOST: ${process.env.MONGODB_URI || 'localhost'}`
      );
      app.listen(process.env.PORT || 8000, () => {
        logger.info(
          `Worker ${process.pid} running server at port : ${process.env.PORT}`
        );
        logger.info(
          `Swagger UI available at http://localhost:${process.env.PORT}/api-docs`
        );
      });
    })
    .catch((err) => {
      logger.error('MONGO db connection failed !!! ', err);
    });
}

// Run health logging every 1 minute
typeof setInterval !== 'undefined' && setInterval(logHealthStats, 60 * 1000);

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
