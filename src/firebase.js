import admin from 'firebase-admin';
import fs from 'fs';

// const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
// if (!serviceAccountPath) {
//   throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not set');
// }

// const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

export default admin;
//
