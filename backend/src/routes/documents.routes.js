// ==================== src/routes/documents.routes.js ====================
const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documents.controller');
const { authenticateToken, authorizeRoles, authorizeResourceOwner } = require('../middleware/auth');
const upload = require('../middleware/upload');
const auditLog = require('../middleware/auditLog');

// Upload load document
router.post('/loads/:loadId/upload',
  authenticateToken,
  authorizeResourceOwner('LOAD'),
  upload.single('document'),
  auditLog('UPLOAD_DOCUMENT', 'LOAD_DOCUMENT'),
  documentController.uploadLoadDocument
);

// Get load documents
router.get('/loads/:loadId',
  authenticateToken,
  authorizeResourceOwner('LOAD'),
  documentController.getLoadDocuments
);

// Get single document
router.get('/:id',
  authenticateToken,
  documentController.getDocument
);

// Download document
router.get('/:id/download',
  authenticateToken,
  documentController.downloadDocument
);

// Delete document
router.delete('/:id',
  authenticateToken,
  auditLog('DELETE_DOCUMENT', 'LOAD_DOCUMENT'),
  documentController.deleteDocument
);

// Approve document (dispatcher only)
router.post('/:id/approve',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('APPROVE_DOCUMENT', 'LOAD_DOCUMENT'),
  documentController.approveDocument
);

// Reject document (dispatcher only)
router.post('/:id/reject',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('REJECT_DOCUMENT', 'LOAD_DOCUMENT'),
  documentController.rejectDocument
);

module.exports = router;
