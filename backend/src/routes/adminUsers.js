const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const { setDefaultAdmin, logAudit, requireRole } = require('../middleware/adminAuth');

router.use(setDefaultAdmin);

// GET /api/admin/users
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, search = '', status = '', sort = 'created_at', order = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const where = {
      deleted_at: null,
      ...(status === 'active' && { is_active: true }),
      ...(status === 'suspended' && { is_active: false }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sort]: order },
        include: {
          _count: { select: { savingsPlans: true } },
          savingsPlans: {
            where: { status: 'ACTIVE' },
            select: { id: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const userIds = users.map(u => u.id);
    const savingsTotals = userIds.length
      ? await prisma.transaction.groupBy({
          by: ['user_id'],
          where: { user_id: { in: userIds }, type: 'CONTRIBUTION', status: 'SUCCESS' },
          _sum: { amount: true },
        })
      : [];

    const savingsMap = Object.fromEntries(savingsTotals.map(s => [s.user_id, Number(s._sum.amount || 0)]));

    res.json({
      data: users.map(u => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        is_active: u.is_active,
        active_plans: u.savingsPlans.length,
        total_saved: savingsMap[u.id] || 0,
        last_login: u.last_login,
        created_at: u.created_at,
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deleted_at: null },
      include: {
        savingsPlans: { orderBy: { created_at: 'desc' } },
        transactions: { take: 20, orderBy: { created_at: 'desc' } },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const totalSaved = await prisma.transaction.aggregate({
      where: { user_id: user.id, type: 'CONTRIBUTION', status: 'SUCCESS' },
      _sum: { amount: true },
    });

    res.json({ ...user, total_saved: Number(totalSaved._sum.amount || 0) });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/:id/suspend
router.post('/:id/suspend', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { is_active: false },
    });
    await logAudit(req.admin.id, 'USER_SUSPEND', req.params.id, { name: user.name }, req.ip);
    res.json({ message: 'User suspended', user: { id: user.id, is_active: false } });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/:id/reactivate
router.post('/:id/reactivate', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { is_active: true },
    });
    await logAudit(req.admin.id, 'USER_REACTIVATE', req.params.id, { name: user.name }, req.ip);
    res.json({ message: 'User reactivated', user: { id: user.id, is_active: true } });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/users/:id (soft delete)
router.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), is_active: false },
    });
    await logAudit(req.admin.id, 'USER_DELETE', req.params.id, { name: user.name, phone: user.phone }, req.ip);
    res.json({ message: 'User deleted (soft)' });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/:id/reset-pin
router.post('/:id/reset-pin', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { pin_hash: null },
    });
    await logAudit(req.admin.id, 'USER_RESET_PIN', req.params.id, null, req.ip);
    res.json({ message: 'PIN reset successfully. User must set a new PIN on next login.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;