const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const prisma = require('../prisma/client');
const { requireRole, logAudit, setDefaultAdmin } = require('../middleware/adminAuth');

router.use(setDefaultAdmin);

// GET /api/admin/settings/platform
router.get('/platform', async (req, res, next) => {
  try {
    let settings = await prisma.platformSettings.findFirst();
    if (!settings) {
      settings = await prisma.platformSettings.create({ data: {} });
    }
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/settings/platform
router.put('/platform', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { platform_name, commission_days, max_retry_attempts, grace_period_days, timezone } = req.body;
    let settings = await prisma.platformSettings.findFirst();
    if (!settings) {
      settings = await prisma.platformSettings.create({ data: {} });
    }
    const updated = await prisma.platformSettings.update({
      where: { id: settings.id },
      data: {
        ...(platform_name && { platform_name }),
        ...(commission_days !== undefined && { commission_days: Number(commission_days) }),
        ...(max_retry_attempts !== undefined && { max_retry_attempts: Number(max_retry_attempts) }),
        ...(grace_period_days !== undefined && { grace_period_days: Number(grace_period_days) }),
        ...(timezone && { timezone }),
      },
    });
    await logAudit(req.admin.id, 'SETTINGS_UPDATE', 'platform', req.body, req.ip);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/settings/profile
router.put('/profile', async (req, res, next) => {
  try {
    const { name, phone, profile_picture } = req.body;
    const updated = await prisma.admin.update({
      where: { id: req.admin.id },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(profile_picture !== undefined && { profile_picture }),
      },
      select: { id: true, email: true, name: true, phone: true, role: true, profile_picture: true },
    });
    await logAudit(req.admin.id, 'PROFILE_UPDATE', req.admin.id, { name, phone }, req.ip);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/settings/change-email
router.put(
  '/change-email',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed' });

      const { email, password } = req.body;
      const admin = await prisma.admin.findUnique({ where: { id: req.admin.id } });
      const valid = await bcrypt.compare(password, admin.password_hash);
      if (!valid) return res.status(401).json({ error: 'Incorrect password' });

      const existing = await prisma.admin.findUnique({ where: { email } });
      if (existing && existing.id !== req.admin.id) {
        return res.status(409).json({ error: 'Email already in use' });
      }

      await prisma.admin.update({ where: { id: req.admin.id }, data: { email } });
      await logAudit(req.admin.id, 'EMAIL_CHANGE', req.admin.id, { new_email: email }, req.ip);
      res.json({ message: 'Email updated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/admin/settings/change-password
router.put(
  '/change-password',
  [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

      const { current_password, new_password } = req.body;
      const admin = await prisma.admin.findUnique({ where: { id: req.admin.id } });
      const valid = await bcrypt.compare(current_password, admin.password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

      const hash = await bcrypt.hash(new_password, 12);
      await prisma.admin.update({ where: { id: req.admin.id }, data: { password_hash: hash } });
      await logAudit(req.admin.id, 'PASSWORD_CHANGE', req.admin.id, null, req.ip);
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);



// GET /api/admin/settings/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await prisma.adminSession.findMany({
      where: { admin_id: req.admin.id },
      orderBy: { created_at: 'desc' },
      select: { id: true, user_agent: true, ip_address: true, created_at: true },
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/settings/sessions/all
router.delete('/sessions/all', async (req, res, next) => {
  try {
    await prisma.adminSession.deleteMany({ where: { admin_id: req.admin.id } });
    res.json({ message: 'All sessions terminated' });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/settings/audit-logs
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const adminId = req.admin.role === 'SUPER_ADMIN' ? undefined : req.admin.id;

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where: adminId ? { admin_id: adminId } : {},
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' },
        include: { admin: { select: { name: true, email: true } } },
      }),
      prisma.adminAuditLog.count({ where: adminId ? { admin_id: adminId } : {} }),
    ]);

    res.json({
      data: logs.map(l => ({
        id: l.id,
        admin_name: l.admin.name,
        admin_email: l.admin.email,
        action: l.action,
        target: l.target,
        details: l.details,
        ip_address: l.ip_address,
        created_at: l.created_at,
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;