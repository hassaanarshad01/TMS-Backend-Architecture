// ==================== src/middleware/auditLog.js ====================
const prisma = require('../config/database');

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to capture response
    res.json = function (data) {
      // Only log on successful operations
      if (data.success !== false && req.user) {
        // Create audit log asynchronously (don't block response)
        prisma.auditLog.create({
          data: {
            userId: req.user.id,
            userType: req.user.type,
            userEmail: req.user.email,
            action,
            entityType,
            entityId: data.data?.id || req.params.id || null,
            changes: req.auditChanges || null,
            metadata: {
              route: req.path,
              params: req.params,
              query: req.query
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            requestPath: req.originalUrl,
            requestMethod: req.method
          }
        }).catch(err => {
          console.error('Failed to create audit log:', err);
        });
      }

      return originalJson(data);
    };

    next();
  };
};

module.exports = auditLog;