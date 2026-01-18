// ==================== src/routes/notifications.routes.js ====================
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notifications.controller');
const { authenticateToken } = require('../middleware/auth');

// Get user notifications
router.get('/',
  authenticateToken,
  notificationController.getUserNotifications
);

// Get unread count
router.get('/unread-count',
  authenticateToken,
  notificationController.getUnreadCount
);

// Mark notification as read
router.patch('/:id/read',
  authenticateToken,
  notificationController.markAsRead
);

// Mark all as read
router.patch('/mark-all-read',
  authenticateToken,
  notificationController.markAllAsRead
);

// Delete notification
router.delete('/:id',
  authenticateToken,
  notificationController.deleteNotification
);

module.exports = router;
