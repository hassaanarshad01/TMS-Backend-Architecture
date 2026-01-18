// ==================== src/controllers/settlements.controller.js ====================
const prisma = require('../config/database');
const ApiResponse = require('../utils/response');
const notificationService = require('../services/notification.service');

class SettlementController {
  /**
   * Get all settlements with filtering and pagination
   */
  async getAllSettlements(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        driverId,
        status,
        dateFrom,
        dateTo
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = {};

      // Driver can only see their own settlements
      if (req.user.type === 'DRIVER') {
        where.driverId = req.user.id;
      } else if (driverId) {
        where.driverId = driverId;
      }

      if (status) where.status = status;

      if (dateFrom || dateTo) {
        where.periodEnd = {};
        if (dateFrom) where.periodEnd.gte = new Date(dateFrom);
        if (dateTo) where.periodEnd.lte = new Date(dateTo);
      }

      const [settlements, total] = await Promise.all([
        prisma.driverSettlement.findMany({
          where,
          skip,
          take,
          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                driverType: true
              }
            },
            load: {
              select: {
                id: true,
                loadNumber: true,
                origin: true,
                destination: true
              }
            },
            deductions: {
              orderBy: {
                createdAt: 'asc'
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.driverSettlement.count({ where })
      ]);

      return ApiResponse.paginated(res, settlements, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get settlement by ID
   */
  async getSettlementById(req, res, next) {
    try {
      const { id } = req.params;

      const settlement = await prisma.driverSettlement.findUnique({
        where: { id },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              driverType: true,
              payType: true,
              payRate: true
            }
          },
          load: {
            select: {
              id: true,
              loadNumber: true,
              origin: true,
              destination: true,
              pickupDate: true,
              deliveryDate: true,
              actualPickupTime: true,
              actualDeliveryTime: true,
              distanceMiles: true,
              driverPay: true
            }
          },
          deductions: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!settlement) {
        return ApiResponse.error(res, 'Settlement not found', 404);
      }

      // Check access - drivers can only see their own
      if (req.user.type === 'DRIVER' && settlement.driverId !== req.user.id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      return ApiResponse.success(res, settlement);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create settlement from a single load
   */
  async createSettlementFromLoad(req, res, next) {
    try {
      const { loadId } = req.params;
      const { deductions = [] } = req.body;

      // Get load with assignment
      const load = await prisma.load.findUnique({
        where: { id: loadId },
        include: {
          assignments: {
            where: { 
              acceptedAt: { not: null },
              rejectedAt: null
            },
            include: { 
              driver: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      if (load.status !== 'COMPLETED') {
        return ApiResponse.error(res, 'Load must be completed before creating settlement', 400);
      }

      if (!load.driverPay) {
        return ApiResponse.error(res, 'Driver pay not set for this load', 400);
      }

      const assignment = load.assignments[0];
      if (!assignment) {
        return ApiResponse.error(res, 'No accepted driver assignment found', 404);
      }

      // Check if settlement already exists for this load
      const existingSettlement = await prisma.driverSettlement.findFirst({
        where: {
          loadId,
          status: { notIn: ['DISPUTED'] }
        }
      });

      if (existingSettlement) {
        return ApiResponse.error(res, 'Settlement already exists for this load', 400);
      }

      // Generate settlement number
      const settlementNumber = await this._generateSettlementNumber();

      // Calculate amounts - convert Decimal to number
      const grossAmount = Number(load.driverPay);
      let totalDeductions = 0;

      // Validate and calculate deductions
      const validatedDeductions = deductions.map(deduction => {
        const amount = parseFloat(deduction.amount);
        if (isNaN(amount) || amount < 0) {
          throw new Error(`Invalid deduction amount: ${deduction.amount}`);
        }
        totalDeductions += amount;
        
        return {
          description: deduction.description,
          amount: amount,
          category: deduction.category || 'OTHER'
        };
      });

      const netAmount = grossAmount - totalDeductions;

      if (netAmount < 0) {
        return ApiResponse.error(res, 'Deductions exceed gross amount', 400);
      }

      // Create settlement with deductions
      const settlement = await prisma.driverSettlement.create({
        data: {
          driverId: assignment.driverId,
          loadId,
          settlementNumber,
          periodStart: load.actualPickupTime || load.pickupDate,
          periodEnd: load.actualDeliveryTime || load.deliveryDate,
          grossAmount,
          totalDeductions,
          netAmount,
          status: 'PENDING',
          deductions: {
            create: validatedDeductions
          }
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          load: {
            select: {
              id: true,
              loadNumber: true,
              origin: true,
              destination: true
            }
          },
          deductions: true
        }
      });

      // Notify driver
      await notificationService.notifySettlement(
        assignment.driverId,
        settlement,
        'SETTLEMENT_READY'
      );

      return ApiResponse.success(res, settlement, 'Settlement created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create period settlement for multiple loads
   */
  async createPeriodSettlement(req, res, next) {
    try {
      const {
        driverId,
        periodStart,
        periodEnd,
        deductions = []
      } = req.body;

      if (!driverId || !periodStart || !periodEnd) {
        return ApiResponse.error(res, 'driverId, periodStart, and periodEnd are required', 400);
      }

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      if (startDate >= endDate) {
        return ApiResponse.error(res, 'periodStart must be before periodEnd', 400);
      }

      // Get all completed loads in period for this driver
      const loads = await prisma.load.findMany({
        where: {
          status: 'COMPLETED',
          actualDeliveryTime: {
            gte: startDate,
            lte: endDate
          },
          assignments: {
            some: {
              driverId,
              acceptedAt: { not: null },
              rejectedAt: null
            }
          },
          driverPay: { not: null }
        },
        select: {
          id: true,
          loadNumber: true,
          driverPay: true
        }
      });

      if (loads.length === 0) {
        return ApiResponse.error(res, 'No completed loads found in period for this driver', 404);
      }

      // Check if any loads already have settlements
      const existingSettlements = await prisma.driverSettlement.findMany({
        where: {
          loadId: { in: loads.map(l => l.id) },
          status: { notIn: ['DISPUTED'] }
        },
        select: { loadId: true }
      });

      if (existingSettlements.length > 0) {
        const settledLoadIds = existingSettlements.map(s => s.loadId);
        return ApiResponse.error(
          res, 
          `Some loads already have settlements: ${settledLoadIds.join(', ')}`, 
          400
        );
      }

      // Calculate gross amount
      const grossAmount = loads.reduce((sum, load) => 
        sum + Number(load.driverPay), 0
      );

      // Validate and calculate deductions
      let totalDeductions = 0;
      const validatedDeductions = deductions.map(deduction => {
        const amount = parseFloat(deduction.amount);
        if (isNaN(amount) || amount < 0) {
          throw new Error(`Invalid deduction amount: ${deduction.amount}`);
        }
        totalDeductions += amount;
        
        return {
          description: deduction.description,
          amount: amount,
          category: deduction.category || 'OTHER'
        };
      });

      const netAmount = grossAmount - totalDeductions;

      if (netAmount < 0) {
        return ApiResponse.error(res, 'Deductions exceed gross amount', 400);
      }

      // Generate settlement number
      const settlementNumber = await this._generateSettlementNumber();

      // Create settlement
      const settlement = await prisma.driverSettlement.create({
        data: {
          driverId,
          settlementNumber,
          periodStart: startDate,
          periodEnd: endDate,
          grossAmount,
          totalDeductions,
          netAmount,
          status: 'PENDING',
          notes: `Period settlement for ${loads.length} loads: ${loads.map(l => l.loadNumber).join(', ')}`,
          deductions: {
            create: validatedDeductions
          }
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          deductions: true
        }
      });

      // Notify driver
      await notificationService.notifySettlement(
        driverId,
        settlement,
        'SETTLEMENT_READY'
      );

      return ApiResponse.success(res, settlement, 'Period settlement created', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Approve settlement
   */
  async approveSettlement(req, res, next) {
    try {
      const { id } = req.params;

      const settlement = await prisma.driverSettlement.findUnique({
        where: { id },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!settlement) {
        return ApiResponse.error(res, 'Settlement not found', 404);
      }

      if (settlement.status !== 'PENDING') {
        return ApiResponse.error(res, 'Only pending settlements can be approved', 400);
      }

      const updated = await prisma.driverSettlement.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: req.user.id
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          deductions: true
        }
      });

      // Notify driver that settlement is approved
      await notificationService.createNotification({
        recipientId: settlement.driverId,
        recipientType: 'DRIVER',
        type: 'SETTLEMENT_READY',
        title: 'Settlement Approved',
        message: `Your settlement ${settlement.settlementNumber} has been approved. Amount: $${Number(settlement.netAmount).toFixed(2)}`,
        relatedEntityType: 'SETTLEMENT',
        relatedEntityId: settlement.id,
        actionUrl: `/driver/settlements/${settlement.id}`,
        priority: 'NORMAL'
      });

      return ApiResponse.success(res, updated, 'Settlement approved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark settlement as paid
   */
  async markAsPaid(req, res, next) {
    try {
      const { id } = req.params;
      const { paymentMethod, paymentReference, paidAt } = req.body;

      if (!paymentMethod) {
        return ApiResponse.error(res, 'Payment method is required', 400);
      }

      const settlement = await prisma.driverSettlement.findUnique({
        where: { id },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!settlement) {
        return ApiResponse.error(res, 'Settlement not found', 404);
      }

      if (settlement.status !== 'APPROVED') {
        return ApiResponse.error(res, 'Settlement must be approved before marking as paid', 400);
      }

      const updated = await prisma.driverSettlement.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          paymentMethod,
          paymentReference
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          deductions: true
        }
      });

      // Notify driver
      await notificationService.notifySettlement(
        settlement.driverId,
        updated,
        'SETTLEMENT_PAID'
      );

      return ApiResponse.success(res, updated, 'Settlement marked as paid');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Dispute settlement (driver only)
   */
  async disputeSettlement(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        return ApiResponse.error(res, 'Dispute reason is required', 400);
      }

      const settlement = await prisma.driverSettlement.findUnique({
        where: { id }
      });

      if (!settlement) {
        return ApiResponse.error(res, 'Settlement not found', 404);
      }

      // Only driver can dispute their own settlement
      if (req.user.type !== 'DRIVER' || settlement.driverId !== req.user.id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      if (settlement.status === 'PAID') {
        return ApiResponse.error(res, 'Cannot dispute paid settlement', 400);
      }

      const updated = await prisma.driverSettlement.update({
        where: { id },
        data: {
          status: 'DISPUTED',
          notes: `DISPUTED by driver on ${new Date().toISOString()}:\n${reason}\n\n${settlement.notes || ''}`
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          deductions: true
        }
      });

      // Notify accountants about the dispute
      const accountants = await prisma.internalUser.findMany({
        where: {
          role: { in: ['ACCOUNTANT', 'ADMIN'] },
          isActive: true
        },
        select: { id: true }
      });

      const notificationsData = accountants.map(accountant => ({
        recipientId: accountant.id,
        recipientType: 'INTERNAL_USER',
        type: 'SYSTEM_ANNOUNCEMENT', // You might want to add SETTLEMENT_DISPUTED to NotificationType enum
        title: 'Settlement Disputed',
        message: `Driver ${updated.driver.firstName} ${updated.driver.lastName} disputed settlement ${settlement.settlementNumber}`,
        relatedEntityType: 'SETTLEMENT',
        relatedEntityId: settlement.id,
        actionUrl: `/settlements/${settlement.id}`,
        priority: 'HIGH'
      }));

      if (notificationsData.length > 0) {
        await notificationService.createBulkNotifications(notificationsData);
      }

      return ApiResponse.success(res, updated, 'Settlement disputed');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get settlement statistics
   */
  async getSettlementStats(req, res, next) {
    try {
      const { driverId, dateFrom, dateTo } = req.query;

      const where = {};

      // Driver can only see their own stats
      if (req.user.type === 'DRIVER') {
        where.driverId = req.user.id;
      } else if (driverId) {
        where.driverId = driverId;
      }

      if (dateFrom || dateTo) {
        where.periodEnd = {};
        if (dateFrom) where.periodEnd.gte = new Date(dateFrom);
        if (dateTo) where.periodEnd.lte = new Date(dateTo);
      }

      const [
        totalSettlements,
        paidSettlements,
        pendingSettlements,
        approvedSettlements,
        disputedSettlements
      ] = await Promise.all([
        prisma.driverSettlement.count({ where }),
        prisma.driverSettlement.count({ where: { ...where, status: 'PAID' } }),
        prisma.driverSettlement.count({ where: { ...where, status: 'PENDING' } }),
        prisma.driverSettlement.count({ where: { ...where, status: 'APPROVED' } }),
        prisma.driverSettlement.count({ where: { ...where, status: 'DISPUTED' } })
      ]);

      // Calculate payment totals
      const settlements = await prisma.driverSettlement.findMany({
        where,
        select: { 
          netAmount: true, 
          grossAmount: true,
          totalDeductions: true,
          status: true 
        }
      });

      const totalPaid = settlements
        .filter(s => s.status === 'PAID')
        .reduce((sum, s) => sum + Number(s.netAmount), 0);

      const totalPending = settlements
        .filter(s => s.status === 'PENDING' || s.status === 'APPROVED')
        .reduce((sum, s) => sum + Number(s.netAmount), 0);

      const totalGross = settlements
        .reduce((sum, s) => sum + Number(s.grossAmount), 0);

      const totalDeductions = settlements
        .reduce((sum, s) => sum + Number(s.totalDeductions), 0);

      const stats = {
        totalSettlements,
        paidSettlements,
        pendingSettlements,
        approvedSettlements,
        disputedSettlements,
        totalPaid: Number(totalPaid).toFixed(2),
        totalPending: Number(totalPending).toFixed(2),
        totalGross: Number(totalGross).toFixed(2),
        totalDeductions: Number(totalDeductions).toFixed(2)
      };

      return ApiResponse.success(res, stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper: Generate unique settlement number
   * @private
   */
  async _generateSettlementNumber() {
    const year = new Date().getFullYear();
    
    const lastSettlement = await prisma.driverSettlement.findFirst({
      where: {
        settlementNumber: {
          startsWith: `SETTLE-${year}-`
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        settlementNumber: true
      }
    });

    if (lastSettlement) {
      const lastNumber = parseInt(lastSettlement.settlementNumber.split('-')[2]);
      return `SETTLE-${year}-${String(lastNumber + 1).padStart(4, '0')}`;
    }
    
    return `SETTLE-${year}-0001`;
  }
}

module.exports = new SettlementController();