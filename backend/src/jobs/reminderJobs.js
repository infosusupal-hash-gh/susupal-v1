const cron = require('node-cron');
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const prisma = require('../prisma/client');
const sms = require('../services/sms');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

let redisConnection;
let reminderQueue;

function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redisConnection;
}

function getReminderQueue() {
  if (!reminderQueue) {
    reminderQueue = new Queue('sms-reminders', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 2,
        backoff: { type: 'exponential', delay: 60 * 1000 },
      },
    });
  }
  return reminderQueue;
}

function toStartOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function getSuccessfulContributionsOnDate(planId, date) {
  const start = toStartOfDay(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const count = await prisma.transaction.count({
    where: {
      plan_id: planId,
      type: 'CONTRIBUTION',
      status: 'SUCCESS',
      created_at: { gte: start, lt: end },
    },
  });

  return count > 0;
}

function getExpectedContributionsToDate(plan, date) {
  const planStart = toStartOfDay(plan.start_date);
  const today = toStartOfDay(date);
  const diffDays = Math.floor((today - planStart) / (24 * 60 * 60 * 1000)) + 1;
  if (diffDays <= 0) return 0;
  return Math.min(diffDays, plan.duration);
}

async function getLastSuccessfulContributionDate(userId) {
  const result = await prisma.transaction.findFirst({
    where: {
      user_id: userId,
      type: 'CONTRIBUTION',
      status: 'SUCCESS',
    },
    orderBy: { created_at: 'desc' },
    select: { created_at: true },
  });
  return result?.created_at || null;
}

function diffDays(from, to) {
  const fromDay = toStartOfDay(from);
  const toDay = toStartOfDay(to);
  return Math.floor((toDay - fromDay) / (24 * 60 * 60 * 1000));
}

async function processReminderJob(job) {
  const { reminderId, phone, name, type } = job.data;

  const reminder = await prisma.reminderLog.findUnique({ where: { id: reminderId } });
  if (!reminder) {
    logger.warn('Reminder job could not find log record', { reminderId });
    return null;
  }

  const sendResult = await sms.sendReminderByType(type, phone, name);
  const deliveryStatus = sendResult.success ? 'SENT' : 'FAILED';

  await notificationService.updateReminderStatus(reminderId, deliveryStatus, new Date(), {
    sms_response: sendResult.data || null,
    sms_error: sendResult.error || null,
  });

  if (!sendResult.success) {
    logger.warn('SMS reminder failed', { reminderId, phone, type, error: sendResult.error });
  }

  return sendResult;
}

async function enqueueReminder({ user, plan = null, type, message }) {
  const existing = await notificationService.findReminderLog({
    userId: user.id,
    planId: plan?.id,
    type,
    date: new Date(),
  });

  if (existing) {
    return existing;
  }

  const reminder = await notificationService.createReminderLog({
    userId: user.id,
    planId: plan?.id,
    type,
    message,
    metadata: {
      user_name: user.name,
      phone: user.phone,
      plan_name: plan?.name || null,
    },
  });

  await getReminderQueue().add(
    `reminder-${type}`,
    {
      reminderId: reminder.id,
      phone: user.phone,
      name: user.name,
      type,
    },
    { jobId: `reminder-${reminder.id}` }
  );

  return reminder;
}

async function sendDailyContributionReminders() {
  const today = new Date();
  const activePlans = await prisma.savingsPlan.findMany({
    where: {
      status: 'ACTIVE',
      end_date: { gte: today },
      user: { is_active: true },
    },
    include: { user: true },
  });

  for (const plan of activePlans) {
    const expectedToDate = getExpectedContributionsToDate(plan, today);
    if (expectedToDate <= 0 || plan.days_completed >= expectedToDate) {
      continue;
    }

    await enqueueReminder({
      user: plan.user,
      plan,
      type: 'DAILY_REMINDER_MORNING',
      message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, your daily SusuPal contribution is due today. Complete your contribution to keep your savings plan on track.`,
    });
  }
}

async function sendAfternoonReminders() {
  const today = new Date();
  const activePlans = await prisma.savingsPlan.findMany({
    where: {
      status: 'ACTIVE',
      end_date: { gte: today },
      user: { is_active: true },
    },
    include: { user: true },
  });

  for (const plan of activePlans) {
    const expectedToDate = getExpectedContributionsToDate(plan, today);
    if (expectedToDate <= 0 || plan.days_completed >= expectedToDate) {
      continue;
    }

    await enqueueReminder({
      user: plan.user,
      plan,
      type: 'DAILY_REMINDER_AFTERNOON',
      message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, we noticed today's contribution is still pending. Complete it before the day ends to maintain progress.`,
    });
  }
}

async function sendEveningReminders() {
  const today = new Date();
  const activePlans = await prisma.savingsPlan.findMany({
    where: {
      status: 'ACTIVE',
      end_date: { gte: today },
      user: { is_active: true },
    },
    include: { user: true },
  });

  for (const plan of activePlans) {
    const expectedToDate = getExpectedContributionsToDate(plan, today);
    if (expectedToDate <= 0 || plan.days_completed >= expectedToDate) {
      continue;
    }

    await enqueueReminder({
      user: plan.user,
      plan,
      type: 'DAILY_REMINDER_EVENING',
      message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, today's contribution has not yet been received. Make your contribution now to avoid falling behind.`,
    });
  }
}

async function sendMissedContributionReminders() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const activePlans = await prisma.savingsPlan.findMany({
    where: {
      status: 'ACTIVE',
      end_date: { gte: yesterday },
      user: { is_active: true },
    },
    include: { user: true },
  });

  for (const plan of activePlans) {
    const expectedToYesterday = getExpectedContributionsToDate(plan, yesterday);
    if (expectedToYesterday <= 0 || plan.days_completed >= expectedToYesterday) {
      continue;
    }

    const paidYesterday = await getSuccessfulContributionsOnDate(plan.id, yesterday);
    if (paidYesterday) continue;

    await enqueueReminder({
      user: plan.user,
      plan,
      type: 'MISSED_CONTRIBUTION',
      message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, you missed yesterday's contribution. Log in to SusuPal and continue your savings journey.`,
    });
  }
}

async function sendPlanCompletionReminders() {
  const today = new Date();
  const activePlans = await prisma.savingsPlan.findMany({
    where: {
      status: 'ACTIVE',
      user: { is_active: true },
    },
    include: { user: true },
  });

  for (const plan of activePlans) {
    const remaining = Math.max(
      0,
      Math.ceil((toStartOfDay(plan.end_date) - toStartOfDay(today)) / (24 * 60 * 60 * 1000))
    );
    if (remaining === 3) {
      await enqueueReminder({
        user: plan.user,
        plan,
        type: 'PLAN_COMPLETION_3_DAYS',
        message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, only 3 days left to complete your savings plan. Keep going.`,
      });
    }
    if (remaining === 1) {
      await enqueueReminder({
        user: plan.user,
        plan,
        type: 'PLAN_COMPLETION_1_DAY',
        message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, tomorrow is the final contribution day for your savings plan.`,
      });
    }
  }
}

async function sendReactivationReminders() {
  const today = new Date();
  const activePlans = await prisma.savingsPlan.findMany({
    where: {
      status: 'ACTIVE',
      user: { is_active: true },
    },
    include: { user: true },
  });

  for (const plan of activePlans) {
    const lastSuccess = await getLastSuccessfulContributionDate(plan.user.id);
    const daysInactive = lastSuccess ? diffDays(lastSuccess, today) : null;

    if (daysInactive === null || daysInactive >= 14) {
      await enqueueReminder({
        user: plan.user,
        plan,
        type: 'REACTIVATION_14_DAYS',
        message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, your savings journey is waiting for you. Come back and continue your SusuPal plan.`,
      });
    } else if (daysInactive >= 7) {
      await enqueueReminder({
        user: plan.user,
        plan,
        type: 'REACTIVATION_7_DAYS',
        message: `Hello ${plan.user.name ? plan.user.name.split(' ')[0] : ''}, we miss seeing you save. Log in and continue building your savings goals.`,
      });
    }
  }
}

async function sendPendingCompletionMessages() {
  const today = new Date();
  const completedPlans = await prisma.savingsPlan.findMany({
    where: {
      status: 'COMPLETED',
      updated_at: { gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) },
      user: { is_active: true },
    },
    include: { user: true },
  });

  for (const plan of completedPlans) {
    const alreadyNotified = await notificationService.findReminderLog({
      userId: plan.user.id,
      planId: plan.id,
      type: 'PLAN_COMPLETED',
      date: plan.updated_at,
    });
    if (alreadyNotified) continue;

    await enqueueReminder({
      user: plan.user,
      plan,
      type: 'PLAN_COMPLETED',
      message: `Congratulations ${plan.user.name ? plan.user.name.split(' ')[0] : ''}! You have successfully completed your SusuPal savings plan.`,
    });
  }
}

function startReminderWorker() {
  const worker = new Worker('sms-reminders', processReminderJob, {
    connection: getRedisConnection(),
    concurrency: 5,
  });

  worker.on('completed', (job) => logger.info('Reminder job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('Reminder job failed', { jobId: job?.id, error: err.message }));

  return worker;
}

function startReminderCronJobs() {
  cron.schedule('0 8 * * *', () => {
    logger.info('⏰ Morning reminder cron triggered');
    sendDailyContributionReminders().catch((err) => logger.error('Morning reminder cron error', { error: err.message }));
  }, { timezone: 'Africa/Accra' });

  cron.schedule('0 13 * * *', () => {
    logger.info('⏰ Afternoon reminder cron triggered');
    sendAfternoonReminders().catch((err) => logger.error('Afternoon reminder cron error', { error: err.message }));
  }, { timezone: 'Africa/Accra' });

  cron.schedule('0 18 * * *', () => {
    logger.info('⏰ Evening reminder cron triggered');
    sendEveningReminders().catch((err) => logger.error('Evening reminder cron error', { error: err.message }));
  }, { timezone: 'Africa/Accra' });

  cron.schedule('30 9 * * *', () => {
    logger.info('⏰ Missed contribution cron triggered');
    sendMissedContributionReminders().catch((err) => logger.error('Missed reminder cron error', { error: err.message }));
  }, { timezone: 'Africa/Accra' });

  cron.schedule('0 10 * * *', () => {
    logger.info('⏰ Plan completion reminder cron triggered');
    sendPlanCompletionReminders().catch((err) => logger.error('Plan completion cron error', { error: err.message }));
  }, { timezone: 'Africa/Accra' });

  cron.schedule('0 11 * * *', () => {
    logger.info('⏰ Reactivation reminder cron triggered');
    sendReactivationReminders().catch((err) => logger.error('Reactivation cron error', { error: err.message }));
  }, { timezone: 'Africa/Accra' });

  cron.schedule('15 9 * * *', () => {
    logger.info('⏰ Pending completion message cron triggered');
    sendPendingCompletionMessages().catch((err) => logger.error('Pending completion cron error', { error: err.message }));
  }, { timezone: 'Africa/Accra' });
}

module.exports = {
  getReminderQueue,
  enqueueReminder,
  startReminderWorker,
  startReminderCronJobs,
};
