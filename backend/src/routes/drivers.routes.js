// ==================== src/routes/drivers.routes.js ====================
const express = require('express');
const router = express.Router();
const driverController = require('../controllers/drivers.controller');
const { authenticateToken, authorizeRoles, authorizeUserTypes } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// Get all drivers
router.get('/',
  authenticateToken,
  authorizeUserTypes('INTERNAL_USER'),
  driverController.getAllDrivers
);

// Get driver by ID
router.get('/:id',
  authenticateToken,
  driverController.getDriverById
);

// Update driver
router.put('/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('UPDATE', 'DRIVER'),
  driverController.updateDriver
);

// Deactivate driver
router.post('/:id/deactivate',
  authenticateToken,
  authorizeRoles('ADMIN'),
  auditLog('DEACTIVATE', 'DRIVER'),
  driverController.deactivateDriver
);

// Reactivate driver
router.post('/:id/activate',
  authenticateToken,
  authorizeRoles('ADMIN'),
  auditLog('ACTIVATE', 'DRIVER'),
  driverController.activateDriver
);

// Get driver assignments
router.get('/:id/assignments',
  authenticateToken,
  driverController.getDriverAssignments
);

// Get driver settlements
router.get('/:id/settlements',
  authenticateToken,
  driverController.getDriverSettlements
);

// Update driver availability
router.put('/:id/availability',
  authenticateToken,
  driverController.updateAvailability
);

// Get driver performance metrics
router.get('/:id/metrics',
  authenticateToken,
  authorizeUserTypes('INTERNAL_USER'),
  driverController.getDriverMetrics
);

// Accept load assignment (driver action)
router.post('/assignments/:assignmentId/accept',
  authenticateToken,
  authorizeUserTypes('DRIVER'),
  auditLog('ACCEPT_ASSIGNMENT', 'LOAD_ASSIGNMENT'),
  driverController.acceptAssignment
);

// Reject load assignment (driver action)
router.post('/assignments/:assignmentId/reject',
  authenticateToken,
  authorizeUserTypes('DRIVER'),
  auditLog('REJECT_ASSIGNMENT', 'LOAD_ASSIGNMENT'),
  driverController.rejectAssignment
);

module.exports = router;

