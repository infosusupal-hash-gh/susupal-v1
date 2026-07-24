const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = 'https://api.textbee.dev/api/v1';
const API_KEY = process.env.TEXTBEE_API_KEY;
const DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;

logger.debug('SMS service init', {
  apiKey: API_KEY ? 'loaded' : 'missing',
  deviceId: DEVICE_ID ? 'loaded' : 'missing',
});

// ─── Phone Normalizer ─────────────────────────────────────────────────────────

function normalizeGhanaPhone(phone) {
  phone = phone.replace(/[\s-]/g, '');

  if (phone.startsWith('+233')) return phone;
  if (phone.startsWith('233')) return `+${phone}`;
  if (phone.startsWith('0')) return `+233${phone.slice(1)}`;

  return `+233${phone}`;
}

// ─── Core SMS Sender ──────────────────────────────────────────────────────────

async function sendSMS(phone, message) {
  try {
    const normalizedPhone = normalizeGhanaPhone(phone);

    const response = await axios.post(
      `${BASE_URL}/gateway/devices/${DEVICE_ID}/send-sms`,
      {
        recipients: [normalizedPhone],
        message,
      },
      {
        headers: {
          'x-api-key': API_KEY,
        },
      }
    );

    const success = response.status === 200 && response.data.success;

    if (!success) {
      logger.error('TextBee rejected SMS', {
        status: response.status,
        phone: phone.slice(0, 6) + '****',
        response: response.data,
      });
    } else {
      logger.info('SMS sent successfully', {
        phone: phone.slice(0, 6) + '****',
        messageId: response.data.messageId,
      });
    }

    return {
      success,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    logger.error('SMS sending failed', {
      error: error.message,
      response: error.response?.data,
    });

    return {
      success: false,
      error: error.message,
      status: error.response?.status,
    };
  }
}

// ─── Message Templates ────────────────────────────────────────────────────────

const messages = {
  dailyReminder: (amount) =>
    `Ayekoo! Your GHS ${amount} susu contribution is due today. Pay at: ${process.env.APP_URL}/pay — SusuPal`,

  reminder: (message) => `${message} — SusuPal`,

  paymentSuccess: (amount, daysCompleted, totalDays) =>
    `GHS ${amount} saved! You've completed ${daysCompleted}/${totalDays} days. Keep it up! — SusuPal`,

  paymentFailed: (amount) =>
    `Payment of GHS ${amount} failed. Please retry or contact support. — SusuPal`,

  payoutSent: (amount) =>
    `Congratulations! GHS ${amount} has been sent to your mobile money account. Susu complete! — SusuPal`,

  otpMessage: (code) =>
    `Your SusuPal verification code is: ${code}. Expires in 10 minutes. Do not share this.`,

  planCreated: (amount, duration) =>
    `Susu plan created! You will save GHS ${amount}/day for ${duration} days. First debit is tomorrow. — SusuPal`,

  accountSuspended: () =>
    `Your SusuPal account has been paused due to repeated failed payments. Please contact support.`,
};

// ─── Named SMS Functions ──────────────────────────────────────────────────────

async function sendDailyReminder(phone, amount) {
  return sendSMS(phone, messages.dailyReminder(amount));
}

async function sendReminderByType(type, phone, name) {
  const firstName = name ? String(name).trim().split(' ')[0] : 'there';
  const displayName = firstName || 'there';
  let message;

  switch (type) {
    case 'DAILY_REMINDER_MORNING':
      message = `Hello ${firstName}, your daily SusuPal contribution is due today. Complete your contribution to keep your savings plan on track.`;
      break;
    case 'DAILY_REMINDER_AFTERNOON':
      message = `Hello ${firstName}, we noticed today's contribution is still pending. Complete it before the day ends to maintain progress.`;
      break;
    case 'DAILY_REMINDER_EVENING':
      message = `Hello ${firstName}, today's contribution has not yet been received. Make your contribution now to avoid falling behind.`;
      break;
    case 'MISSED_CONTRIBUTION':
      message = `Hello ${firstName}, you missed yesterday's contribution. Log in to SusuPal and continue your savings journey.`;
      break;
    case 'PLAN_COMPLETION_3_DAYS':
      message = `Hello ${firstName}, only 3 days left to complete your savings plan. Keep going.`;
      break;
    case 'PLAN_COMPLETION_1_DAY':
      message = `Hello ${firstName}, tomorrow is the final contribution day for your savings plan.`;
      break;
    case 'PLAN_COMPLETED':
      message = `Congratulations ${firstName}! You have successfully completed your SusuPal savings plan.`;
      break;
    case 'REACTIVATION_7_DAYS':
      message = `Hello ${firstName}, we miss seeing you save. Log in and continue building your savings goals.`;
      break;
    case 'REACTIVATION_14_DAYS':
      message = `Hello ${firstName}, your savings journey is waiting for you. Come back and continue your SusuPal plan.`;
      break;
    default:
      message = `Hello ${firstName}, ${type.replaceAll('_', ' ').toLowerCase()}.`;  
  }

  return sendSMS(phone, messages.reminder(message));
}

async function sendPaymentSuccess(
  phone,
  amount,
  daysCompleted,
  totalDays
) {
  return sendSMS(
    phone,
    messages.paymentSuccess(amount, daysCompleted, totalDays)
  );
}

async function sendPaymentFailed(phone, amount) {
  return sendSMS(phone, messages.paymentFailed(amount));
}

async function sendPayoutNotification(phone, amount) {
  return sendSMS(phone, messages.payoutSent(amount));
}

async function sendOTP(phone, code) {
  return sendSMS(phone, messages.otpMessage(code));
}

async function sendPlanCreated(phone, amount, duration) {
  return sendSMS(phone, messages.planCreated(amount, duration));
}

async function sendAccountSuspended(phone) {
  return sendSMS(phone, messages.accountSuspended());
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  sendSMS,
  sendDailyReminder,
  sendReminderByType,
  sendPaymentSuccess,
  sendPaymentFailed,
  sendPayoutNotification,
  sendOTP,
  sendPlanCreated,
  sendAccountSuspended,
  normalizeGhanaPhone,
};
