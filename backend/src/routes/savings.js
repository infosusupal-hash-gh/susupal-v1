const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const prisma = require('../prisma/client');
const { authenticate } = require('../middleware/auth');
const ledger = require('../services/ledger');
const sms = require('../services/sms');
const korapay = require('../services/korapay');

router.use(authenticate);

/**
 * POST /savings/create-plan
 */
router.post(
  '/create-plan',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Plan name is required')
      .isLength({ max: 80 })
      .withMessage('Plan name cannot exceed 80 characters'),
    body('daily_amount')
      .custom((value) => {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 10) {
          throw new Error('Minimum contribution amount is GHS 10.');
        }
        return true;
      })
      .withMessage('Minimum contribution amount is GHS 10.'),
    body('duration')
      .optional()
      .isInt({ min: 7, max: 365 })
      .withMessage('Duration must be between 7 and 365 days'),
    body('payout_account')
      .optional()
      .matches(/^(\+?233|0)[0-9]{9}$/)
      .withMessage('Invalid payout mobile number'),
    body('payout_method')
      .optional()
      .isIn(['MTN', 'VODAFONE', 'TELECEL', 'AIRTELTIGO'])
      .withMessage('Invalid mobile money network'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { name, daily_amount, duration = 31, payout_account, payout_method } = req.body;

      // Determine the mobile money network from the payout number's prefix (falls back to
      // the user's login phone). This is authoritative over any manually-selected network.
      const payoutPhone = payout_account || req.user.phone;
      const detectedNetwork = korapay.detectNetwork(payoutPhone);

      if (!detectedNetwork) {
        return res.status(400).json({
          error: 'Unsupported mobile money network for that number. Use an MTN, Telecel, or AirtelTigo number.',
        });
      }

      // Glo is detectable but not supported by our payment provider.
      if (detectedNetwork === 'GLO') {
        return res.status(400).json({
          error: 'Glo is not supported by our payment provider. Please use an MTN, Telecel, or AirtelTigo number.',
        });
      }

      const network = detectedNetwork;

      // Allow multiple active plans per user. Do not block creation.

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + duration);

      const plan = await prisma.savingsPlan.create({
        data: {
          user_id: req.user.id,
          name: String(name || '').trim() || null,
          daily_amount,
          duration,
          start_date: startDate,
          end_date: endDate,
          status: 'ACTIVE',
          payout_account: payout_account ? sms.normalizeGhanaPhone(payout_account) : null,
          payout_method: network,
        },
      });

      // Send confirmation SMS
      await sms.sendPlanCreated(req.user.phone, daily_amount, duration);

      res.status(201).json({
        message: 'Savings plan created successfully!',
        plan: {
          ...plan,
          daily_amount: Number(plan.daily_amount),
          total_projected: Number(plan.daily_amount) * duration,
          projected_payout: Number(plan.daily_amount) * (duration - parseInt(process.env.COMMISSION_DAYS || '1')),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /savings/current
 * Get active savings plan with dashboard data
 */
router.get('/current', async (req, res, next) => {
  try {
    // Return all active plans for the user along with aggregated dashboard metrics
    const plans = await prisma.savingsPlan.findMany({
      where: { user_id: req.user.id, status: 'ACTIVE' },
      orderBy: { created_at: 'desc' },
    });

    if (!plans || plans.length === 0) {
      return res.json({ plans: [], message: 'No active savings plans found.' });
    }

    const now = new Date();
    const commissionDays = parseInt(process.env.COMMISSION_DAYS || '1');

    const plansWithStats = await Promise.all(
      plans.map(async (plan, index) => {
        const { totalAmount: totalSaved, count: daysCompleted } = await ledger.getPlanContributions(plan.id);
        const daysRemaining = Math.max(0, Math.ceil((new Date(plan.end_date) - now) / (1000 * 60 * 60 * 24)));
        const projectedPayout = Number(plan.daily_amount) * (plan.duration - commissionDays);
        const normalizedName = plan.name || `Savings Plan #${index + 1}`;

        if (!plan.name) {
          await prisma.savingsPlan.update({ where: { id: plan.id }, data: { name: normalizedName } });
        }

        return {
          id: plan.id,
          name: normalizedName,
          daily_amount: Number(plan.daily_amount),
          duration: plan.duration,
          status: plan.status,
          start_date: plan.start_date,
          end_date: plan.end_date,
          payout_account: plan.payout_account,
          payout_method: plan.payout_method,
          total_saved: totalSaved,
          days_completed: daysCompleted,
          days_remaining: daysRemaining,
          progress_percentage: Math.round((daysCompleted / plan.duration) * 100),
          projected_payout: projectedPayout,
          next_payout_date: plan.end_date,
        };
      })
    );

    // Aggregate dashboard
    const totalContributions = plansWithStats.length;
    const totalAmountContributed = plansWithStats.reduce((s, p) => s + (p.total_saved || 0), 0);
    const activeContributions = plansWithStats.filter((p) => p.status === 'ACTIVE').length;
    const completedContributions = await prisma.savingsPlan.count({ where: { user_id: req.user.id, status: 'COMPLETED' } });
    const pendingPayments = await prisma.transaction.count({ where: { user_id: req.user.id, status: 'PENDING' } });
    const failedPayments = await prisma.transaction.count({ where: { user_id: req.user.id, status: 'FAILED' } });

    res.json({
      plans: plansWithStats,
      dashboard: {
        total_contributions: totalContributions,
        total_amount_contributed: totalAmountContributed,
        active_contributions: activeContributions,
        completed_contributions: completedContributions,
        pending_payments: pendingPayments,
        failed_payments: failedPayments,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /savings/history
 */
router.get('/history', async (req, res, next) => {
  try {
    const plans = await prisma.savingsPlan.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
    });

    const plansWithStats = await Promise.all(
      plans.map(async (plan, index) => {
        const { totalAmount, count } = await ledger.getPlanContributions(plan.id);
        const normalizedName = plan.name || `Savings Plan #${index + 1}`;

        if (!plan.name) {
          await prisma.savingsPlan.update({ where: { id: plan.id }, data: { name: normalizedName } });
        }

        return {
          ...plan,
          name: normalizedName,
          daily_amount: Number(plan.daily_amount),
          total_saved: totalAmount,
          days_completed: count,
        };
      })
    );

    res.json({ plans: plansWithStats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /savings/:id/transactions
 * Get payment history for a specific contribution plan
 */
router.get('/:id/transactions', async (req, res, next) => {
  try {
    const planId = req.params.id;
    const plan = await prisma.savingsPlan.findUnique({ where: { id: planId } });
    if (!plan || plan.user_id !== req.user.id) return res.status(404).json({ error: 'Plan not found' });

    const transactions = await prisma.transaction.findMany({
      where: { plan_id: planId },
      orderBy: { created_at: 'desc' },
      include: { plan: true },
    });

    res.json({ transactions: transactions.map((tx) => ({
      ...tx,
      amount: Number(tx.net_amount ?? tx.amount),
      amount_paid: tx.amount_paid != null ? Number(tx.amount_paid) : null,
      fee: tx.fee != null ? Number(tx.fee) : null,
      net_amount: tx.net_amount != null ? Number(tx.net_amount) : null,
      plan: tx.plan ? { id: tx.plan.id, name: tx.plan.name || `Savings Plan #${tx.plan.id}` } : null,
    })) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /savings/pause (admin or user-initiated)
 */
router.post('/pause', async (req, res, next) => {
  try {
    const plan = await prisma.savingsPlan.findFirst({
      where: { user_id: req.user.id, status: 'ACTIVE' },
    });

    if (!plan) {
      return res.status(404).json({ error: 'No active plan found.' });
    }

    await prisma.savingsPlan.update({
      where: { id: plan.id },
      data: { status: 'PAUSED' },
    });

    res.json({ message: 'Savings plan paused. Contact support to resume.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
