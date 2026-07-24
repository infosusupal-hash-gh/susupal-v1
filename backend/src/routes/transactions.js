const express = require('express');
const { query } = require('express-validator');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const prisma = require('../prisma/client');
const ledger = require('../services/ledger');

router.use(authenticate);

/**
 * GET /transactions
 * Get paginated transaction history
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const type = req.query.type; // CONTRIBUTION, PAYOUT, COMMISSION
    const status = req.query.status; // PENDING, SUCCESS, FAILED

    const result = await ledger.getUserTransactions(req.user.id, { page, limit, type, status });
    const transactions = await Promise.all((result.transactions || []).map(async (tx) => {
      const plan = tx.plan_id ? await prisma.savingsPlan.findUnique({ where: { id: tx.plan_id }, select: { id: true, name: true } }) : null;
      return {
        ...tx,
        amount: Number(tx.net_amount ?? tx.amount),
        amount_paid: tx.amount_paid != null ? Number(tx.amount_paid) : null,
        fee: tx.fee != null ? Number(tx.fee) : null,
        net_amount: tx.net_amount != null ? Number(tx.net_amount) : null,
        plan: plan ? { id: plan.id, name: plan.name || 'Savings Plan' } : null,
      };
    }));

    res.json({ ...result, transactions });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
