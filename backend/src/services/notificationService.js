const prisma = require('../prisma/client');
const logger = require('../utils/logger');

async function createReminderLog({ userId, planId = null, type, message, metadata = {} }) {
  const reminder = await prisma.reminderLog.create({
    data: {
      user_id: userId,
      plan_id: planId,
      type,
      message,
      metadata: metadata || {},
    },
  });

  logger.info('Reminder log created', { reminderId: reminder.id, userId, planId, type });
  return reminder;
}

async function updateReminderStatus(id, deliveryStatus, sentAt = new Date(), metadata = {}) {
  return prisma.reminderLog.update({
    where: { id },
    data: {
      delivery_status: deliveryStatus,
      sent_at: sentAt,
      metadata: {
        ...metadata,
      },
    },
  });
}

async function findReminderLog({ userId, planId = null, type, date }) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return prisma.reminderLog.findFirst({
    where: {
      user_id: userId,
      plan_id: planId,
      type,
      created_at: {
        gte: start,
        lt: end,
      },
    },
  });
}

async function getReminderSummary() {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

  const [totalSentToday, failedSmsCount, pendingSmsCount, remindersCreatedToday] = await Promise.all([
    prisma.reminderLog.count({
      where: {
        delivery_status: 'SENT',
        sent_at: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.reminderLog.count({
      where: {
        delivery_status: 'FAILED',
        created_at: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.reminderLog.count({
      where: { delivery_status: 'PENDING' },
    }),
    prisma.reminderLog.count({
      where: {
        created_at: { gte: todayStart, lt: tomorrowStart },
      },
    }),
  ]);

  return {
    total_reminders_sent_today: totalSentToday,
    failed_sms_count: failedSmsCount,
    pending_sms_count: pendingSmsCount,
    reminders_created_today: remindersCreatedToday,
  };
}

async function getReminderLogs({ page = 1, limit = 20, search = '' }) {
  const skip = (page - 1) * limit;
  const where = search
    ? {
        OR: [
          { user: { name: { contains: search } } },
          { user: { phone: { contains: search } } },
        ],
      }
    : {};

  const [logs, total] = await Promise.all([
    prisma.reminderLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.reminderLog.count({ where }),
  ]);

  return {
    logs,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

module.exports = {
  createReminderLog,
  updateReminderStatus,
  findReminderLog,
  getReminderSummary,
  getReminderLogs,
};
