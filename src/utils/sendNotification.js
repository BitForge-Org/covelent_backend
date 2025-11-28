import admin from '../firebase.js'; // fixed path
import logger from './logger.js';

export async function sendNotification(token, title, body, data = {}) {
  const message = {
    token,
    notification: {
      title,
      body,
    },
    data, // optional custom data
  };

  try {
    const response = await admin.messaging().send(message);
    logger.info('Notification sent:', response);
    return response;
  } catch (error) {
    logger.error('FCM Error:', error);
    throw error;
  }
}
