const prisma = require('../prisma/client');
const ledger = require('./ledger');
const sms = require('./sms');
const logger = require('../utils/logger');

/**
 * Shared payment-success processing.
 *
 * This is the single source of truth for what happens when a CONTRIBUTION
 * payment is confirmed — used by BOTH the Korapay webhook handler
 * (src/routes/webhooks.js) and the admin manual reconciliation flow
 * (src/routes/adminReconciliation.js).
 *
 * It updates the ledger, resets failed debits, increments plan progress,
 * sends the payment-success SMS and creates the admin notification.
 *
 * The logic mirrors the original webhook handleChargeSuccess exactly so
 * webhook behaviour is unchanged.
 *
 * @param {object} transaction - Prisma transaction record
 * @param {string} korapayRef  - Korapay payment reference to store
 * @param {object} [options]
 * @param {string} [options.source] - 'webhook' | 'manual_reconciliation' (for logging/notification copy)
 */
async function processChargeSuccess(transaction, korapayRef, options = {}) {
  const { reference, amount, plan_id, user_id } = transaction;
  const source = options.source || 'webhook';
  const amountPaid = options.amountPaid ?? transaction.amount_paid ?? null;
  const fee = options.fee ?? transaction.fee ?? null;
  const netAmount = options.netAmount ?? transaction.net_amount ?? null;

  await ledger.updateTransactionStatus(reference, 'SUCCESS', korapayRef);

  const normalizedAmountPaid = Number.isFinite(Number(amountPaid)) ? Number(amountPaid) : null;
  const normalizedFee = Number.isFinite(Number(fee)) ? Number(fee) : null;
  const normalizedNetAmount = Number.isFinite(Number(netAmount)) ? Number(netAmount) : null;

  const updatedTransaction = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      amount_paid: normalizedAmountPaid,
      fee: normalizedFee,
      net_amount: normalizedNetAmount ?? amount,
      amount: normalizedNetAmount ?? amount,
    },
  });

  await prisma.user.update({
    where: { id: user_id },
    data: { failed_debits: 0 },
  });

  if (plan_id) {
    const plan = await prisma.savingsPlan.findUnique({
      where: { id: plan_id },
    });
    const { count: daysCompleted } = await ledger.getPlanContributions(plan_id);
    await prisma.savingsPlan.update({
      where: { id: plan_id },
      data: { days_completed: { increment: 1 } },
    });

    const user = await prisma.user.findUnique({ where: { id: user_id } });
    await sms.sendPaymentSuccess(
      user.phone,
      Number(updatedTransaction.net_amount ?? updatedTransaction.amount ?? amount),
      daysCompleted + 1,
      plan.duration
    );

    await prisma.adminNotification.create({
      data: {
        type: 'SYSTEM',
        title:
          source === 'manual_reconciliation'
            ? 'Payment manually reconciled'
            : 'New successful payment received',
        message: `${user.name || user.phone} paid GHS ${Number(updatedTransaction.net_amount ?? updatedTransaction.amount ?? amount).toFixed(
          2
        )} for reference ${reference}${
          source === 'manual_reconciliation' ? ' (manual reconciliation)' : ''
        }`,
        metadata: {
          userId: user_id,
          amount: Number(amount),
          reference,
          korapayRef,
          paymentMethod: 'mobile_money',
          source,
          date: new Date().toISOString(),
        },
      },
    });

    logger.info('Contribution recorded', {
      reference,
      userId: user_id,
      daysCompleted: daysCompleted + 1,
      source,
    });
  }
}

module.exports = { processChargeSuccess };
