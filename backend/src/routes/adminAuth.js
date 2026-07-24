const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const prisma = require('../prisma/client');
const sms = require('../services/sms');
const { AppError } = require('../middleware/errorHandler');
const { logAudit } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  return null;
}

// POST /api/admin/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  async (req, res, next) => {
    try {
      if (handleValidation(req, res)) return;

      const { email, password } = req.body;

      const admin = await prisma.admin.findUnique({ where: { email } });
      if (!admin || !admin.is_active) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const valid = await bcrypt.compare(password, admin.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (admin.otp_enabled) {
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.adminOtpCode.deleteMany({ where: { admin_id: admin.id } });
        await prisma.adminOtpCode.create({
          data: { admin_id: admin.id, code: otp, expires_at: expiresAt },
        });

        try {
          await sms.sendOTP(admin.phone, otp);
        } catch (e) {
          logger.error('Failed to send admin OTP', { error: e.message });
        }

        logger.info('Admin login OTP sent', { email: admin.email });
        return res.json({
          requires_otp: true,
          admin_id: admin.id,
          message: `OTP sent to ${admin.phone.slice(0, 6)}****`,
        });
      }

      await prisma.admin.update({ where: { id: admin.id }, data: { last_login: new Date() } });
      await logAudit(admin.id, 'ADMIN_LOGIN', null, { email: admin.email }, req.ip);

      res.json({ success: true, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/auth/verify-otp
router.post(
  '/verify-otp',
  [
    body('admin_id').notEmpty(),
    body('otp').isLength({ min: 6, max: 6 }),
  ],
  async (req, res, next) => {
    try {
      if (handleValidation(req, res)) return;

      const { admin_id, otp } = req.body;

      const otpRecord = await prisma.adminOtpCode.findFirst({
        where: { admin_id, code: otp, used: false, expires_at: { gte: new Date() } },
      });

      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }

      await prisma.adminOtpCode.update({ where: { id: otpRecord.id }, data: { used: true } });

      const admin = await prisma.admin.findUnique({ where: { id: admin_id } });
      if (!admin || !admin.is_active) {
        return res.status(401).json({ error: 'Admin not found' });
      }

      await prisma.admin.update({ where: { id: admin.id }, data: { last_login: new Date() } });
      await logAudit(admin.id, 'ADMIN_LOGIN', null, { email: admin.email, via: 'OTP' }, req.ip);

      res.json({ success: true, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/auth/logout
router.post('/logout', async (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;