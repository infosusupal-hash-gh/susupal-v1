const prisma = require('../prisma/client');

function normalizeCurrency(currency) {
  return String(currency || '').trim().toUpperCase() || 'GHS';
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

async function storeWebhookPayment(
  {
    korapayRef,
    amount,
    amountPaid,
    fee,
    netAmount,
    currency,
    status,
    paymentMethod,
    eventType,
    payload,
  },
  prismaClient = prisma
) {
  const reference = String(korapayRef || '').trim();
  if (!reference) {
    return null;
  }

  const normalizedStatus = normalizeStatus(status);
  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedAmountPaid = Number.isFinite(Number(amountPaid)) ? Number(amountPaid) : null;
  const normalizedFee = Number.isFinite(Number(fee)) ? Number(fee) : null;
  const normalizedNetAmount = Number.isFinite(Number(netAmount)) ? Number(netAmount) : null;

  return prismaClient.webhookPayment.upsert({
    where: { korapay_ref: reference },
    update: {
      amount: Number(amount),
      amount_paid: normalizedAmountPaid,
      fee: normalizedFee,
      net_amount: normalizedNetAmount,
      currency: normalizedCurrency,
      status: normalizedStatus,
      payment_method: paymentMethod || null,
      event_type: eventType || null,
      payload: payload || {},
      updated_at: new Date(),
    },
    create: {
      korapay_ref: reference,
      amount: Number(amount),
      amount_paid: normalizedAmountPaid,
      fee: normalizedFee,
      net_amount: normalizedNetAmount,
      currency: normalizedCurrency,
      status: normalizedStatus,
      payment_method: paymentMethod || null,
      event_type: eventType || null,
      payload: payload || {},
      used: false,
    },
  });
}

async function verifyWebhookPaymentForTransaction({
  submittedReference,
  expectedAmount,
  expectedCurrency = 'GHS',
  prismaClient = prisma,
}) {
  const reference = String(submittedReference || '').trim();
  if (!reference) {
    return {
      allowed: false,
      error: 'Payment cannot be verified because no matching Korapay webhook was received.',
    };
  }

  const webhookPayment = await prismaClient.webhookPayment.findUnique({
    where: { korapay_ref: reference },
  });

  if (!webhookPayment) {
    return {
      allowed: false,
      error: 'Payment cannot be verified because no matching Korapay webhook was received.',
    };
  }

  if (webhookPayment.used) {
    return {
      allowed: false,
      error: 'This Korapay payment has already been linked to another transaction.',
    };
  }

  const normalizedExpectedCurrency = normalizeCurrency(expectedCurrency);
  const normalizedWebhookCurrency = normalizeCurrency(webhookPayment.currency);
  if (normalizedWebhookCurrency !== normalizedExpectedCurrency) {
    return {
      allowed: false,
      error: `Currency mismatch: expected ${normalizedExpectedCurrency} but received ${normalizedWebhookCurrency}.`,
    };
  }

  const grossAmount = Number(webhookPayment.amount);
  const feeAmount = Number(webhookPayment.fee ?? 0);
  const amountPaid = Number(webhookPayment.amount_paid ?? grossAmount);
  const netAmountValue = Number(
    webhookPayment.net_amount ?? (Number.isFinite(amountPaid) && Number.isFinite(feeAmount) ? amountPaid - feeAmount : grossAmount)
  );
  const expectedAmountValue = Number(expectedAmount);
  if (
    Number.isFinite(netAmountValue) &&
    Number.isFinite(expectedAmountValue) &&
    Math.abs(netAmountValue - expectedAmountValue) > 0.01
  ) {
    return {
      allowed: false,
      error: `Amount mismatch: webhook reports GHS ${netAmountValue.toFixed(2)} but the transaction is GHS ${expectedAmountValue.toFixed(2)}.`,
    };
  }

  if (normalizeStatus(webhookPayment.status) !== 'success') {
    return {
      allowed: false,
      error: 'Only successful Korapay payments can be verified.',
    };
  }

  return {
    allowed: true,
    webhookPayment,
  };
}

async function markWebhookPaymentUsed({
  korapayRef,
  transactionId,
  adminId,
  prismaClient = prisma,
}) {
  const reference = String(korapayRef || '').trim();
  if (!reference) {
    return null;
  }

  const webhookPayment = await prismaClient.webhookPayment.findUnique({
    where: { korapay_ref: reference },
  });

  if (!webhookPayment || webhookPayment.used) {
    return webhookPayment;
  }

  return prismaClient.webhookPayment.update({
    where: { id: webhookPayment.id },
    data: {
      used: true,
      linked_transaction_id: transactionId || null,
      approved_by_admin: adminId || null,
      approved_at: new Date(),
    },
  });
}

module.exports = {
  storeWebhookPayment,
  verifyWebhookPaymentForTransaction,
  markWebhookPaymentUsed,
};
