const { v4: uuidv4 } = require('uuid');
const prisma = require('../prisma/client');
const logger = require('../utils/logger');

/**
 * Generate a unique transaction reference
 */
function generateReference(prefix = 'SUS') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

function generateContributionReference(userId, prefix = 'SUSU') {
  const safeUserId = String(userId || 'USER')
    .replace(/[^a-zA-Z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'USER';
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${safeUserId}-${timestamp}`;
}

function buildCheckoutUrl({ reference, userId, planId, amount, baseUrl = 'https://checkout.korapay.com/pay/susupal' }) {
  const url = new URL(baseUrl);
  url.searchParams.set('reference', reference);
  if (userId) url.searchParams.set('user_id', userId);
  if (planId) url.searchParams.set('plan_id', planId);
  if (amount != null) url.searchParams.set('amount', String(amount));
  return url.toString();
}

/**
 * Create a new ledger entry (immutable financial record)
 */
async function createLedgerEntry({ userId, planId, type, amount, status = 'PENDING', reference, description, metadata }) {
  const entry = await prisma.transaction.create({
    data: {
      id: uuidv4(),
      user_id: userId,
      plan_id: planId,
      type,
      amount,
      status,
      reference: reference || generateReference(),
      description,
      metadata,
    },
  });

  logger.info('Ledger entry created', { id: entry.id, type, amount, userId, status });
  return entry;
}

/**
 * Update transaction status (only allowed state transitions)
 */
async function updateTransactionStatus(reference, status, korapayRef = null) {
  const validTransitions = {
    PENDING: ['SUCCESS', 'FAILED', 'CANCELLED'],
    FAILED: ['SUCCESS', 'CANCELLED'], // Allow retry success or cancellation
    SUCCESS: [],
  };

  const current = await prisma.transaction.findUnique({ where: { reference } });
  if (!current) throw new Error(`Transaction ${reference} not found`);

  // Idempotent: if same status requested, return current
  if (current.status === status) return current;

  const allowed = validTransitions[current.status] || [];
  if (!allowed.includes(status)) {
    logger.warn('Invalid status transition', { reference, from: current.status, to: status });
    return current;
  }

  return prisma.transaction.update({
    where: { reference },
    data: {
      status,
      ...(korapayRef && { korapay_ref: korapayRef }),
    },
  });
}

function resolveTransactionAmount(tx) {
  const netAmount = tx?.net_amount != null ? Number(tx.net_amount) : null;
  if (Number.isFinite(netAmount)) {
    return netAmount;
  }

  const amount = tx?.amount != null ? Number(tx.amount) : null;
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Calculate user balance from ledger (sum of successful transactions)
 */
async function getUserBalance(userId, planId = null) {
  const where = {
    user_id: userId,
    status: 'SUCCESS',
    ...(planId && { plan_id: planId }),
  };

  const transactions = await prisma.transaction.findMany({
    where,
    select: { amount: true, net_amount: true },
  });

  return transactions.reduce((sum, tx) => sum + resolveTransactionAmount(tx), 0);
}

/**
 * Get total contributions for a specific savings plan
 */
async function getPlanContributions(planId) {
  const transactions = await prisma.transaction.findMany({
    where: {
      plan_id: planId,
      type: 'CONTRIBUTION',
      status: 'SUCCESS',
    },
    select: { amount: true, net_amount: true },
  });

  const totalAmount = transactions.reduce((sum, tx) => sum + resolveTransactionAmount(tx), 0);

  return {
    totalAmount,
    count: transactions.length,
  };
}

/**
 * Check if a reference already exists (idempotency)
 */
async function transactionExists(reference) {
  const tx = await prisma.transaction.findUnique({ where: { reference } });
  return !!tx;
}

/**
 * Get transaction history for user
 */
async function getUserTransactions(userId, { page = 1, limit = 20, type, status } = {}) {
  const skip = (page - 1) * limit;
  const where = {
    user_id: userId,
    ...(type && { type }),
    ...(status && { status }),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  generateReference,
  generateContributionReference,
  buildCheckoutUrl,
  createLedgerEntry,
  updateTransactionStatus,
  getUserBalance,
  getPlanContributions,
  transactionExists,
  getUserTransactions,
};
