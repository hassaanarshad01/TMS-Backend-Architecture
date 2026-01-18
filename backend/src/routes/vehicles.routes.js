// ==================== src/routes/vehicles.routes.js ====================
const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicles.controller');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');

// Get all vehicles
router.get('/',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  vehicleController.getAllVehicles
);

// Get vehicle by ID
router.get('/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  vehicleController.getVehicleById
);

// Create vehicle
router.post('/',
  authenticateToken,
  authorizeRoles('ADMIN'),
  auditLog('CREATE', 'VEHICLE'),
  vehicleController.createVehicle
);

// Update vehicle
router.put('/:id',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('UPDATE', 'VEHICLE'),
  vehicleController.updateVehicle
);

// Assign vehicle to driver
router.post('/:id/assign',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('ASSIGN_VEHICLE', 'VEHICLE'),
  vehicleController.assignVehicle
);

// Unassign vehicle
router.post('/:id/unassign',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('UNASSIGN_VEHICLE', 'VEHICLE'),
  vehicleController.unassignVehicle
);

// Get maintenance records
router.get('/:id/maintenance',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  vehicleController.getMaintenanceRecords
);

// Add maintenance record
router.post('/:id/maintenance',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('ADD_MAINTENANCE', 'VEHICLE'),
  vehicleController.addMaintenanceRecord
);

module.exports = router;
