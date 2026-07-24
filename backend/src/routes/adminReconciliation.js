const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const prisma = require('../prisma/client');
const { processChargeSuccess } = require('../services/paymentSuccess');
const {
  verifyWebhookPaymentForTransaction,
  markWebhookPaymentUsed,
} = require('../services/webhookPayments');
const { setDefaultAdmin, logAudit } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

router.use(setDefaultAdmin);

function serializeRequest(r) {
  return {
    id: r.id,
    status: r.status,
    korapay_reference: r.korapay_reference,
    notes: r.notes,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user_name: r.user?.name,
    user_phone: r.user?.phone,
    transaction: r.transaction
      ? {
          id: r.transaction.id,
          reference: r.transaction.reference,
          korapay_ref: r.transaction.korapay_ref,
          amount: Number(r.transaction.amount),
          type: r.transaction.type,
          status: r.transaction.status,
          created_at: r.transaction.created_at,
        }
      : null,
  };
}

// GET /api/admin/reconciliation/requests
// List payment confirmation requests (default: pending review first).
router.get('/requests', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      ...(status && { status }),
    };

    const [requests, total, pendingCount] = await Promise.all([
      prisma.paymentConfirmationRequest.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' },
        include: {
          user: { select: { name: true, phone: true } },
          transaction: true,
        },
      }),
      prisma.paymentConfirmationRequest.count({ where }),
      prisma.paymentConfirmationRequest.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);

    res.json({
      data: requests.map(serializeRequest),
      pending_count: pendingCount,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/reconciliation/search?reference=SUSU-xxx
// Search a transaction by SusuPal reference (or Korapay ref).
router.get('/search', async (req, res, next) => {
  try {
    const reference = String(req.query.reference || '').trim();
    if (!reference) {
      return res.status(400).json({ error: 'Reference is required.' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { reference: { contains: reference } },
          { korapay_ref: { contains: reference } },
        ],
      },
      take: 10,
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { name: true, phone: true } },
        confirmationRequests: { orderBy: { created_at: 'desc' } },
      },
    });

    res.json({
      data: transactions.map((t) => ({
        id: t.id,
        reference: t.reference,
        korapay_ref: t.korapay_ref,
        amount: Number(t.amount),
        type: t.type,
        status: t.status,
        created_at: t.created_at,
        user_name: t.user?.name,
        user_phone: t.user?.phone,
        confirmation_requests: t.confirmationRequests.map((r) => ({
          id: r.id,
          status: r.status,
          korapay_reference: r.korapay_reference,
          notes: r.notes,
          created_at: r.created_at,
        })),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/reconciliation/transactions/:id/korapay-ref
// Save / edit the Korapay reference on a transaction.
router.put(
  '/transactions/:id/korapay-ref',
  [
    body('korapay_ref')
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

      const korapayRef = String(req.body.korapay_ref || '').trim();

      const transaction = await prisma.transaction.findUnique({
        where: { id: req.params.id },
      });
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found.' });
      }

      const updated = await prisma.transaction.update({
        where: { id: transaction.id },
        data: { korapay_ref: korapayRef },
      });

      await logAudit(
        req.admin.id,
        'UPDATE_KORAPAY_REF',
        transaction.reference,
        { korapay_ref: korapayRef },
        req.ip
      );

      res.json({
        success: true,
        message: 'Korapay reference saved.',
        transaction: {
          id: updated.id,
          reference: updated.reference,
          korapay_ref: updated.korapay_ref,
          status: updated.status,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/reconciliation/transactions/:id/verify
// Verify the payment against Korapay using the stored korapay_ref and,
// if Korapay confirms success, run the standard payment-success flow.
router.post('/transactions/:id/verify', async (req, res, next) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
    });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    if (transaction.status === 'SUCCESS') {
      return res.status(400).json({
        error: 'This transaction is already marked as SUCCESS.',
      });
    }

    if (!['PENDING', 'FAILED'].includes(transaction.status)) {
      return res.status(400).json({
        error: `Transaction status ${transaction.status} cannot be verified.`,
      });
    }

    const korapayRef = transaction.korapay_ref;
    if (!korapayRef) {
      return res.status(400).json({
        error: 'No Korapay reference saved on this transaction. Save one first.',
      });
    }

    const transactionPlan = transaction.plan_id
      ? await prisma.savingsPlan.findUnique({ where: { id: transaction.plan_id }, select: { daily_amount: true } })
      : null;
    const expectedAmount = transaction.amount != null && Number(transaction.amount) > 0
      ? Number(transaction.amount)
      : Number(transactionPlan?.daily_amount || 0);

    const webhookVerification = await verifyWebhookPaymentForTransaction({
      submittedReference: korapayRef,
      expectedAmount,
      expectedCurrency: 'GHS',
    });

    if (!webhookVerification.allowed) {
      logger.warn('Manual reconciliation blocked by webhook record', {
        transactionId: transaction.id,
        korapayRef,
        error: webhookVerification.error,
      });
      return res.status(422).json({
        error: webhookVerification.error,
      });
    }

    // Execute the same success logic used by webhook processing.
    await processChargeSuccess(transaction, korapayRef, {
      source: 'manual_reconciliation',
      amountPaid: webhookVerification.webhookPayment?.amount_paid ?? null,
      fee: webhookVerification.webhookPayment?.fee ?? null,
      netAmount: webhookVerification.webhookPayment?.net_amount ?? null,
    });

    await markWebhookPaymentUsed({
      korapayRef,
      transactionId: transaction.id,
      adminId: req.admin?.id,
    });

    // Approve any open confirmation requests for this transaction.
    await prisma.paymentConfirmationRequest.updateMany({
      where: { transaction_id: transaction.id, status: 'PENDING_REVIEW' },
      data: {
        status: 'APPROVED',
        reviewed_by: req.admin.id,
        reviewed_at: new Date(),
        notes: req.body?.notes || 'Verified against Korapay and approved.',
      },
    });

    await logAudit(
      req.admin.id,
      'MANUAL_PAYMENT_VERIFY',
      transaction.reference,
      { korapay_ref: korapayRef, amount: Number(transaction.amount) },
      req.ip
    );

    const updated = await prisma.transaction.findUnique({
      where: { id: transaction.id },
    });

    res.json({
      success: true,
      message: 'Payment verified and transaction marked as SUCCESS.',
      transaction: {
        id: updated.id,
        reference: updated.reference,
        korapay_ref: updated.korapay_ref,
        status: updated.status,
        amount: Number(updated.amount),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/reconciliation/requests/:id/reject
// Reject a confirmation request (payment could not be verified).
router.post('/requests/:id/reject', async (req, res, next) => {
  try {
    const request = await prisma.paymentConfirmationRequest.findUnique({
      where: { id: req.params.id },
    });
    if (!request) {
      return res.status(404).json({ error: 'Confirmation request not found.' });
    }
    if (request.status !== 'PENDING_REVIEW') {
      return res.status(400).json({ error: `Request already ${request.status}.` });
    }

    const updated = await prisma.paymentConfirmationRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        reviewed_by: req.admin.id,
        reviewed_at: new Date(),
        notes: req.body?.notes || 'Payment could not be verified.',
      },
    });

    await logAudit(
      req.admin.id,
      'REJECT_CONFIRMATION_REQUEST',
      request.id,
      { notes: updated.notes },
      req.ip
    );

    res.json({ success: true, message: 'Request rejected.', request: serializeRequest(updated) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
