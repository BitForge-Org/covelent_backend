import os from "os";
import process from "process";

// Returns only the meta data for the server
export function getServerMeta() {
  return {
    appName: "Backend",
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION || "1.0.0",
    hostname: os.hostname(),
    platform: process.platform,
    nodeVersion: process.version,
    cpuModel: os.cpus()[0].model,
    cpuCores: os.cpus().length,
  };
}
