const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const { setDefaultAdmin } = require('../middleware/adminAuth');
const notificationService = require('../services/notificationService');
const reminderJobs = require('../jobs/reminderJobs');

router.use(setDefaultAdmin);

async function findReminderById(id) {
  return prisma.reminderLog.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, phone: true } },
      plan: { select: { id: true, name: true } },
    },
  });
}

router.get('/summary', async (req, res, next) => {
  try {
    const summary = await notificationService.getReminderSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = req.query.search || '';
    const data = await notificationService.getReminderLogs({ page, limit, search });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resend', async (req, res, next) => {
  try {
    const reminder = await findReminderById(req.params.id);

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder log not found.' });
    }

    const existing = await notificationService.findReminderLog({
      userId: reminder.user_id,
      planId: reminder.plan_id,
      type: reminder.type,
      date: new Date(),
    });

    if (existing) {
      return res.status(409).json({ error: 'A reminder for this type was already sent today.' });
    }

    await notificationService.updateReminderStatus(reminder.id, 'PENDING', null, {
      resent: true,
    });

    await reminderJobs.enqueueReminder({
      user: { id: reminder.user.id, name: reminder.user.name, phone: reminder.user.phone },
      plan: reminder.plan ? { id: reminder.plan.id, name: reminder.plan.name } : null,
      type: reminder.type,
      message: reminder.message,
    });

    res.json({ success: true, message: 'Reminder requeued for delivery.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
