import nodemailer from 'nodemailer';
import logger from './logger.js';

// Create SES SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true', // false for 587
  auth: {
    user: process.env.SMTP_USER, // SES SMTP username
    pass: process.env.SMTP_PASS, // SES SMTP password
  },
  tls: {
    rejectUnauthorized: true,
  },
});

// Verify SMTP connection on startup
transporter.verify((error) => {
  if (error) {
    logger.error('❌ SMTP connection failed:', error);
  } else {
    logger.info('✅ Amazon SES SMTP is ready');
  }
});

/**
 * Send an email using Amazon SES
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text body (optional)
 * @param {string} [options.from] - Override sender (optional)
 */
export async function sendMail({ to, subject, html, text, from }) {
  try {
    const mailOptions = {
      from: from || process.env.SMTP_FROM,
      replyTo: process.env.SMTP_REPLY_TO,
      to,
      subject,
      html,
      text,
    };

    const info = await transporter.sendMail(mailOptions);

    logger.info('📧 Email sent', {
      messageId: info.messageId,
      to,
    });

    return info;
  } catch (error) {
    logger.error('❌ Email send failed:', error);
    throw error;
  }
}
