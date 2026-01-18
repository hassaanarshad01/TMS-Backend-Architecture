// ==================== src/routes/loads.routes.js ====================
const express = require('express');
const router = express.Router();
const loadController = require('../controllers/loads.controller');
const { authenticateToken, authorizeRoles, authorizeUserTypes, authorizeShipperPermissions, authorizeResourceOwner } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const { validateLoad, validateLoadUpdate } = require('../validators/load.validator');

// Get all loads (with pagination and filters)
router.get('/',
  authenticateToken,
  loadController.getAllLoads
);

// Get single load
router.get('/:id',
  authenticateToken,
  authorizeResourceOwner('LOAD'),
  loadController.getLoadById
);

// Create new load
router.post('/',
  authenticateToken,
  authorizeUserTypes('SHIPPER_USER'),
  authorizeShipperPermissions('CREATE_LOAD'),
  validateLoad,
  auditLog('CREATE', 'LOAD'),
  loadController.createLoad
);

// Update load
router.put('/:id',
  authenticateToken,
  authorizeResourceOwner('LOAD'),
  validateLoadUpdate,
  auditLog('UPDATE', 'LOAD'),
  loadController.updateLoad
);

// Delete load
router.delete('/:id',
  authenticateToken,
  authorizeUserTypes('INTERNAL_USER', 'SHIPPER_USER'),
  authorizeResourceOwner('LOAD'),
  auditLog('DELETE', 'LOAD'),
  loadController.deleteLoad
);

// Submit load for review
router.post('/:id/submit',
  authenticateToken,
  authorizeUserTypes('SHIPPER_USER'),
  authorizeResourceOwner('LOAD'),
  auditLog('SUBMIT', 'LOAD'),
  loadController.submitLoad
);

// Approve load (dispatcher only)
router.post('/:id/approve',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('APPROVE', 'LOAD'),
  loadController.approveLoad
);

// Assign load to driver
router.post('/:id/assign',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('ASSIGN', 'LOAD'),
  loadController.assignLoad
);

// Get load status history
router.get('/:id/status-history',
  authenticateToken,
  authorizeResourceOwner('LOAD'),
  loadController.getLoadStatusHistory
);

// Update load status
router.post('/:id/status',
  authenticateToken,
  auditLog('UPDATE_STATUS', 'LOAD'),
  loadController.updateLoadStatus
);

// Get load negotiations
router.get('/:id/negotiations',
  authenticateToken,
  authorizeResourceOwner('LOAD'),
  loadController.getLoadNegotiations
);

// Create negotiation (counter offer)
router.post('/:id/negotiate',
  authenticateToken,
  auditLog('NEGOTIATE', 'LOAD'),
  loadController.createNegotiation
);

// Accept negotiation
router.post('/negotiations/:negotiationId/accept',
  authenticateToken,
  auditLog('ACCEPT_NEGOTIATION', 'LOAD'),
  loadController.acceptNegotiation
);

// Reject negotiation
router.post('/negotiations/:negotiationId/reject',
  authenticateToken,
  auditLog('REJECT_NEGOTIATION', 'LOAD'),
  loadController.rejectNegotiation
);

module.exports = router;