const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const ExcelJS = require('exceljs');
const { setDefaultAdmin } = require('../middleware/adminAuth');

router.use(setDefaultAdmin);

function styleHeader(worksheet, columns) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  headerRow.alignment = { horizontal: 'center' };
  columns.forEach((col, i) => {
    worksheet.getColumn(i + 1).width = col.width || 18;
  });
}

// GET /api/admin/export/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { deleted_at: null },
      include: { _count: { select: { savingsPlans: true } } },
      orderBy: { created_at: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SusuPal Admin';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Users');

    const columns = [
      { header: 'Full Name', key: 'name', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Total Plans', key: 'plans', width: 14 },
      { header: 'Active', key: 'active', width: 10 },
      { header: 'Last Login', key: 'last_login', width: 20 },
      { header: 'Registered', key: 'created_at', width: 20 },
    ];

    ws.columns = columns;
    styleHeader(ws, columns);

    users.forEach(u => {
      ws.addRow({
        name: u.name || 'N/A',
        phone: u.phone,
        email: u.email || 'N/A',
        status: u.is_active ? 'Active' : 'Suspended',
        plans: u._count.savingsPlans,
        active: u.is_active ? 'Yes' : 'No',
        last_login: u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
        created_at: new Date(u.created_at).toLocaleString(),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=susupal_users_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/export/transactions
router.get('/transactions', async (req, res, next) => {
  try {
    const { date_from, date_to, status, type } = req.query;
    const where = {
      ...(status && { status }),
      ...(type && { type }),
      ...(date_from && date_to && {
        created_at: { gte: new Date(date_from), lte: new Date(new Date(date_to).setHours(23, 59, 59, 999)) },
      }),
    };

    const transactions = await prisma.transaction.findMany({
      where,
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { created_at: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SusuPal Admin';
    const ws = workbook.addWorksheet('Transactions');

    const columns = [
      { header: 'Reference', key: 'reference', width: 32 },
      { header: 'User', key: 'user', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Amount (GHS)', key: 'amount', width: 16 },
      { header: 'Type', key: 'type', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Date', key: 'created_at', width: 22 },
    ];

    ws.columns = columns;
    styleHeader(ws, columns);

    transactions.forEach(t => {
      ws.addRow({
        reference: t.reference,
        user: t.user?.name || 'N/A',
        phone: t.user?.phone || 'N/A',
        amount: Number(t.amount),
        type: t.type,
        status: t.status,
        description: t.description || '',
        created_at: new Date(t.created_at).toLocaleString(),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=susupal_transactions_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/export/payouts
router.get('/payouts', async (req, res, next) => {
  try {
    const payouts = await prisma.transaction.findMany({
      where: { type: 'PAYOUT' },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { created_at: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SusuPal Admin';
    const ws = workbook.addWorksheet('Payouts');

    const columns = [
      { header: 'Reference', key: 'reference', width: 32 },
      { header: 'User', key: 'user', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Amount (GHS)', key: 'amount', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Retry Count', key: 'retry', width: 14 },
      { header: 'Date', key: 'created_at', width: 22 },
    ];

    ws.columns = columns;
    styleHeader(ws, columns);

    payouts.forEach(p => {
      const row = ws.addRow({
        reference: p.reference,
        user: p.user?.name || 'N/A',
        phone: p.user?.phone || 'N/A',
        amount: Number(p.amount),
        status: p.status,
        retry: p.retry_count,
        created_at: new Date(p.created_at).toLocaleString(),
      });
      if (p.status === 'FAILED') {
        row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=susupal_payouts_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/export/savings-plans
router.get('/savings-plans', async (req, res, next) => {
  try {
    const plans = await prisma.savingsPlan.findMany({
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { created_at: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SusuPal Admin';
    const ws = workbook.addWorksheet('Savings Plans');

    const columns = [
      { header: 'User', key: 'user', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Daily Amount (GHS)', key: 'daily', width: 20 },
      { header: 'Duration (Days)', key: 'duration', width: 16 },
      { header: 'Total (GHS)', key: 'total', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Days Completed', key: 'completed', width: 16 },
      { header: 'Start Date', key: 'start', width: 20 },
      { header: 'End Date', key: 'end', width: 20 },
      { header: 'Payout Method', key: 'method', width: 16 },
    ];

    ws.columns = columns;
    styleHeader(ws, columns);

    plans.forEach(p => {
      ws.addRow({
        user: p.user?.name || 'N/A',
        phone: p.user?.phone || 'N/A',
        daily: Number(p.daily_amount),
        duration: p.duration,
        total: Number(p.daily_amount) * p.duration,
        status: p.status,
        completed: p.days_completed,
        start: new Date(p.start_date).toLocaleDateString(),
        end: new Date(p.end_date).toLocaleDateString(),
        method: p.payout_method || 'N/A',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=susupal_savings_plans_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/export/profit
router.get('/profit', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const where = {
      type: 'COMMISSION',
      status: 'SUCCESS',
      ...(date_from && date_to && {
        created_at: { gte: new Date(date_from), lte: new Date(new Date(date_to).setHours(23, 59, 59, 999)) },
      }),
    };

    const commissions = await prisma.transaction.findMany({
      where,
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { created_at: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SusuPal Admin';
    const ws = workbook.addWorksheet('Profit Report');

    const columns = [
      { header: 'User', key: 'user', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Commission (GHS)', key: 'amount', width: 20 },
      { header: 'Reference', key: 'ref', width: 32 },
      { header: 'Date', key: 'date', width: 22 },
    ];

    ws.columns = columns;
    styleHeader(ws, columns);

    let totalCommission = 0;
    commissions.forEach(c => {
      totalCommission += Number(c.amount);
      ws.addRow({
        user: c.user?.name || 'N/A',
        phone: c.user?.phone || 'N/A',
        amount: Number(c.amount),
        ref: c.reference,
        date: new Date(c.created_at).toLocaleString(),
      });
    });

    const totalRow = ws.addRow({ user: 'TOTAL', amount: totalCommission });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=susupal_profit_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;