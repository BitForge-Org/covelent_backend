import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve("public/logs");
const LOG_RETENTION_DAYS = 7;

export function storeHealthLog(logData) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const dateStr = new Date(logData.timestamp).toISOString().slice(0, 10); // YYYY-MM-DD
  const logFile = path.join(LOG_DIR, `healthcheck-${dateStr}.log.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(logData) + "\n");
  pruneOldLogs();
}

function pruneOldLogs() {
  const files = fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.startsWith("healthcheck-") && f.endsWith(".log.jsonl"));
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of files) {
    const datePart = file.slice(
      "healthcheck-".length,
      "healthcheck-YYYY-MM-DD".length
    );
    const fileDate = new Date(datePart);
    if (isNaN(fileDate.getTime()) || fileDate.getTime() < cutoff) {
      fs.unlinkSync(path.join(LOG_DIR, file));
    }
  }
}
