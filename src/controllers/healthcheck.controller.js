import os from 'os';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getServerMeta } from '../utils/serverMeta.js';
import { storeHealthLog } from '../utils/healthLogger.js';

const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
const formatUptime = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs}h ${mins}m ${secs}s`;
};

// Health log function to be run on an interval (every 1 min)
export function logHealthStats() {
  const now = new Date().toISOString();
  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = process.uptime();
  const meta = getServerMeta();

  const healthStats = {
    timestamp: now,
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds),
    },
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      external: formatBytes(memoryUsage.external),
      arrayBuffers: formatBytes(memoryUsage.arrayBuffers),
    },
    cpu: {
      model: meta.cpuModel,
      cores: meta.cpuCores,
      loadAverage: os.loadavg(),
    },
    platform: meta.platform,
    nodeVersion: meta.nodeVersion,
    meta,
  };
  // storeHealthLog(healthStats);
  return healthStats;
}

const healthdata = logHealthStats();
// Healthcheck API: just return success
const healthcheck = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, healthdata, 'Server is healthy'));
});

export { healthcheck };
