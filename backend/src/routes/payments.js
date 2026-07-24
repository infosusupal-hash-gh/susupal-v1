const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const prisma = require('../prisma/client');
const { authenticate } = require('../middleware/auth');
const ledger = require('../services/ledger');

router.use(authenticate);

/**
 * POST /payments/create-checkout
 * Create a pending contribution transaction and return the Korapay checkout URL.
 */
router.post(
  '/create-checkout',
  [
    body('plan_id').notEmpty().withMessage('Plan ID is required'),
    body('amount').custom((value) => {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 10) {
        throw new Error('Minimum contribution amount is GHS 10.');
      }
      return true;
    }).withMessage('Minimum contribution amount is GHS 10.'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { plan_id, amount } = req.body;

      const plan = await prisma.savingsPlan.findFirst({
        where: { id: plan_id, user_id: req.user.id, status: 'ACTIVE' },
      });

      if (!plan) {
        return res.status(404).json({ error: 'Active savings plan not found.' });
      }

      if (Math.abs(Number(plan.daily_amount) - Number(amount)) > 0.01) {
        return res.status(400).json({
          error: `Amount must match your plan contribution of GHS ${plan.daily_amount}`,
        });
      }

      const reference = ledger.generateContributionReference(req.user.id);
      const checkoutUrl = ledger.buildCheckoutUrl({
        reference,
        userId: req.user.id,
        planId: plan.id,
        amount: Number(amount),
      });

      const existingTransaction = await prisma.transaction.findFirst({
        where: { reference },
      });
      if (existingTransaction) {
        return res.status(409).json({ error: 'A transaction with this reference already exists.' });
      }

      await ledger.createLedgerEntry({
        userId: req.user.id,
        planId: plan.id,
        type: 'CONTRIBUTION',
        amount: Number(amount),
        status: 'PENDING',
        reference,
        description: 'Pending contribution checkout',
        metadata: {
          checkout_url: checkoutUrl,
          payment_channel: 'korapay_payment_link',
        },
      });

      res.json({
        success: true,
        reference,
        checkout_url: checkoutUrl,
        message: 'Checkout created successfully. Redirecting to Korapay.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /payments/verify/:reference
 */
router.get('/verify/:reference', async (req, res, next) => {
  try {
    const { reference } = req.params;

    const transaction = await prisma.transaction.findFirst({
      where: {
        user_id: req.user.id,
        OR: [
          { reference: reference },
          { korapay_ref: reference },
        ],
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    res.json({ status: transaction.status, transaction });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /payments/request-confirmation
 * Manual payment reconciliation fallback: the user submits the Korapay
 * reference shown on their payment receipt so an admin can verify the
 * payment against Korapay and finalise the transaction.
 */
router.post(
  '/request-confirmation',
  [
    body('transaction_reference')
      .trim()
      .notEmpty()
      .withMessage('Transaction reference is required'),
    body('korapay_reference')
      .trim()
      .notEmpty()
      .withMessage('Korapay reference is required')
      .isLength({ min: 6, max: 100 })
      .withMessage('Korapay reference looks invalid'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { transaction_reference, korapay_reference } = req.body;

      // Transaction must exist and belong to the authenticated user.
      const transaction = await prisma.transaction.findFirst({
        where: { reference: transaction_reference, user_id: req.user.id },
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found.' });
      }

      if (transaction.status !== 'PENDING') {
        return res.status(400).json({
          error: `This transaction is already ${transaction.status.toLowerCase()} and cannot be reconciled.`,
        });
      }

      // Prevent duplicate open requests for the same transaction.
      const existingRequest = await prisma.paymentConfirmationRequest.findFirst({
        where: {
          transaction_id: transaction.id,
          status: 'PENDING_REVIEW',
        },
      });

      if (existingRequest) {
        return res.status(409).json({
          error: 'A confirmation request for this transaction is already under review.',
        });
      }

      const request = await prisma.paymentConfirmationRequest.create({
        data: {
          transaction_id: transaction.id,
          user_id: req.user.id,
          korapay_reference: korapay_reference,
          status: 'PENDING_REVIEW',
        },
      });

      // Store the submitted Korapay ref on the transaction for admin search,
      // without touching its PENDING status.
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { korapay_ref: korapay_reference },
      });

      // Let admins know a manual reconciliation is waiting.
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      await prisma.adminNotification.create({
        data: {
          type: 'SYSTEM',
          title: 'Payment confirmation request',
          message: `${user?.name || user?.phone || 'A user'} requested manual confirmation for ${transaction.reference} (Korapay ref: ${korapay_reference})`,
          metadata: {
            requestId: request.id,
            transactionId: transaction.id,
            reference: transaction.reference,
            korapayReference: korapay_reference,
            amount: Number(transaction.amount),
          },
        },
      });

      res.status(201).json({
        success: true,
        message:
          'Confirmation request submitted. Our team will verify your payment shortly.',
        request: {
          id: request.id,
          status: request.status,
          korapay_reference: request.korapay_reference,
          created_at: request.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
