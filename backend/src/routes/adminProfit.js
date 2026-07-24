const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const { setDefaultAdmin } = require('../middleware/adminAuth');

router.use(setDefaultAdmin);

// GET /api/admin/profit/summary
router.get('/summary', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate, prevStartDate, prevEndDate;

    if (period === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      prevStartDate = new Date(startDate.getTime() - 86400000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === 'week') {
      const day = now.getDay();
      startDate = new Date(now.getTime() - day * 86400000);
      startDate.setHours(0, 0, 0, 0);
      prevStartDate = new Date(startDate.getTime() - 7 * 86400000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
      prevEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    }

    const [current, previous, completedPlans, avgContribution] = await Promise.all([
      prisma.transaction.aggregate({
        where: { type: 'COMMISSION', status: 'SUCCESS', created_at: { gte: startDate } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: {
          type: 'COMMISSION', status: 'SUCCESS',
          created_at: { gte: prevStartDate, lte: prevEndDate },
        },
        _sum: { amount: true },
      }),
      prisma.savingsPlan.count({ where: { status: 'COMPLETED', updated_at: { gte: startDate } } }),
      prisma.transaction.aggregate({
        where: { type: 'CONTRIBUTION', status: 'SUCCESS', created_at: { gte: startDate } },
        _avg: { amount: true },
      }),
    ]);

    const currentRevenue = Number(current._sum.amount || 0);
    const prevRevenue = Number(previous._sum.amount || 0);
    const growthPct = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    res.json({
      current_revenue: currentRevenue,
      previous_revenue: prevRevenue,
      growth_percentage: Math.round(growthPct * 100) / 100,
      transaction_count: current._count,
      completed_plans: completedPlans,
      avg_contribution: Number(avgContribution._avg.amount || 0),
      period,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/profit/chart
router.get('/chart', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate, groupByFormat;

    if (period === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      groupByFormat = '%H:00';
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 86400000);
      groupByFormat = '%Y-%m-%d';
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
      groupByFormat = '%Y-%m';
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupByFormat = '%Y-%m-%d';
    }

    const data = await prisma.$queryRaw`
      SELECT DATE_FORMAT(created_at, ${groupByFormat}) as date,
             SUM(amount) as revenue,
             COUNT(*) as count
      FROM transactions
      WHERE type = 'COMMISSION' AND status = 'SUCCESS' AND created_at >= ${startDate}
      GROUP BY date ORDER BY date ASC
    `;

    res.json(data.map(d => ({ date: d.date, revenue: Number(d.revenue), count: Number(d.count) })));
  } catch (error) {
    next(error);
  }
});

module.exports = router;