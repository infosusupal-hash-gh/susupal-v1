const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const prisma = require('../prisma/client');
const sms = require('../services/sms');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const phoneValidation = body('phone')
  .trim()
  .matches(/^(\+?233|0)[0-9]{9}$/)
  .withMessage('Please enter a valid Ghana phone number (e.g. 0244123456)');

const fullNameValidation = body('name')
  .trim()
  .notEmpty()
  .withMessage('Full name is required')
  .isLength({ min: 2, max: 100 })
  .withMessage('Name must be 2-100 characters')
  .matches(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/)
  .withMessage("Name may only include letters, spaces, apostrophes, and hyphens");

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return null;
}

/**
 * POST /auth/register
 * Register user with phone number and send OTP
 */
router.post(
  '/register',
  [
    fullNameValidation,
    phoneValidation,
    body('agent_code').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      const err = handleValidationErrors(req, res);
      if (err) return;

      const { phone, name, agent_code } = req.body;
      const normalizedPhone = sms.normalizeGhanaPhone(phone);

      const existingUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

      if (existingUser) {
        if (existingUser.pin_hash === null) {
          // unverified — allow resend
        } else {
          return res.status(409).json({ error: 'Phone number already registered. Please login.' });
        }
      }

      let agentId = null;
      if (agent_code) {
        const agent = await prisma.agent.findFirst({
          where: { user: { phone: sms.normalizeGhanaPhone(agent_code) }, is_active: true },
        });
        if (agent) agentId = agent.id;
      }

      const user = await prisma.user.upsert({
        where: { phone: normalizedPhone },
        create: { phone: normalizedPhone, name, agent_id: agentId },
        update: { name: name || undefined },
      });

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.otpCode.deleteMany({ where: { phone: normalizedPhone } });
      await prisma.otpCode.create({
        data: { phone: normalizedPhone, code: otp, expires_at: expiresAt },
      });

      await sms.sendOTP(normalizedPhone, otp);

      logger.info('OTP sent for registration', { phone: normalizedPhone.slice(0, 8) + '****' });

      res.status(200).json({
        message: 'OTP sent to your phone number. Please verify to continue.',
        phone: normalizedPhone,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/verify-otp
 * Verify OTP and issue a session token
 */
router.post(
  '/verify-otp',
  [
    phoneValidation,
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  ],
  async (req, res, next) => {
    try {
      const err = handleValidationErrors(req, res);
      if (err) return;

      const { phone, otp } = req.body;
      const normalizedPhone = sms.normalizeGhanaPhone(phone);

      const otpRecord = await prisma.otpCode.findFirst({
        where: {
          phone: normalizedPhone,
          code: otp,
          used: false,
          expires_at: { gte: new Date() },
        },
      });

      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
      }

      await prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } });

      const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (!user) {
        return res.status(404).json({ error: 'User not found. Please register first.' });
      }

      const token = generateSessionToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await prisma.userSession.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          expires_at: expiresAt,
        },
      });

      const hasPin = !!user.pin_hash;

      res.json({
        message: hasPin ? 'Login successful.' : 'Phone verified successfully.',
        token,
        user: { id: user.id, phone: user.phone, name: user.name },
        requiresPin: !hasPin,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/login
 * Login with phone (sends OTP)
 */
router.post('/login', [phoneValidation], async (req, res, next) => {
  try {
    const err = handleValidationErrors(req, res);
    if (err) return;

    const { phone } = req.body;
    const normalizedPhone = sms.normalizeGhanaPhone(phone);

    const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (!user) {
      return res.status(404).json({ error: 'Phone number not registered. Please sign up first.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account suspended. Please contact support.' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.otpCode.deleteMany({ where: { phone: normalizedPhone } });
    await prisma.otpCode.create({
      data: { phone: normalizedPhone, code: otp, expires_at: expiresAt },
    });

    await sms.sendOTP(normalizedPhone, otp);

    res.json({ message: 'OTP sent. Please verify to login.', phone: normalizedPhone });
  } catch (error) {
    next(error);
  }
});

module.exports = router;