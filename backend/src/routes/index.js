// ==================== src/routes/index.js ====================
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const loadRoutes = require('./loads.routes');
const driverRoutes = require('./drivers.routes');
const vehicleRoutes = require('./vehicles.routes');
const shipperRoutes = require('./shippers.routes');
const invoiceRoutes = require('./invoices.routes');
const settlementRoutes = require('./settlements.routes');
const notificationRoutes = require('./notifications.routes');
const documentRoutes = require('./documents.routes');
const podRoutes = require('./pod.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/loads', loadRoutes);
router.use('/drivers', driverRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/shippers', shipperRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/settlements', settlementRoutes);
router.use('/notifications', notificationRoutes);
router.use('/documents', documentRoutes);
router.use('/pod', podRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'TMS API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      loads: '/api/v1/loads',
      drivers: '/api/v1/drivers',
      vehicles: '/api/v1/vehicles',
      shippers: '/api/v1/shippers',
      invoices: '/api/v1/invoices',
      settlements: '/api/v1/settlements',
      notifications: '/api/v1/notifications',
      documents: '/api/v1/documents',
      pod: '/api/v1/pod'
    }
  });
});

module.exports = router;
