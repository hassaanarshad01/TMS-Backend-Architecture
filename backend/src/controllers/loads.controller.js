// ==================== src/controllers/loads.controller.js ====================
const prisma = require('../config/database');
const ApiResponse = require('../utils/response');

class LoadController {
  // Get all loads with pagination and filters
  async getAllLoads(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        equipmentType,
        shipperClientId,
        pickupDateFrom,
        pickupDateTo,
        search
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      // Build where clause based on user type and filters
      const where = {
        deletedAt: null
      };

      // User-type specific filtering
      if (req.user.type === 'SHIPPER_USER') {
        const user = await prisma.shipperUser.findUnique({
          where: { id: req.user.id },
          select: { shipperClientId: true }
        });
        where.shipperClientId = user.shipperClientId;
      } else if (req.user.type === 'DRIVER') {
        // Drivers see only their assigned loads
        where.assignments = {
          some: {
            driverId: req.user.id
          }
        };
      }

      // Apply filters
      if (status) where.status = status;
      if (equipmentType) where.equipmentType = equipmentType;
      if (shipperClientId) where.shipperClientId = shipperClientId;

      if (pickupDateFrom || pickupDateTo) {
        where.pickupDate = {};
        if (pickupDateFrom) where.pickupDate.gte = new Date(pickupDateFrom);
        if (pickupDateTo) where.pickupDate.lte = new Date(pickupDateTo);
      }

      if (search) {
        where.OR = [
          { loadNumber: { contains: search, mode: 'insensitive' } },
          { origin: { contains: search, mode: 'insensitive' } },
          { destination: { contains: search, mode: 'insensitive' } },
          { commodity: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Execute query
      const [loads, total] = await Promise.all([
        prisma.load.findMany({
          where,
          skip,
          take,
          include: {
            shipperClient: {
              select: {
                id: true,
                legalName: true,
                tradeName: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
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
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.load.count({ where })
      ]);

      return ApiResponse.paginated(res, loads, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  // Get load by ID
  async getLoadById(req, res, next) {
    try {
      const load = await prisma.load.findUnique({
        where: { id: req.params.id },
        include: {
          shipperClient: {
            select: {
              id: true,
              legalName: true,
              tradeName: true,
              phoneNumber: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          assignments: {
            include: {
              driver: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                  driverType: true
                }
              },
              assignedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          },
          documents: {
            where: { status: { not: 'REJECTED' } },
            orderBy: { uploadedAt: 'desc' }
          },
          negotiations: {
            orderBy: { createdAt: 'desc' }
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' }
          },
          podDocuments: true,
          geoLocations: {
            orderBy: { stopSequence: 'asc' }
          }
        }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      return ApiResponse.success(res, load);
    } catch (error) {
      next(error);
    }
  }

  // Create new load
  async createLoad(req, res, next) {
    try {
      const {
        origin,
        originAddress,
        destination,
        destinationAddress,
        equipmentType,
        weightLbs,
        distanceMiles,
        commodity,
        specialInstructions,
        pickupDate,
        pickupTimeStart,
        pickupTimeEnd,
        deliveryDate,
        deliveryTimeStart,
        deliveryTimeEnd,
        shipperRate
      } = req.body;

      // Get shipper client ID
      const user = await prisma.shipperUser.findUnique({
        where: { id: req.user.id },
        select: { shipperClientId: true }
      });

      // Generate load number
      const year = new Date().getFullYear();
      const lastLoad = await prisma.load.findFirst({
        where: {
          loadNumber: {
            startsWith: `LOAD-${year}-`
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      let loadNumber;
      if (lastLoad) {
        const lastNumber = parseInt(lastLoad.loadNumber.split('-')[2]);
        loadNumber = `LOAD-${year}-${String(lastNumber + 1).padStart(4, '0')}`;
      } else {
        loadNumber = `LOAD-${year}-0001`;
      }

      // Create load
      const load = await prisma.load.create({
        data: {
          shipperClientId: user.shipperClientId,
          createdById: req.user.id,
          loadNumber,
          origin,
          originAddress,
          destination,
          destinationAddress,
          equipmentType,
          weightLbs,
          distanceMiles,
          commodity,
          specialInstructions,
          pickupDate: new Date(pickupDate),
          pickupTimeStart: pickupTimeStart ? new Date(pickupTimeStart) : null,
          pickupTimeEnd: pickupTimeEnd ? new Date(pickupTimeEnd) : null,
          deliveryDate: new Date(deliveryDate),
          deliveryTimeStart: deliveryTimeStart ? new Date(deliveryTimeStart) : null,
          deliveryTimeEnd: deliveryTimeEnd ? new Date(deliveryTimeEnd) : null,
          shipperRate,
          status: 'DRAFT'
        },
        include: {
          shipperClient: {
            select: {
              id: true,
              legalName: true,
              tradeName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Create initial status history
      await prisma.loadStatusHistory.create({
        data: {
          loadId: load.id,
          fromStatus: null,
          toStatus: 'DRAFT',
          changedById: req.user.id,
          changedByType: req.user.type,
          notes: 'Load created'
        }
      });

      return ApiResponse.success(res, load, 'Load created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Update load
  async updateLoad(req, res, next) {
    try {
      const { id } = req.params;

      // Check if load exists and user has permission
      const existingLoad = await prisma.load.findUnique({
        where: { id }
      });

      if (!existingLoad) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      // Only allow updates if load is in DRAFT or NEGOTIATING status
      if (!['DRAFT', 'NEGOTIATING'].includes(existingLoad.status)) {
        return ApiResponse.error(res, 'Load cannot be updated in current status', 400);
      }

      // Store old data for audit
      req.auditChanges = {
        before: existingLoad,
        after: req.body,
        fields: Object.keys(req.body)
      };

      const updatedLoad = await prisma.load.update({
        where: { id },
        data: {
          ...req.body,
          updatedAt: new Date()
        },
        include: {
          shipperClient: {
            select: {
              id: true,
              legalName: true,
              tradeName: true
            }
          }
        }
      });

      return ApiResponse.success(res, updatedLoad, 'Load updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Delete load (soft delete)
  async deleteLoad(req, res, next) {
    try {
      const { id } = req.params;

      const load = await prisma.load.findUnique({
        where: { id }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      // Only allow deletion if load is in DRAFT or CANCELLED status
      if (!['DRAFT', 'CANCELLED'].includes(load.status)) {
        return ApiResponse.error(res, 'Load cannot be deleted in current status', 400);
      }

      await prisma.load.update({
        where: { id },
        data: {
          deletedAt: new Date()
        }
      });

      return ApiResponse.success(res, null, 'Load deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  // Submit load for review
  async submitLoad(req, res, next) {
    try {
      const { id } = req.params;

      const load = await prisma.load.findUnique({
        where: { id }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      if (load.status !== 'DRAFT') {
        return ApiResponse.error(res, 'Load can only be submitted from DRAFT status', 400);
      }

      // Update load status
      const updatedLoad = await prisma.load.update({
        where: { id },
        data: {
          status: 'PENDING_REVIEW'
        }
      });

      // Create status history
      await prisma.loadStatusHistory.create({
        data: {
          loadId: id,
          fromStatus: 'DRAFT',
          toStatus: 'PENDING_REVIEW',
          changedById: req.user.id,
          changedByType: req.user.type,
          notes: 'Load submitted for review'
        }
      });

      // TODO: Create notification for dispatchers

      return ApiResponse.success(res, updatedLoad, 'Load submitted for review');
    } catch (error) {
      next(error);
    }
  }

  // Approve load
  async approveLoad(req, res, next) {
    try {
      const { id } = req.params;
      const { driverPay, notes } = req.body;

      const load = await prisma.load.findUnique({
        where: { id }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      if (load.status !== 'RATE_APPROVED') {
        return ApiResponse.error(res, 'Load must have approved rate first', 400);
      }

      const updatedLoad = await prisma.load.update({
        where: { id },
        data: {
          status: 'SCHEDULED',
          driverPay
        }
      });

      await prisma.loadStatusHistory.create({
        data: {
          loadId: id,
          fromStatus: 'RATE_APPROVED',
          toStatus: 'SCHEDULED',
          changedById: req.user.id,
          changedByType: req.user.type,
          notes: notes || 'Load approved and scheduled'
        }
      });

      return ApiResponse.success(res, updatedLoad, 'Load approved successfully');
    } catch (error) {
      next(error);
    }
  }

  // Assign load to driver
  async assignLoad(req, res, next) {
    try {
      const { id } = req.params;
      const { driverId, estimatedPickup, estimatedDelivery, notes } = req.body;

      const load = await prisma.load.findUnique({
        where: { id }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      if (load.status !== 'SCHEDULED') {
        return ApiResponse.error(res, 'Load must be scheduled before assignment', 400);
      }

      // Check if driver exists and is available
      const driver = await prisma.driver.findUnique({
        where: { id: driverId }
      });

      if (!driver) {
        return ApiResponse.error(res, 'Driver not found', 404);
      }

      if (!driver.isActive || !driver.isAvailable) {
        return ApiResponse.error(res, 'Driver is not available', 400);
      }

      // Create assignment
      const assignment = await prisma.loadAssignment.create({
        data: {
          loadId: id,
          driverId,
          assignedById: req.user.id,
          estimatedPickup: estimatedPickup ? new Date(estimatedPickup) : null,
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
          notes
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        }
      });

      // Update load status
      await prisma.load.update({
        where: { id },
        data: { status: 'ASSIGNED' }
      });

      await prisma.loadStatusHistory.create({
        data: {
          loadId: id,
          fromStatus: 'SCHEDULED',
          toStatus: 'ASSIGNED',
          changedById: req.user.id,
          changedByType: req.user.type,
          notes: `Load assigned to driver ${driver.firstName} ${driver.lastName}`
        }
      });

      // TODO: Create notification for driver

      return ApiResponse.success(res, assignment, 'Load assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  // Get load status history
  async getLoadStatusHistory(req, res, next) {
    try {
      const { id } = req.params;

      const history = await prisma.loadStatusHistory.findMany({
        where: { loadId: id },
        orderBy: { createdAt: 'desc' }
      });

      return ApiResponse.success(res, history);
    } catch (error) {
      next(error);
    }
  }

  // Update load status (for drivers mainly)
  async updateLoadStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, notes, gpsLat, gpsLng } = req.body;

      const load = await prisma.load.findUnique({
        where: { id }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      // Validate status transition
      const allowedTransitions = {
        'ACCEPTED': ['EN_ROUTE_PICKUP'],
        'EN_ROUTE_PICKUP': ['AT_PICKUP'],
        'AT_PICKUP': ['LOADED'],
        'LOADED': ['EN_ROUTE_DELIVERY'],
        'EN_ROUTE_DELIVERY': ['AT_DELIVERY'],
        'AT_DELIVERY': ['DELIVERED']
      };

      if (allowedTransitions[load.status] && !allowedTransitions[load.status].includes(status)) {
        return ApiResponse.error(res, `Invalid status transition from ${load.status} to ${status}`, 400);
      }

      // Update load
      const updateData = { status };
      if (status === 'LOADED') {
        updateData.actualPickupTime = new Date();
      } else if (status === 'DELIVERED') {
        updateData.actualDeliveryTime = new Date();
      }

      const updatedLoad = await prisma.load.update({
        where: { id },
        data: updateData
      });

      // Create status event
      await prisma.loadStatusEvent.create({
        data: {
          loadId: id,
          driverId: req.user.type === 'DRIVER' ? req.user.id : null,
          status,
          notes,
          gpsLat,
          gpsLng
        }
      });

      // Create status history
      await prisma.loadStatusHistory.create({
        data: {
          loadId: id,
          fromStatus: load.status,
          toStatus: status,
          changedById: req.user.id,
          changedByType: req.user.type,
          notes
        }
      });

      return ApiResponse.success(res, updatedLoad, 'Load status updated');
    } catch (error) {
      next(error);
    }
  }

  // Get load negotiations
  async getLoadNegotiations(req, res, next) {
    try {
      const { id } = req.params;

      const negotiations = await prisma.loadNegotiation.findMany({
        where: { loadId: id },
        include: {
          handledBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return ApiResponse.success(res, negotiations);
    } catch (error) {
      next(error);
    }
  }

  // Create negotiation
  async createNegotiation(req, res, next) {
    try {
      const { id } = req.params;
      const { proposedRate, counterRate, notes } = req.body;

      const load = await prisma.load.findUnique({
        where: { id }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      const negotiation = await prisma.loadNegotiation.create({
        data: {
          loadId: id,
          proposedRate,
          counterRate,
          notes,
          initiatedBy: req.user.type === 'INTERNAL_USER' ? 'DISPATCHER' : 'SHIPPER',
          handledById: req.user.type === 'INTERNAL_USER' ? req.user.id : null,
          status: counterRate ? 'COUNTER_OFFERED' : 'PENDING'
        }
      });

      // Update load status if needed
      if (load.status === 'PENDING_REVIEW') {
        await prisma.load.update({
          where: { id },
          data: { status: 'NEGOTIATING' }
        });
      }

      return ApiResponse.success(res, negotiation, 'Negotiation created', 201);
    } catch (error) {
      next(error);
    }
  }

  // Accept negotiation
  async acceptNegotiation(req, res, next) {
    try {
      const { negotiationId } = req.params;

      const negotiation = await prisma.loadNegotiation.findUnique({
        where: { id: negotiationId },
        include: { load: true }
      });

      if (!negotiation) {
        return ApiResponse.error(res, 'Negotiation not found', 404);
      }

      if (negotiation.status !== 'PENDING' && negotiation.status !== 'COUNTER_OFFERED') {
        return ApiResponse.error(res, 'Negotiation already resolved', 400);
      }

      // Update negotiation
      const updatedNegotiation = await prisma.loadNegotiation.update({
        where: { id: negotiationId },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date()
        }
      });

      // Update load with agreed rate
      const agreedRate = negotiation.counterRate || negotiation.proposedRate;
      await prisma.load.update({
        where: { id: negotiation.loadId },
        data: {
          status: 'RATE_APPROVED',
          shipperRate: agreedRate,
          approvedNegotiationId: negotiationId
        }
      });

      return ApiResponse.success(res, updatedNegotiation, 'Negotiation accepted');
    } catch (error) {
      next(error);
    }
  }

  // Reject negotiation
  async rejectNegotiation(req, res, next) {
    try {
      const { negotiationId } = req.params;
      const { notes } = req.body;

      const negotiation = await prisma.loadNegotiation.findUnique({
        where: { id: negotiationId }
      });

      if (!negotiation) {
        return ApiResponse.error(res, 'Negotiation not found', 404);
      }

      const updatedNegotiation = await prisma.loadNegotiation.update({
        where: { id: negotiationId },
        data: {
          status: 'REJECTED',
          respondedAt: new Date(),
          notes: notes || negotiation.notes
        }
      });

      return ApiResponse.success(res, updatedNegotiation, 'Negotiation rejected');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LoadController();