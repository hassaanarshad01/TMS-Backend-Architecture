// ==================== src/routes/settlements.routes.js ====================
const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlements.controller');
const { authenticateToken, authorizeRoles, authorizeUserTypes } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// Get all settlements
router.get('/',
  authenticateToken,
  settlementController.getAllSettlements
);

// Get settlement by ID
router.get('/:id',
  authenticateToken,
  settlementController.getSettlementById
);

// Create settlement for load
router.post('/from-load/:loadId',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('CREATE', 'SETTLEMENT'),
  settlementController.createSettlementFromLoad
);

// Create period settlement (for multiple loads)
router.post('/create-period',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('CREATE', 'SETTLEMENT'),
  settlementController.createPeriodSettlement
);

// Approve settlement
router.post('/:id/approve',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('APPROVE', 'SETTLEMENT'),
  settlementController.approveSettlement
);

// Mark settlement as paid
router.post('/:id/mark-paid',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('MARK_PAID', 'SETTLEMENT'),
  settlementController.markAsPaid
);

// Dispute settlement
router.post('/:id/dispute',
  authenticateToken,
  authorizeUserTypes('DRIVER'),
  auditLog('DISPUTE', 'SETTLEMENT'),
  settlementController.disputeSettlement
);

// Get settlement statistics
router.get('/stats/overview',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  settlementController.getSettlementStats
);

module.exports = router;
