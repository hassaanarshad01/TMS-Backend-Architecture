// ==================== src/routes/invoices.routes.js ====================
const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoices.controller');
const { authenticateToken, authorizeRoles, authorizeUserTypes } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// Get all invoices
router.get('/',
  authenticateToken,
  invoiceController.getAllInvoices
);

// Get invoice by ID
router.get('/:id',
  authenticateToken,
  invoiceController.getInvoiceById
);

// Create invoice from load
router.post('/from-load/:loadId',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('CREATE', 'INVOICE'),
  invoiceController.createInvoiceFromLoad
);

// Update invoice
router.put('/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('UPDATE', 'INVOICE'),
  invoiceController.updateInvoice
);

// Issue invoice (send to shipper)
router.post('/:id/issue',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('ISSUE', 'INVOICE'),
  invoiceController.issueInvoice
);

// Mark invoice as paid
router.post('/:id/mark-paid',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('MARK_PAID', 'INVOICE'),
  invoiceController.markAsPaid
);

// Cancel invoice
router.post('/:id/cancel',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  auditLog('CANCEL', 'INVOICE'),
  invoiceController.cancelInvoice
);

// Get invoice statistics
router.get('/stats/overview',
  authenticateToken,
  authorizeRoles('ADMIN', 'ACCOUNTANT'),
  invoiceController.getInvoiceStats
);

module.exports = router;
