// ==================== src/controllers/vehicles.controller.js ====================
const prisma = require('../config/database');
const ApiResponse = require('../utils/response');

class VehicleController {
  // Get all vehicles
  async getAllVehicles(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        equipmentType,
        search
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = {};

      if (status) where.status = status;
      if (equipmentType) where.equipmentType = equipmentType;

      if (search) {
        where.OR = [
          { unitNumber: { contains: search, mode: 'insensitive' } },
          { vin: { contains: search, mode: 'insensitive' } },
          { plateNumber: { contains: search, mode: 'insensitive' } },
          { make: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [vehicles, total] = await Promise.all([
        prisma.vehicle.findMany({
          where,
          skip,
          take,
          include: {
            assignments: {
              where: { isCurrentlyAssigned: true },
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
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.vehicle.count({ where })
      ]);

      return ApiResponse.paginated(res, vehicles, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  // Get vehicle by ID
  async getVehicleById(req, res, next) {
    try {
      const { id } = req.params;

      const vehicle = await prisma.vehicle.findUnique({
        where: { id },
        include: {
          assignments: {
            include: {
              driver: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            },
            orderBy: {
              assignedAt: 'desc'
            }
          },
          maintenanceRecords: {
            orderBy: {
              servicedAt: 'desc'
            },
            take: 10
          }
        }
      });

      if (!vehicle) {
        return ApiResponse.error(res, 'Vehicle not found', 404);
      }

      return ApiResponse.success(res, vehicle);
    } catch (error) {
      next(error);
    }
  }

  // Create vehicle
  async createVehicle(req, res, next) {
    try {
      const vehicle = await prisma.vehicle.create({
        data: req.body
      });

      return ApiResponse.success(res, vehicle, 'Vehicle created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Update vehicle
  async updateVehicle(req, res, next) {
    try {
      const { id } = req.params;

      const vehicle = await prisma.vehicle.update({
        where: { id },
        data: {
          ...req.body,
          updatedAt: new Date()
        }
      });

      return ApiResponse.success(res, vehicle, 'Vehicle updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Assign vehicle to driver
  async assignVehicle(req, res, next) {
    try {
      const { id } = req.params;
      const { driverId, notes } = req.body;

      // Check if vehicle exists
      const vehicle = await prisma.vehicle.findUnique({
        where: { id }
      });

      if (!vehicle) {
        return ApiResponse.error(res, 'Vehicle not found', 404);
      }

      // Check if driver exists
      const driver = await prisma.driver.findUnique({
        where: { id: driverId }
      });

      if (!driver) {
        return ApiResponse.error(res, 'Driver not found', 404);
      }

      // Unassign current driver if any
      await prisma.vehicleAssignment.updateMany({
        where: {
          vehicleId: id,
          isCurrentlyAssigned: true
        },
        data: {
          isCurrentlyAssigned: false,
          unassignedAt: new Date()
        }
      });

      // Create new assignment
      const assignment = await prisma.vehicleAssignment.create({
        data: {
          vehicleId: id,
          driverId,
          notes,
          isCurrentlyAssigned: true
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
          vehicle: {
            select: {
              id: true,
              unitNumber: true,
              equipmentType: true
            }
          }
        }
      });

      return ApiResponse.success(res, assignment, 'Vehicle assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  // Unassign vehicle
  async unassignVehicle(req, res, next) {
    try {
      const { id } = req.params;

      await prisma.vehicleAssignment.updateMany({
        where: {
          vehicleId: id,
          isCurrentlyAssigned: true
        },
        data: {
          isCurrentlyAssigned: false,
          unassignedAt: new Date()
        }
      });

      return ApiResponse.success(res, null, 'Vehicle unassigned successfully');
    } catch (error) {
      next(error);
    }
  }

  // Get maintenance records
  async getMaintenanceRecords(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const [records, total] = await Promise.all([
        prisma.maintenanceRecord.findMany({
          where: { vehicleId: id },
          skip,
          take,
          orderBy: {
            servicedAt: 'desc'
          }
        }),
        prisma.maintenanceRecord.count({
          where: { vehicleId: id }
        })
      ]);

      return ApiResponse.paginated(res, records, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  // Add maintenance record
  async addMaintenanceRecord(req, res, next) {
    try {
      const { id } = req.params;
      const {
        serviceType,
        description,
        servicedAt,
        servicedBy,
        cost,
        nextServiceDue,
        nextServiceMileage
      } = req.body;

      const record = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: id,
          serviceType,
          description,
          servicedAt: new Date(servicedAt),
          servicedBy,
          cost,
          nextServiceDue: nextServiceDue ? new Date(nextServiceDue) : null,
          nextServiceMileage
        }
      });

      return ApiResponse.success(res, record, 'Maintenance record added', 201);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VehicleController();