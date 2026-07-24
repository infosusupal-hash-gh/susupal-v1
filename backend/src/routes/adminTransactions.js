const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const { setDefaultAdmin } = require('../middleware/adminAuth');

router.use(setDefaultAdmin);

// GET /api/admin/transactions
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, status = '', type = '', search = '',
      date_from = '', date_to = '',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const where = {
      ...(status && { status }),
      ...(type && { type }),
      ...(search && {
        OR: [
          { reference: { contains: search } },
          { korapay_ref: { contains: search } },
        ],
      }),
      ...(date_from && date_to && {
        created_at: {
          gte: new Date(date_from),
          lte: new Date(new Date(date_to).setHours(23, 59, 59, 999)),
        },
      }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' },
        include: {
          user: { select: { name: true, phone: true, email: true } },
          plan: { select: { id: true, name: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      data: transactions.map(t => ({
        id: t.id,
        reference: t.reference,
        korapay_ref: t.korapay_ref,
        korapay_ref: t.korapay_ref,
        user_name: t.user?.name,
        user_phone: t.user?.phone,
        amount: Number(t.net_amount ?? t.amount),
        type: t.type,
        status: t.status,
        description: t.description,
        plan_name: t.plan?.name || null,
        created_at: t.created_at,
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/transactions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        plan: true,
      },
    });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ ...tx, amount: Number(tx.amount) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;