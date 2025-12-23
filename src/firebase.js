import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Try to get path from env, or default to root covelnt.json
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'covelnt.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Firebase service account file not found at: ${serviceAccountPath}`);
  throw new Error('Firebase service account file not found');
}

try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    // Check if already initialized to avoid "default app already exists" error during hot reloads
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('Firebase Admin SDK initialized successfully');
    }
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw error;
}

export default admin;
