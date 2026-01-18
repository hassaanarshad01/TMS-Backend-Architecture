// ==================== src/routes/auth.routes.js ====================
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../validators/auth.validator');

// Public routes
router.post('/register/internal', validateRegistration, authController.registerInternalUser);
router.post('/register/shipper', validateRegistration, authController.registerShipperUser);
router.post('/register/driver', validateRegistration, authController.registerDriver);

router.post('/login/internal', validateLogin, authController.loginInternalUser);
router.post('/login/shipper', validateLogin, authController.loginShipperUser);
router.post('/login/driver', validateLogin, authController.loginDriver);

router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

// Protected routes
router.post('/logout', authenticateToken, authController.logout);
router.get('/me', authenticateToken, authController.getCurrentUser);
router.put('/change-password', authenticateToken, authController.changePassword);

module.exports = router;