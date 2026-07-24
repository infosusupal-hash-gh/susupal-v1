const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const { requireRole, logAudit, setDefaultAdmin } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

router.use(setDefaultAdmin);

// GET /api/admin/payouts/upcoming
router.get('/upcoming', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const now = new Date();
    const skip = (Number(page) - 1) * Number(limit);

    const [plans, total] = await Promise.all([
      prisma.savingsPlan.findMany({
        where: { status: 'ACTIVE', end_date: { gte: now } },
        skip,
        take: Number(limit),
        orderBy: { end_date: 'asc' },
        include: { user: { select: { name: true, phone: true, email: true } } },
      }),
      prisma.savingsPlan.count({ where: { status: 'ACTIVE', end_date: { gte: now } } }),
    ]);

    res.json({
      data: plans.map(p => ({
        id: p.id,
        user_name: p.user.name,
        user_phone: p.user.phone,
        daily_amount: Number(p.daily_amount),
        duration: p.duration,
        payout_amount: Number(p.daily_amount) * p.duration,
        payout_account: p.payout_account,
        payout_method: p.payout_method,
        end_date: p.end_date,
        days_remaining: Math.ceil((new Date(p.end_date) - now) / (1000 * 60 * 60 * 24)),
        status: p.status,
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/payouts/completed
router.get('/completed', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, date_from = '', date_to = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {
      type: 'PAYOUT',
      status: 'SUCCESS',
      ...(date_from && date_to && {
        created_at: {
          gte: new Date(date_from),
          lte: new Date(new Date(date_to).setHours(23, 59, 59, 999)),
        },
      }),
    };

    const [payouts, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' },
        include: { user: { select: { name: true, phone: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: payouts.map(p => ({
        id: p.id,
        reference: p.reference,
        user_name: p.user?.name,
        user_phone: p.user?.phone,
        amount: Number(p.amount),
        status: p.status,
        created_at: p.created_at,
        metadata: p.metadata,
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/payouts/retry-failed
router.post('/retry-failed', requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const { transaction_id } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id: transaction_id } });
    if (!tx || tx.type !== 'PAYOUT' || tx.status !== 'FAILED') {
      return res.status(400).json({ error: 'Transaction not eligible for retry' });
    }

    await prisma.transaction.update({
      where: { id: transaction_id },
      data: { status: 'PENDING', retry_count: { increment: 1 } },
    });

    await logAudit(req.admin.id, 'PAYOUT_RETRY', transaction_id, { reference: tx.reference }, req.ip);
    logger.info('Admin triggered payout retry', { transaction_id });
    res.json({ message: 'Payout retry queued' });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/payouts/failed
router.get('/failed', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = { type: 'PAYOUT', status: 'FAILED' };

    const [payouts, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' },
        include: { user: { select: { name: true, phone: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: payouts.map(p => ({
        id: p.id,
        reference: p.reference,
        user_name: p.user?.name,
        user_phone: p.user?.phone,
        amount: Number(p.amount),
        retry_count: p.retry_count,
        created_at: p.created_at,
        metadata: p.metadata,
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;