import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './src/utils/logger';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// import { DB_NAME } from './src/constants.js';

// ===== CONFIGURATION =====
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'covelent';
const OUTPUT_FILE = path.join(__dirname, 'mongo_schema.csv');
const SAMPLE_SIZE = 100; // number of documents to sample per collection
// =========================

function guessType(value) {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number')
    return Number.isInteger(value) ? 'int' : 'number';
  if (value instanceof Date) return 'datetime';
  if (value instanceof ObjectId) return 'ObjectId';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'string';
}

async function generateSchema() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DATABASE_NAME);

  const collections = await db.listCollections().toArray();
  const rows = [];

  for (const coll of collections) {
    const collection = db.collection(coll.name);
    const fields = {};

    // Sample documents
    const docs = await collection.find().limit(SAMPLE_SIZE).toArray();
    for (const doc of docs) {
      for (const [key, value] of Object.entries(doc)) {
        if (!fields[key]) {
          fields[key] = guessType(value);
        }
      }
    }

    // Generate CSV rows
    let position = 1;
    for (const [field, dtype] of Object.entries(fields)) {
      const constraint = field === '_id' ? 'PRIMARY KEY' : 'N';
      rows.push(
        [
          'custom',
          DATABASE_NAME,
          coll.name,
          field,
          position,
          dtype,
          'N', // max size unknown
          constraint,
          'N',
          'N',
          'N', // FK not detected automatically
        ].join(',')
      );
      position++;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, rows.join('\n'), 'utf-8');
  logger.log(`Schema exported to ${OUTPUT_FILE}`);

  await client.close();
}

generateSchema().catch(logger.error);
