const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const { setDefaultAdmin } = require('../middleware/adminAuth');

router.use(setDefaultAdmin);

// GET /api/admin/notifications
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread_only = 'false' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = unread_only === 'true' ? { is_read: false } : {};

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.adminNotification.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' },
      }),
      prisma.adminNotification.count({ where }),
      prisma.adminNotification.count({ where: { is_read: false } }),
    ]);

    res.json({ data: notifications, total, unread_count: unreadCount });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/notifications/read-all
router.put('/read-all', async (req, res, next) => {
  try {
    await prisma.adminNotification.updateMany({
      where: { is_read: false },
      data: { is_read: true },
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/notifications/:id/read
router.put('/:id/read', async (req, res, next) => {
  try {
    await prisma.adminNotification.update({
      where: { id: req.params.id },
      data: { is_read: true },
    });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;