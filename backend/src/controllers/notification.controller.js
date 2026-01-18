// ==================== src/controllers/notifications.controller.js ====================
const prisma = require('../config/database');
const ApiResponse = require('../utils/response');

class NotificationController {
  // Get user notifications
  async getUserNotifications(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        unreadOnly = false,
        type
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = {
        recipientId: req.user.id,
        recipientType: req.user.type
      };

      if (unreadOnly === 'true') {
        where.isRead = false;
      }

      if (type) {
        where.type = type;
      }

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take,
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.notification.count({ where })
      ]);

      return ApiResponse.paginated(res, notifications, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  // Get unread count
  async getUnreadCount(req, res, next) {
    try {
      const count = await prisma.notification.count({
        where: {
          recipientId: req.user.id,
          recipientType: req.user.type,
          isRead: false
        }
      });

      return ApiResponse.success(res, { unreadCount: count });
    } catch (error) {
      next(error);
    }
  }

  // Mark as read
  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;

      const notification = await prisma.notification.findUnique({
        where: { id }
      });

      if (!notification) {
        return ApiResponse.error(res, 'Notification not found', 404);
      }

      if (notification.recipientId !== req.user.id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      return ApiResponse.success(res, updated, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  // Mark all as read
  async markAllAsRead(req, res, next) {
    try {
      await prisma.notification.updateMany({
        where: {
          recipientId: req.user.id,
          recipientType: req.user.type,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      return ApiResponse.success(res, null, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  }

  // Delete notification
  async deleteNotification(req, res, next) {
    try {
      const { id } = req.params;

      const notification = await prisma.notification.findUnique({
        where: { id }
      });

      if (!notification) {
        return ApiResponse.error(res, 'Notification not found', 404);
      }

      if (notification.recipientId !== req.user.id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      await prisma.notification.delete({
        where: { id }
      });

      return ApiResponse.success(res, null, 'Notification deleted');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
