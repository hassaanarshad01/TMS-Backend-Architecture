// ==================== src/services/notification.service.js ====================
const prisma = require('../config/database');

class NotificationService {
  /**
   * Create a single notification
   * @param {Object} data - Notification data
   * @returns {Promise<Object|null>} Created notification or null on error
   */
  async createNotification(data) {
    try {
      return await prisma.notification.create({
        data: {
          recipientId: data.recipientId,
          recipientType: data.recipientType,
          type: data.type,
          title: data.title,
          message: data.message,
          relatedEntityType: data.relatedEntityType || null,
          relatedEntityId: data.relatedEntityId || null,
          actionUrl: data.actionUrl || null,
          priority: data.priority || 'NORMAL',
          metadata: data.metadata || null,
          expiresAt: data.expiresAt || null
        }
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error; // Re-throw instead of returning null
    }
  }

  /**
   * Create multiple notifications efficiently
   * @param {Array} notificationsData - Array of notification objects
   * @returns {Promise<Array>} Created notifications
   */
  async createBulkNotifications(notificationsData) {
    try {
      return await prisma.notification.createMany({
        data: notificationsData,
        skipDuplicates: true
      });
    } catch (error) {
      console.error('Failed to create bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Notify driver of new load assignment
   * @param {string} driverId - Driver ID
   * @param {Object} load - Load object
   * @param {Object} assignment - LoadAssignment object
   * @returns {Promise<Object>} Created notification
   */
  async notifyLoadAssignment(driverId, load, assignment) {
    return await this.createNotification({
      recipientId: driverId,
      recipientType: 'DRIVER',
      type: 'LOAD_ASSIGNED',
      title: 'New Load Assignment',
      message: `You have been assigned load ${load.loadNumber} from ${load.origin} to ${load.destination}`,
      relatedEntityType: 'LOAD',
      relatedEntityId: load.id,
      actionUrl: `/driver/loads/${load.id}`,
      priority: 'HIGH',
      metadata: {
        loadNumber: load.loadNumber,
        pickupDate: load.pickupDate,
        deliveryDate: load.deliveryDate,
        assignmentId: assignment.id
      }
    });
  }

  /**
   * Notify driver that load assignment was rejected
   * @param {string} driverId - Driver ID
   * @param {Object} load - Load object
   * @returns {Promise<Object>} Created notification
   */
  async notifyLoadRejected(driverId, load) {
    return await this.createNotification({
      recipientId: driverId,
      recipientType: 'DRIVER',
      type: 'LOAD_REJECTED',
      title: 'Load Assignment Rejected',
      message: `Your rejection of load ${load.loadNumber} has been recorded`,
      relatedEntityType: 'LOAD',
      relatedEntityId: load.id,
      actionUrl: `/driver/loads`,
      priority: 'NORMAL'
    });
  }

  /**
   * Notify dispatchers when driver accepts load
   * @param {Object} load - Load object
   * @param {Object} driver - Driver object
   * @returns {Promise<number>} Number of notifications created
   */
  async notifyLoadAccepted(load, driver) {
    const dispatchers = await prisma.internalUser.findMany({
      where: {
        role: { in: ['DISPATCHER', 'ADMIN'] },
        isActive: true
      },
      select: { id: true } // Only select id for efficiency
    });

    if (dispatchers.length === 0) {
      console.warn('No active dispatchers found to notify');
      return 0;
    }

    const notificationsData = dispatchers.map(dispatcher => ({
      recipientId: dispatcher.id,
      recipientType: 'INTERNAL_USER',
      type: 'LOAD_ACCEPTED',
      title: 'Load Assignment Accepted',
      message: `${driver.firstName} ${driver.lastName} accepted load ${load.loadNumber}`,
      relatedEntityType: 'LOAD',
      relatedEntityId: load.id,
      actionUrl: `/loads/${load.id}`,
      priority: 'NORMAL',
      metadata: {
        driverId: driver.id,
        driverName: `${driver.firstName} ${driver.lastName}`
      }
    }));

    const result = await this.createBulkNotifications(notificationsData);
    return result.count;
  }

  /**
   * Notify dispatchers when POD is submitted
   * @param {Object} load - Load object
   * @param {Object} podDocument - PODDocument object
   * @returns {Promise<number>} Number of notifications created
   */
  async notifyPODSubmitted(load, podDocument) {
    const dispatchers = await prisma.internalUser.findMany({
      where: {
        role: { in: ['DISPATCHER', 'ADMIN'] },
        isActive: true
      },
      select: { id: true }
    });

    if (dispatchers.length === 0) {
      console.warn('No active dispatchers found to notify');
      return 0;
    }

    const notificationsData = dispatchers.map(dispatcher => ({
      recipientId: dispatcher.id,
      recipientType: 'INTERNAL_USER',
      type: 'POD_SUBMITTED',
      title: 'POD Submitted',
      message: `Driver submitted POD for load ${load.loadNumber}`,
      relatedEntityType: 'LOAD',
      relatedEntityId: load.id,
      actionUrl: `/loads/${load.id}/pod`,
      priority: 'NORMAL',
      metadata: {
        podDocumentId: podDocument.id,
        loadNumber: load.loadNumber
      }
    }));

    const result = await this.createBulkNotifications(notificationsData);
    return result.count;
  }

  /**
   * Notify driver when POD is verified
   * @param {string} driverId - Driver ID
   * @param {Object} load - Load object
   * @param {Object} podDocument - PODDocument object
   * @returns {Promise<Object>} Created notification
   */
  async notifyPODVerified(driverId, load, podDocument) {
    return await this.createNotification({
      recipientId: driverId,
      recipientType: 'DRIVER',
      type: 'POD_VERIFIED',
      title: 'POD Verified',
      message: `Your POD for load ${load.loadNumber} has been verified`,
      relatedEntityType: 'LOAD',
      relatedEntityId: load.id,
      actionUrl: `/driver/loads/${load.id}`,
      priority: 'NORMAL'
    });
  }

  /**
   * Notify shipper users when invoice is issued
   * @param {Object} invoice - ShipperInvoice object
   * @param {Object} shipperClient - ShipperClient object
   * @returns {Promise<number>} Number of notifications created
   */
  async notifyInvoiceIssued(invoice, shipperClient) {
    const shipperUsers = await prisma.shipperUser.findMany({
      where: {
        shipperClientId: shipperClient.id,
        isActive: true
      },
      select: { id: true }
    });

    if (shipperUsers.length === 0) {
      console.warn(`No active users found for shipper client ${shipperClient.id}`);
      return 0;
    }

    const notificationsData = shipperUsers.map(user => ({
      recipientId: user.id,
      recipientType: 'SHIPPER_USER',
      type: 'INVOICE_ISSUED',
      title: 'New Invoice',
      message: `Invoice ${invoice.invoiceNumber} has been issued. Amount: $${Number(invoice.total).toFixed(2)}`,
      relatedEntityType: 'INVOICE',
      relatedEntityId: invoice.id,
      actionUrl: `/invoices/${invoice.id}`,
      priority: 'NORMAL',
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.total.toString(), // Convert Decimal to string
        dueDate: invoice.dueDate
      }
    }));

    const result = await this.createBulkNotifications(notificationsData);
    return result.count;
  }

  /**
   * Notify about overdue invoice
   * @param {Object} invoice - ShipperInvoice object
   * @param {Object} shipperClient - ShipperClient object
   * @returns {Promise<number>} Number of notifications created
   */
  async notifyInvoiceOverdue(invoice, shipperClient) {
    // Notify shipper users
    const shipperUsers = await prisma.shipperUser.findMany({
      where: {
        shipperClientId: shipperClient.id,
        isActive: true
      },
      select: { id: true }
    });

    // Notify accountants
    const accountants = await prisma.internalUser.findMany({
      where: {
        role: { in: ['ACCOUNTANT', 'ADMIN'] },
        isActive: true
      },
      select: { id: true }
    });

    const notificationsData = [
      ...shipperUsers.map(user => ({
        recipientId: user.id,
        recipientType: 'SHIPPER_USER',
        type: 'INVOICE_OVERDUE',
        title: 'Invoice Overdue',
        message: `Invoice ${invoice.invoiceNumber} is overdue. Amount: $${Number(invoice.total).toFixed(2)}`,
        relatedEntityType: 'INVOICE',
        relatedEntityId: invoice.id,
        actionUrl: `/invoices/${invoice.id}`,
        priority: 'URGENT'
      })),
      ...accountants.map(accountant => ({
        recipientId: accountant.id,
        recipientType: 'INTERNAL_USER',
        type: 'INVOICE_OVERDUE',
        title: 'Invoice Overdue',
        message: `Invoice ${invoice.invoiceNumber} for ${shipperClient.tradeName} is overdue`,
        relatedEntityType: 'INVOICE',
        relatedEntityId: invoice.id,
        actionUrl: `/invoices/${invoice.id}`,
        priority: 'HIGH'
      }))
    ];

    if (notificationsData.length === 0) return 0;

    const result = await this.createBulkNotifications(notificationsData);
    return result.count;
  }

  /**
   * Notify driver about settlement
   * @param {string} driverId - Driver ID
   * @param {Object} settlement - DriverSettlement object
   * @param {string} notificationType - 'SETTLEMENT_READY' or 'SETTLEMENT_PAID'
   * @returns {Promise<Object>} Created notification
   */
  async notifySettlement(driverId, settlement, notificationType = 'SETTLEMENT_READY') {
    const titles = {
      SETTLEMENT_READY: 'Settlement Ready for Review',
      SETTLEMENT_PAID: 'Settlement Paid'
    };

    const messages = {
      SETTLEMENT_READY: `Your settlement ${settlement.settlementNumber} is ready. Net amount: $${Number(settlement.netAmount).toFixed(2)}`,
      SETTLEMENT_PAID: `Your settlement ${settlement.settlementNumber} has been paid. Amount: $${Number(settlement.netAmount).toFixed(2)}`
    };

    return await this.createNotification({
      recipientId: driverId,
      recipientType: 'DRIVER',
      type: notificationType,
      title: titles[notificationType],
      message: messages[notificationType],
      relatedEntityType: 'SETTLEMENT',
      relatedEntityId: settlement.id,
      actionUrl: `/driver/settlements/${settlement.id}`,
      priority: notificationType === 'SETTLEMENT_PAID' ? 'HIGH' : 'NORMAL',
      metadata: {
        settlementNumber: settlement.settlementNumber,
        amount: settlement.netAmount.toString()
      }
    });
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise<Object>} Updated notification
   */
  async markAsRead(notificationId) {
    return await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} recipientId - User ID
   * @param {string} recipientType - User type
   * @returns {Promise<number>} Number of notifications updated
   */
  async markAllAsRead(recipientId, recipientType) {
    const result = await prisma.notification.updateMany({
      where: {
        recipientId,
        recipientType,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    return result.count;
  }

  /**
   * Get unread notifications for a user
   * @param {string} recipientId - User ID
   * @param {string} recipientType - User type
   * @param {number} limit - Max number of notifications to return
   * @returns {Promise<Array>} Array of notifications
   */
  async getUnreadNotifications(recipientId, recipientType, limit = 50) {
    return await prisma.notification.findMany({
      where: {
        recipientId,
        recipientType,
        isRead: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit
    });
  }

  /**
   * Get all notifications for a user (paginated)
   * @param {string} recipientId - User ID
   * @param {string} recipientType - User type
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated notifications
   */
  async getNotifications(recipientId, recipientType, options = {}) {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false
    } = options;

    const where = {
      recipientId,
      recipientType,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    };

    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [
          { isRead: 'asc' },
          { createdAt: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.notification.count({ where })
    ]);

    return {
      notifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Cleanup expired notifications (run as cron job)
   * @returns {Promise<number>} Number of deleted notifications
   */
  async cleanupExpiredNotifications() {
    try {
      const result = await prisma.notification.deleteMany({
        where: {
          expiresAt: {
            lte: new Date()
          }
        }
      });

      console.log(`Cleaned up ${result.count} expired notifications`);
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup notifications:', error);
      throw error;
    }
  }

  /**
   * Delete old read notifications (run as cron job)
   * @param {number} daysOld - Delete notifications older than this many days
   * @returns {Promise<number>} Number of deleted notifications
   */
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.notification.deleteMany({
        where: {
          isRead: true,
          readAt: {
            lte: cutoffDate
          }
        }
      });

      console.log(`Cleaned up ${result.count} old notifications (older than ${daysOld} days)`);
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup old notifications:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();