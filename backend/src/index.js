require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const savingsRoutes = require('./routes/savings');
const transactionRoutes = require('./routes/transactions');
const paymentRoutes = require('./routes/payments');
const { payoutRouter, adminRouter } = require('./routes/payout');
const webhookRoutes = require('./routes/webhooks');

// Admin routes
const adminAuthRoutes = require('./routes/adminAuth');
const adminDashboardRoutes = require('./routes/adminDashboard');
const adminUsersRoutes = require('./routes/adminUsers');
const adminTransactionsRoutes = require('./routes/adminTransactions');
const adminPayoutsRoutes = require('./routes/adminPayouts');
const adminProfitRoutes = require('./routes/adminProfit');
const adminSettingsRoutes = require('./routes/adminSettings');
const adminNotificationsRoutes = require('./routes/adminNotifications');
const adminRemindersRoutes = require('./routes/adminReminders');
const adminExportRoutes = require('./routes/adminExport');
const adminReconciliationRoutes = require('./routes/adminReconciliation');

const { startCronJobs } = require('./jobs/scheduler');
const { startReminderWorker, startReminderCronJobs } = require('./jobs/reminderJobs');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');


const app = express();
app.set('trust proxy', 1);
  
// Validate Korapay env vars early
if (process.env.KORAPAY_WEBHOOK_SECRET && process.env.KORAPAY_WEBHOOK_SECRET.startsWith('http')) {
  logger.warn('KORAPAY_WEBHOOK_SECRET looks like a URL. This should be the webhook HMAC secret, not the URL.');
}
if (!process.env.KORAPAY_WEBHOOK_SECRET) {
  logger.warn('KORAPAY_WEBHOOK_SECRET is not set. Webhook signature verification will fail.');
}
if (!process.env.KORAPAY_WEBHOOK_URL) {
  logger.warn('KORAPAY_WEBHOOK_URL is not set. Korapay notifications may not reach your tunnel.');
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Raw body for webhook signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/admin/auth/', authLimiter);

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'susu-platform' });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payout', payoutRouter);
app.use('/api/admin', adminRouter);
app.use('/api/webhooks', webhookRoutes);

// Admin dashboard routes
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/transactions', adminTransactionsRoutes);
app.use('/api/admin/payouts', adminPayoutsRoutes);
app.use('/api/admin/profit', adminProfitRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin/notifications', adminNotificationsRoutes);
app.use('/api/admin/reminders', adminRemindersRoutes);
app.use('/api/admin/export', adminExportRoutes);
app.use('/api/admin/reconciliation', adminReconciliationRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handling ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ──────────────────────────────────────────────────────────────
function startServer(port) {
  const server = app.listen(port, async () => {
    logger.info(`🚀 Susu Platform running on port ${port}`);
    logger.info(`📦 Environment: ${process.env.NODE_ENV}`);

    // Start background jobs unless Redis is unavailable
    if (process.env.NODE_ENV !== 'test') {
      try {
        startCronJobs();
        startReminderCronJobs();
        startReminderWorker();
        logger.info('⏰ Cron jobs started');
      } catch (err) {
        logger.warn('Cron jobs could not be started', { error: err.message });
      }
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${port} is already in use, retrying on ${port + 1}`);
      server.close(() => startServer(port + 1));
      return;
    }

    throw err;
  });
}

const PORT = Number(process.env.PORT || 3000);
startServer(PORT);

module.exports = app;
