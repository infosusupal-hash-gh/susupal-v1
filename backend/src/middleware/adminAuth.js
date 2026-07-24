const prisma = require('../prisma/client');
const { AppError } = require('./errorHandler');

// Token-based admin authentication has been removed
// Admin routes no longer require authentication
// A default admin context is provided for operations that use req.admin

function setDefaultAdmin(req, res, next) {
  // Set a default admin context for logging and tracking
  req.admin = {
    id: 'system',
    email: 'system@admin',
    name: 'System',
    role: 'SUPER_ADMIN',
    is_active: true
  };
  req.adminSessionId = null;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}

async function logAudit(adminId, action, target, details, ipAddress) {
  try {
    if (!adminId || !action) return;
    await prisma.adminAuditLog.create({
      data: {
        admin_id: adminId,
        action,
        target: target || null,
        details: details ? JSON.stringify(details) : null,
        ip_address: ipAddress || null,
      },
    });
  } catch (error) {
    // Audit logging should never block admin actions.
    // Keep the request flowing even if the audit table is unavailable.
  }
}

module.exports = { setDefaultAdmin, requireRole, logAudit };