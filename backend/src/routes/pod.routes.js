// ==================== src/routes/pod.routes.js ====================
const express = require('express');
const router = express.Router();
const podController = require('../controllers/pod.controller');
const { authenticateToken, authorizeRoles, authorizeUserTypes } = require('../middleware/auth');
const upload = require('../middleware/upload');
const auditLog = require('../middleware/auditLog');

// Submit POD (driver only)
router.post('/submit',
  authenticateToken,
  authorizeUserTypes('DRIVER'),
  upload.fields([
    { name: 'signature', maxCount: 1 },
    { name: 'photos', maxCount: 5 }
  ]),
  auditLog('SUBMIT_POD', 'POD_DOCUMENT'),
  podController.submitPOD
);

// Get POD by load ID
router.get('/load/:loadId',
  authenticateToken,
  podController.getPODByLoadId
);

// Get POD by ID
router.get('/:id',
  authenticateToken,
  podController.getPODById
);

// Verify POD (dispatcher only)
router.post('/:id/verify',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('VERIFY_POD', 'POD_DOCUMENT'),
  podController.verifyPOD
);

// Get POD photo
router.get('/:id/photos/:photoId',
  authenticateToken,
  podController.getPODPhoto
);

module.exports = router;
