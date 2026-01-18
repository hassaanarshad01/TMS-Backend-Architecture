// ==================== src/controllers/drivers.controller.js ====================
const prisma = require('../config/database');
const ApiResponse = require('../utils/response');

class DriverController {
  // Get all drivers
  async getAllDrivers(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        isActive,
        isAvailable,
        driverType,
        search
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = {
        deletedAt: null
      };

      if (isActive !== undefined) where.isActive = isActive === 'true';
      if (isAvailable !== undefined) where.isAvailable = isAvailable === 'true';
      if (driverType) where.driverType = driverType;

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { licenseNumber: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [drivers, total] = await Promise.all([
        prisma.driver.findMany({
          where,
          skip,
          take,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            driverType: true,
            licenseNumber: true,
            licenseState: true,
            licenseExpiry: true,
            medicalCertExpiry: true,
            isActive: true,
            isAvailable: true,
            hireDate: true,
            payType: true,
            createdAt: true,
            vehicleAssignments: {
              where: { isCurrentlyAssigned: true },
              include: {
                vehicle: {
                  select: {
                    id: true,
                    unitNumber: true,
                    equipmentType: true,
                    make: true,
                    model: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.driver.count({ where })
      ]);

      return ApiResponse.paginated(res, drivers, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  // Get driver by ID
  async getDriverById(req, res, next) {
    try {
      const { id } = req.params;

      // Check permissions
      if (req.user.type === 'DRIVER' && req.user.id !== id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const driver = await prisma.driver.findUnique({
        where: { id },
        include: {
          vehicleAssignments: {
            include: {
              vehicle: {
                select: {
                  id: true,
                  unitNumber: true,
                  equipmentType: true,
                  make: true,
                  model: true,
                  year: true,
                  status: true
                }
              }
            },
            orderBy: {
              assignedAt: 'desc'
            }
          },
          loadAssignments: {
            take: 10,
            include: {
              load: {
                select: {
                  id: true,
                  loadNumber: true,
                  status: true,
                  origin: true,
                  destination: true,
                  pickupDate: true,
                  deliveryDate: true
                }
              }
            },
            orderBy: {
              assignedAt: 'desc'
            }
          }
        }
      });

      if (!driver) {
        return ApiResponse.error(res, 'Driver not found', 404);
      }

      // Remove sensitive data if accessed by non-admin
      if (req.user.type !== 'INTERNAL_USER' || req.user.role === 'ACCOUNTANT') {
        delete driver.passwordHash;
        delete driver.payRate;
      }

      return ApiResponse.success(res, driver);
    } catch (error) {
      next(error);
    }
  }

  // Update driver
  async updateDriver(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Remove fields that shouldn't be updated via this endpoint
      delete updateData.id;
      delete updateData.email;
      delete updateData.passwordHash;
      delete updateData.createdAt;

      const driver = await prisma.driver.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          driverType: true,
          licenseNumber: true,
          licenseState: true,
          licenseExpiry: true,
          medicalCertExpiry: true,
          isActive: true,
          isAvailable: true,
          payType: true,
          payRate: true,
          updatedAt: true
        }
      });

      return ApiResponse.success(res, driver, 'Driver updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Deactivate driver
  async deactivateDriver(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const driver = await prisma.driver.update({
        where: { id },
        data: {
          isActive: false,
          isAvailable: false,
          terminationDate: new Date()
        }
      });

      return ApiResponse.success(res, driver, 'Driver deactivated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Reactivate driver
  async activateDriver(req, res, next) {
    try {
      const { id } = req.params;

      const driver = await prisma.driver.update({
        where: { id },
        data: {
          isActive: true,
          isAvailable: true,
          terminationDate: null
        }
      });

      return ApiResponse.success(res, driver, 'Driver activated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Get driver assignments
  async getDriverAssignments(req, res, next) {
    try {
      const { id } = req.params;
      const { status, page = 1, limit = 20 } = req.query;

      // Check permissions
      if (req.user.type === 'DRIVER' && req.user.id !== id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = { driverId: id };

      if (status === 'active') {
        where.load = {
          status: {
            in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'EN_ROUTE_DELIVERY', 'AT_DELIVERY']
          }
        };
      } else if (status === 'completed') {
        where.load = {
          status: {
            in: ['DELIVERED', 'POD_SUBMITTED', 'POD_PENDING', 'COMPLETED']
          }
        };
      }

      const [assignments, total] = await Promise.all([
        prisma.loadAssignment.findMany({
          where,
          skip,
          take,
          include: {
            load: {
              select: {
                id: true,
                loadNumber: true,
                status: true,
                origin: true,
                originAddress: true,
                destination: true,
                destinationAddress: true,
                pickupDate: true,
                deliveryDate: true,
                equipmentType: true,
                weightLbs: true,
                commodity: true,
                specialInstructions: true,
                driverPay: true,
                actualPickupTime: true,
                actualDeliveryTime: true
              }
            },
            assignedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: {
            assignedAt: 'desc'
          }
        }),
        prisma.loadAssignment.count({ where })
      ]);

      return ApiResponse.paginated(res, assignments, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  // Get driver settlements
  async getDriverSettlements(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, status } = req.query;

      // Check permissions
      if (req.user.type === 'DRIVER' && req.user.id !== id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = { driverId: id };
      if (status) where.status = status;

      const [settlements, total] = await Promise.all([
        prisma.driverSettlement.findMany({
          where,
          skip,
          take,
          include: {
            load: {
              select: {
                id: true,
                loadNumber: true,
                origin: true,
                destination: true
              }
            },
            deductions: true
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

  // Update driver availability
  async updateAvailability(req, res, next) {
    try {
      const { id } = req.params;
      const { isAvailable } = req.body;

      // Check permissions - driver can update own availability
      if (req.user.type === 'DRIVER' && req.user.id !== id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const driver = await prisma.driver.update({
        where: { id },
        data: { isAvailable }
      });

      return ApiResponse.success(res, { isAvailable: driver.isAvailable }, 'Availability updated');
    } catch (error) {
      next(error);
    }
  }

  // Get driver performance metrics
  async getDriverMetrics(req, res, next) {
    try {
      const { id } = req.params;

      // Get completed loads
      const completedLoads = await prisma.loadAssignment.count({
        where: {
          driverId: id,
          load: {
            status: 'COMPLETED'
          }
        }
      });

      // Get on-time delivery percentage
      const deliveredLoads = await prisma.load.findMany({
        where: {
          assignments: {
            some: {
              driverId: id
            }
          },
          status: 'COMPLETED',
          actualDeliveryTime: { not: null }
        },
        select: {
          deliveryDate: true,
          actualDeliveryTime: true
        }
      });

      const onTimeDeliveries = deliveredLoads.filter(load => 
        load.actualDeliveryTime <= load.deliveryDate
      ).length;

      const onTimePercentage = deliveredLoads.length > 0
        ? (onTimeDeliveries / deliveredLoads.length) * 100
        : 0;

      // Get total revenue generated
      const settlements = await prisma.driverSettlement.findMany({
        where: {
          driverId: id,
          status: 'PAID'
        },
        select: {
          netAmount: true
        }
      });

      const totalEarnings = settlements.reduce((sum, s) => sum + parseFloat(s.netAmount), 0);

      // Get active assignments
      const activeAssignments = await prisma.loadAssignment.count({
        where: {
          driverId: id,
          load: {
            status: {
              in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'EN_ROUTE_DELIVERY']
            }
          }
        }
      });

      const metrics = {
        completedLoads,
        onTimeDeliveryPercentage: onTimePercentage.toFixed(2),
        totalEarnings: totalEarnings.toFixed(2),
        activeAssignments
      };

      return ApiResponse.success(res, metrics);
    } catch (error) {
      next(error);
    }
  }

  // Accept assignment
  async acceptAssignment(req, res, next) {
    try {
      const { assignmentId } = req.params;

      const assignment = await prisma.loadAssignment.findUnique({
        where: { id: assignmentId },
        include: { load: true }
      });

      if (!assignment) {
        return ApiResponse.error(res, 'Assignment not found', 404);
      }

      if (assignment.driverId !== req.user.id) {
        return ApiResponse.error(res, 'Not your assignment', 403);
      }

      if (assignment.acceptedAt) {
        return ApiResponse.error(res, 'Assignment already accepted', 400);
      }

      // Update assignment
      const updatedAssignment = await prisma.loadAssignment.update({
        where: { id: assignmentId },
        data: {
          acceptedAt: new Date()
        }
      });

      // Update load status
      await prisma.load.update({
        where: { id: assignment.loadId },
        data: { status: 'ACCEPTED' }
      });

      await prisma.loadStatusHistory.create({
        data: {
          loadId: assignment.loadId,
          fromStatus: 'ASSIGNED',
          toStatus: 'ACCEPTED',
          changedById: req.user.id,
          changedByType: 'DRIVER',
          notes: 'Driver accepted assignment'
        }
      });

      return ApiResponse.success(res, updatedAssignment, 'Assignment accepted');
    } catch (error) {
      next(error);
    }
  }

  // Reject assignment
  async rejectAssignment(req, res, next) {
    try {
      const { assignmentId } = req.params;
      const { reason } = req.body;

      const assignment = await prisma.loadAssignment.findUnique({
        where: { id: assignmentId },
        include: { load: true }
      });

      if (!assignment) {
        return ApiResponse.error(res, 'Assignment not found', 404);
      }

      if (assignment.driverId !== req.user.id) {
        return ApiResponse.error(res, 'Not your assignment', 403);
      }

      if (assignment.rejectedAt) {
        return ApiResponse.error(res, 'Assignment already rejected', 400);
      }

      // Update assignment
      await prisma.loadAssignment.update({
        where: { id: assignmentId },
        data: {
          rejectedAt: new Date(),
          rejectionReason: reason
        }
      });

      // Update load back to SCHEDULED
      await prisma.load.update({
        where: { id: assignment.loadId },
        data: { status: 'SCHEDULED' }
      });

      await prisma.loadStatusHistory.create({
        data: {
          loadId: assignment.loadId,
          fromStatus: 'ASSIGNED',
          toStatus: 'SCHEDULED',
          changedById: req.user.id,
          changedByType: 'DRIVER',
          notes: `Driver rejected assignment: ${reason}`
        }
      });

      // TODO: Notify dispatcher

      return ApiResponse.success(res, null, 'Assignment rejected');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DriverController();
