const express = require('express');
const router = express.Router();
const payoutRouter = express.Router();
const adminRouter = express.Router();

const prisma = require('../prisma/client');
const { setDefaultAdmin } = require('../middleware/adminAuth');
const { triggerPayout, enqueueDailyContributions } = require('../jobs/scheduler');
const ledger = require('../services/ledger');

// ─── Payout Routes ─────────────────────────────────────────────────────────────

payoutRouter.use(setDefaultAdmin);

/**
 * POST /payout/run
 * Manually trigger payout for a specific plan (admin)
 */
payoutRouter.post('/run', async (req, res, next) => {
  try {
    const { plan_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({ error: 'plan_id is required' });
    }

    const plan = await prisma.savingsPlan.findUnique({
      where: { id: plan_id },
      include: { user: true },
    });

    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    if (plan.status === 'COMPLETED') return res.status(400).json({ error: 'Plan already completed' });

    await triggerPayout(plan);

    res.json({ message: 'Payout triggered successfully', plan_id });
  } catch (error) {
    next(error);
  }
});

// ─── Admin Routes ──────────────────────────────────────────────────────────────

adminRouter.use(setDefaultAdmin);

/**
 * GET /admin/transactions
 */
adminRouter.get('/transactions', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { user: { select: { phone: true, name: true } } },
      }),
      prisma.transaction.count(),
    ]);

    res.json({ transactions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/stats
 */
adminRouter.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      activePlans,
      totalContributions,
      totalPayouts,
      totalCommission,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { is_active: true } }),
      prisma.savingsPlan.count({ where: { status: 'ACTIVE' } }),
      prisma.transaction.aggregate({
        where: { type: 'CONTRIBUTION', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: 'PAYOUT', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { type: 'COMMISSION', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      stats: {
        total_users: totalUsers,
        active_users: activeUsers,
        active_plans: activePlans,
        total_contributions: Number(totalContributions._sum.amount || 0),
        total_payouts: Number(totalPayouts._sum.amount || 0),
        total_commission: Number(totalCommission._sum.amount || 0),
        funds_under_management: Number(totalContributions._sum.amount || 0) - Number(totalPayouts._sum.amount || 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/trigger-contributions (manual test trigger)
 */
adminRouter.post('/trigger-contributions', async (req, res, next) => {
  try {
    const result = await enqueueDailyContributions();
    res.json({ message: 'Contributions enqueued', ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/users/:id/suspend or activate
 */
adminRouter.put('/users/:id/status', async (req, res, next) => {
  try {
    const { is_active } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { is_active },
      select: { id: true, phone: true, is_active: true },
    });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

module.exports = { payoutRouter, adminRouter };
