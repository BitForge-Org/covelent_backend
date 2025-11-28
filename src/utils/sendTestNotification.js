import { sendNotification } from './sendNotification.js';

export const sendTestNotification = async (req, res) => {
  try {
    const { token } = req.body; // FCM token from mobile app

    const response = await sendNotification(
      token,
      'Hello from the backend!',
      'Your Firebase notification system works 🎉',
      { customValue: '123' }
    );

    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
