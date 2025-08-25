import nodemailer from 'nodemailer';
import logger from './logger.js';

// Configure SMTP transporter using environment variables for security
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify transporter configuration at startup
transporter.verify((error, success) => {
  if (error) {
    logger.error('SMTP configuration error:', error);
  } else {
    logger.info('SMTP server is ready to send emails', success);
  }
});

/**
 * Send an email using SMTP
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML template
 * @param {string} [options.from] - Sender email address (optional, defaults to SMTP_USER)
 */
export async function sendMail({ to, subject, html, from }) {
  try {
    const mailOptions = {
      from: from || process.env.SMTP_USER,
      to,
      subject,
      html,
    };

    return await transporter.sendMail(mailOptions);
  } catch (err) {
    // Log error for monitoring
    logger.error('Email send error:', err);
    throw err;
  }
}
