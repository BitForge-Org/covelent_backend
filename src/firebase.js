import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Try to get path from env, or default to root covelnt.json
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'covelnt.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Firebase service account file not found at: ${serviceAccountPath}`);
  // We might not want to throw immediately to allow app to start without firebase if not strictly needed immediately, 
  // but for this feature it is essential.
  // throw new Error('Firebase service account file not found');
} else {
    try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
        console.error('Error initializing Firebase Admin SDK:', error);
    }
}

export default admin;
