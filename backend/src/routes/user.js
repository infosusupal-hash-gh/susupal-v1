const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const prisma = require('../prisma/client');
const { authenticate } = require('../middleware/auth');
const ledger = require('../services/ledger');

router.use(authenticate);

/**
 * GET /user/profile
 */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        phone: true,
        name: true,
        is_active: true,
        failed_debits: true,
        created_at: true,
        savingsPlans: {
          where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    const totalSaved = await ledger.getUserBalance(user.id);
    const hasPin = !!(await prisma.user.findUnique({
      where: { id: user.id },
      select: { pin_hash: true },
    })).pin_hash;

    res.json({
      user: {
        ...user,
        totalSaved,
        hasPin,
        savingsPlans: undefined,
        currentPlan: user.savingsPlans[0] || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /user/set-pin
 * Set or update 4-digit transaction PIN
 */
router.post(
  '/set-pin',
  [
    body('pin')
      .trim()
      .isLength({ min: 4, max: 4 })
      .isNumeric()
      .withMessage('PIN must be exactly 4 digits'),
    body('confirm_pin').custom((val, { req }) => {
      if (val !== req.body.pin) throw new Error('PINs do not match');
      return true;
    }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { pin } = req.body;
      const pin_hash = await bcrypt.hash(pin, 12);

      await prisma.user.update({
        where: { id: req.user.id },
        data: { pin_hash },
      });

      res.json({ message: 'PIN set successfully.' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /user/profile
 */
router.put(
  '/profile',
  [body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')],
  async (req, res, next) => {
    try {
      const { name } = req.body;
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { name },
        select: { id: true, phone: true, name: true },
      });
      res.json({ user });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
