const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const korapay = require('../services/korapay');
const { setDefaultAdmin } = require('../middleware/adminAuth');

router.use(setDefaultAdmin);

// GET /api/admin/dashboard/stats
router.get('/stats', async (req, res, next) => {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = new Date(tomorrow.setHours(0, 0, 0, 0));
    const tomorrowEnd = new Date(new Date(tomorrowStart).setHours(23, 59, 59, 999));

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      activeUsers,
      totalSavings,
      tomorrowPayouts,
      monthlyCommission,
      completedPayouts,
      failedTransactions,
      pendingWithdrawals,
      activePlans,
      settings,
    ] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null } }),
      prisma.user.count({ where: { is_active: true, deleted_at: null } }),
      prisma.transaction.aggregate({
        where: { type: 'CONTRIBUTION', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      prisma.savingsPlan.findMany({
        where: { status: 'ACTIVE', end_date: { gte: tomorrowStart, lte: tomorrowEnd } },
        include: { user: { select: { name: true, phone: true } } },
      }),
      prisma.transaction.aggregate({
        where: { type: 'COMMISSION', status: 'SUCCESS', created_at: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.transaction.count({ where: { type: 'PAYOUT', status: 'SUCCESS' } }),
      prisma.transaction.count({ where: { status: 'FAILED' } }),
      prisma.savingsPlan.count({ where: { status: 'ACTIVE', end_date: { gte: now } } }),
      prisma.savingsPlan.count({ where: { status: 'ACTIVE' } }),
      prisma.platformSettings.findFirst(),
    ]);

    const tomorrowPayoutTotal = tomorrowPayouts.reduce((sum, plan) => {
      return sum + Number(plan.daily_amount) * plan.duration;
    }, 0);

    const escrowBalance = settings ? Number(settings.escrow_balance) : 0;
    const liquidityDeficit = tomorrowPayoutTotal - escrowBalance;

    res.json({
      total_users: totalUsers,
      active_users: activeUsers,
      total_savings: Number(totalSavings._sum.amount || 0),
      tomorrow_payout_total: tomorrowPayoutTotal,
      tomorrow_payout_count: tomorrowPayouts.length,
      monthly_profit: Number(monthlyCommission._sum.amount || 0),
      completed_payouts: completedPayouts,
      failed_transactions: failedTransactions,
      pending_withdrawals: pendingWithdrawals,
      active_plans: activePlans,
      escrow_balance: escrowBalance,
      liquidity_deficit: liquidityDeficit,
      liquidity_warning: liquidityDeficit > 0,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/dashboard/charts
router.get('/charts', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate;
    let groupByFormat;

    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupByFormat = '%Y-%m-%d';
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupByFormat = '%Y-%m-%d';
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      groupByFormat = '%Y-%m';
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      groupByFormat = '%H:00';
    }

    const [dailyRevenue, userRegistrations, planCompletions, dailyCollections] = await Promise.all([
      prisma.$queryRaw`
        SELECT DATE_FORMAT(created_at, ${groupByFormat}) as date,
               SUM(amount) as total
        FROM transactions
        WHERE type = 'COMMISSION' AND status = 'SUCCESS'
          AND created_at >= ${startDate}
        GROUP BY date ORDER BY date ASC
      `,
      prisma.$queryRaw`
        SELECT DATE_FORMAT(created_at, ${groupByFormat}) as date,
               COUNT(*) as count
        FROM users
        WHERE created_at >= ${startDate} AND deleted_at IS NULL
        GROUP BY date ORDER BY date ASC
      `,
      prisma.$queryRaw`
        SELECT DATE_FORMAT(updated_at, ${groupByFormat}) as date,
               COUNT(*) as count
        FROM savings_plans
        WHERE status = 'COMPLETED' AND updated_at >= ${startDate}
        GROUP BY date ORDER BY date ASC
      `,
      prisma.$queryRaw`
        SELECT DATE_FORMAT(created_at, ${groupByFormat}) as date,
               SUM(amount) as total
        FROM transactions
        WHERE type = 'CONTRIBUTION' AND status = 'SUCCESS'
          AND created_at >= ${startDate}
        GROUP BY date ORDER BY date ASC
      `,
    ]);

    res.json({
      daily_revenue: dailyRevenue.map(r => ({ date: r.date, value: Number(r.total) })),
      user_registrations: userRegistrations.map(r => ({ date: r.date, value: Number(r.count) })),
      plan_completions: planCompletions.map(r => ({ date: r.date, value: Number(r.count) })),
      daily_collections: dailyCollections.map(r => ({ date: r.date, value: Number(r.total) })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/dashboard/balance
router.get('/balance', async (req, res, next) => {
  try {
    const balanceResult = await korapay.getBalance();
    if (!balanceResult.success) {
      return res.status(502).json({ error: balanceResult.error || 'Unable to fetch Korapay balance.' });
    }

    const data = balanceResult.data || {};
    res.json({
      available: Number(data.available ?? data.balance ?? 0),
      pending: Number(data.pending ?? 0),
      raw: data,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/dashboard/forecast
router.get('/forecast', async (req, res, next) => {
  try {
    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const plans = await prisma.savingsPlan.findMany({
      where: { status: 'ACTIVE', end_date: { gte: tomorrowStart, lte: tomorrowEnd } },
      include: { user: { select: { name: true, phone: true, email: true } } },
    });

    const settings = await prisma.platformSettings.findFirst();
    const escrowBalance = settings ? Number(settings.escrow_balance) : 0;
    const totalRequired = plans.reduce((s, p) => s + Number(p.daily_amount) * p.duration, 0);

    res.json({
      plans: plans.map(p => ({
        id: p.id,
        user_name: p.user.name,
        user_phone: p.user.phone,
        daily_amount: Number(p.daily_amount),
        duration: p.duration,
        payout_amount: Number(p.daily_amount) * p.duration,
        payout_account: p.payout_account,
        payout_method: p.payout_method,
        end_date: p.end_date,
      })),
      total_required: totalRequired,
      escrow_balance: escrowBalance,
      deficit: Math.max(0, totalRequired - escrowBalance),
      liquidity_warning: totalRequired > escrowBalance,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;