const cron = require('node-cron');
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const prisma = require('../prisma/client');
const korapay = require('../services/korapay');
const ledger = require('../services/ledger');
const sms = require('../services/sms');
const logger = require('../utils/logger');

// Redis connection for BullMQ
let redisConnection;
let contributionQueue;

function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redisConnection;
}

function getQueue() {
  if (!contributionQueue) {
    contributionQueue = new Queue('daily-contributions', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
        backoff: { type: 'exponential', delay: 5 * 60 * 1000 }, // 5 min between retries
      },
    });
  }
  return contributionQueue;
}

/**
 * Process individual contribution job
 */
async function processContributionJob(job) {
  const { userId, planId, amount, reference, phone, name, network } = job.data;

  logger.info('Processing contribution job', { jobId: job.id, userId, planId, amount });

  // Idempotency check
  const alreadyExists = await ledger.transactionExists(reference);
  if (alreadyExists) {
    logger.warn('Duplicate contribution skipped', { reference });
    return { skipped: true, reference };
  }

  // Create pending ledger entry
  const transaction = await ledger.createLedgerEntry({
    userId,
    planId,
    type: 'CONTRIBUTION',
    amount,
    status: 'PENDING',
    reference,
    description: `Daily susu contribution - ${new Date().toLocaleDateString('en-GH')}`,
  });

  try {
    // Attempt mobile money charge
    const chargeResult = await korapay.chargeMobileMoney({
      reference,
      amount: Number(amount),
      phone,
      name: name || 'SusuPal User',
      email: `user_${userId}@susupal.com`,
      network,
      narration: `Susu daily contribution GHS ${amount}`,
    });

    if (chargeResult.success) {
      logger.info('Charge initiated successfully', { reference, userId });
      return { success: true, reference, requiresWebhook: true };
    } else {
      // Charge failed immediately
      await ledger.updateTransactionStatus(reference, 'FAILED');
      
      // Update retry count on plan
      await prisma.user.update({
        where: { id: userId },
        data: { failed_debits: { increment: 1 } },
      });

      // Send failure SMS
      await sms.sendPaymentFailed(phone, amount);

      // Check if user should be suspended
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const maxFailures = parseInt(process.env.MAX_FAILURES || '5');
      
      if (user.failed_debits >= maxFailures) {
        await prisma.user.update({
          where: { id: userId },
          data: { is_active: false },
        });
        await prisma.savingsPlan.update({
          where: { id: planId },
          data: { status: 'PAUSED' },
        });
        await sms.sendAccountSuspended(phone);
        logger.warn('User suspended due to repeated failures', { userId, failures: user.failed_debits });
      }

      throw new Error(chargeResult.error || 'Charge failed');
    }
  } catch (error) {
    logger.error('Contribution job failed', { reference, userId, error: error.message });
    throw error; // BullMQ will retry
  }
}

/**
 * Enqueue daily contributions for all active users
 */
async function enqueueDailyContributions() {
  logger.info('Starting daily contribution batch');

  try {
    // Get all active savings plans
    const activePlans = await prisma.savingsPlan.findMany({
      where: {
        status: 'ACTIVE',
        end_date: { gte: new Date() },
      },
      include: {
        user: {
          select: { id: true, phone: true, name: true, is_active: true, failed_debits: true },
        },
      },
    });

    logger.info(`Found ${activePlans.length} active plans to process`);

    const queue = getQueue();
    let enqueued = 0;
    let skipped = 0;

    for (const plan of activePlans) {
      const { user } = plan;

      if (!user.is_active) {
        skipped++;
        continue;
      }

      const reference = ledger.generateReference('CONT');

      await queue.add(
        'process-contribution',
        {
          userId: user.id,
          planId: plan.id,
          amount: Number(plan.daily_amount),
          reference,
          phone: user.phone,
          name: user.name || 'Susu Member',
          network: plan.payout_method || 'MTN',
        },
        {
          jobId: reference, // Ensures uniqueness
          delay: Math.random() * 60 * 1000, // Stagger by up to 1 min to avoid API floods
        }
      );

      enqueued++;
    }

    logger.info('Daily contributions batch enqueued', { enqueued, skipped });
    return { enqueued, skipped };
  } catch (error) {
    logger.error('Failed to enqueue daily contributions', { error: error.message });
    throw error;
  }
}

/**
 * Check for completed cycles and trigger payouts
 */
async function checkCompletedCycles() {
  logger.info('Checking for completed susu cycles');

  try {
    const completedPlans = await prisma.savingsPlan.findMany({
      where: {
        status: 'ACTIVE',
        end_date: { lte: new Date() },
      },
      include: {
        user: { select: { id: true, phone: true, name: true } },
      },
    });

    for (const plan of completedPlans) {
      await triggerPayout(plan);
    }

    logger.info(`Processed ${completedPlans.length} completed cycles`);
  } catch (error) {
    logger.error('Cycle check failed', { error: error.message });
  }
}

/**
 * Process payout for a completed cycle
 */
async function triggerPayout(plan) {
  const { user } = plan;
  
  try {
    const { totalAmount, count } = await ledger.getPlanContributions(plan.id);
    const commissionDays = parseInt(process.env.COMMISSION_DAYS || '1');
    const commission = Number(plan.daily_amount) * commissionDays;
    const netPayout = totalAmount - commission;

    // Minimum contributions check (at least 80% of days)
    const minRequired = Math.floor(plan.duration * 0.8);
    if (count < minRequired) {
      logger.warn('Insufficient contributions for payout', {
        planId: plan.id,
        completed: count,
        required: minRequired,
      });
      // Update plan status but don't payout
      await prisma.savingsPlan.update({
        where: { id: plan.id },
        data: { status: 'CANCELLED' },
      });
      return;
    }

    const payoutRef = ledger.generateReference('PAY');
    const commissionRef = ledger.generateReference('COM');

    // Log commission
    await ledger.createLedgerEntry({
      userId: user.id,
      planId: plan.id,
      type: 'COMMISSION',
      amount: commission,
      status: 'SUCCESS',
      reference: commissionRef,
      description: `Platform commission for ${plan.duration}-day cycle`,
    });

    // Log payout (pending)
    await ledger.createLedgerEntry({
      userId: user.id,
      planId: plan.id,
      type: 'PAYOUT',
      amount: netPayout,
      status: 'PENDING',
      reference: payoutRef,
      description: `Susu savings payout - ${plan.duration}-day cycle`,
    });

    // Disburse via Korapay
    const disbursement = await korapay.disbursePayout({
      reference: payoutRef,
      amount: netPayout,
      phone: plan.payout_account || user.phone,
      network: plan.payout_method || 'MTN',
      name: user.name || 'SusuPal User',
      email: `user_${user.id}@susupal.com`,
      narration: `Susu savings payout - ${plan.duration}-day cycle`,
    });

    if (disbursement.success) {
      const korapayRef = disbursement.data?.reference || disbursement.data?.id || null;
      await ledger.updateTransactionStatus(payoutRef, 'SUCCESS', korapayRef);
      await prisma.savingsPlan.update({
        where: { id: plan.id },
        data: { status: 'COMPLETED' },
      });
      await sms.sendPayoutNotification(user.phone, netPayout.toFixed(2));
      logger.info('Payout successful', { planId: plan.id, userId: user.id, amount: netPayout });
    } else {
      await ledger.updateTransactionStatus(payoutRef, 'FAILED');
      logger.error('Payout disbursement failed', { planId: plan.id, error: disbursement.error });
    }
  } catch (error) {
    logger.error('Payout processing failed', { planId: plan.id, error: error.message });
  }
}

/**
 * Start BullMQ worker to process jobs
 */
function startWorker() {
  const worker = new Worker(
    'daily-contributions',
    processContributionJob,
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info('Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

/**
 * Start all cron jobs
 */
function startCronJobs() {
  // Daily contribution at 8 AM Ghana time (UTC+0 = GMT, same as Ghana in non-DST)
  const cronTime = process.env.CRON_DEBIT_TIME || '0 8 * * *';
  
  cron.schedule(cronTime, () => {
    logger.info('⏰ Daily contribution cron triggered');
    enqueueDailyContributions().catch((err) => {
      logger.error('Cron job error', { error: err.message });
    });
  }, { timezone: 'Africa/Accra' });

  // Check completed cycles at 9 AM
  cron.schedule('0 9 * * *', () => {
    logger.info('⏰ Cycle check cron triggered');
    checkCompletedCycles().catch((err) => {
      logger.error('Cycle check cron error', { error: err.message });
    });
  }, { timezone: 'Africa/Accra' });

  // Start the worker
  startWorker();

  logger.info('All cron jobs and workers started');
}

module.exports = {
  startCronJobs,
  enqueueDailyContributions,
  checkCompletedCycles,
  triggerPayout,
};
