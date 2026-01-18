// ==================== src/middleware/auth.js ====================
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to request
    req.user = {
      id: decoded.id,
      type: decoded.type, // 'INTERNAL_USER', 'SHIPPER_USER', 'DRIVER'
      email: decoded.email,
      role: decoded.role // For internal users
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Role-based access control for Internal Users
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (req.user.type !== 'INTERNAL_USER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Internal user required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

// User type restriction (INTERNAL_USER, SHIPPER_USER, DRIVER)
const authorizeUserTypes = (...allowedTypes) => {
  return (req, res, next) => {
    if (!allowedTypes.includes(req.user.type)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required user types: ${allowedTypes.join(', ')}`
      });
    }

    next();
  };
};

// Permission-based access control for Shipper Users
const authorizeShipperPermissions = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (req.user.type !== 'SHIPPER_USER') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Shipper user required.'
        });
      }

      // Fetch user permissions
      const permissions = await prisma.shipperUserPermission.findMany({
        where: {
          shipperUserId: req.user.id
        },
        select: {
          permission: true
        }
      });

      const userPermissions = permissions.map(p => p.permission);

      // Check if user has all required permissions
      const hasPermission = requiredPermissions.every(perm => 
        userPermissions.includes(perm)
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Missing required permissions: ${requiredPermissions.join(', ')}`
        });
      }

      // Attach permissions to request for later use
      req.user.permissions = userPermissions;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Check if user owns the resource (for shipper users)
const authorizeResourceOwner = (resourceType) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;

      if (req.user.type === 'INTERNAL_USER') {
        // Internal users can access all resources
        return next();
      }

      if (req.user.type === 'SHIPPER_USER') {
        // Check if shipper user owns the resource
        let resource;
        
        switch (resourceType) {
          case 'LOAD':
            resource = await prisma.load.findUnique({
              where: { id: resourceId },
              select: { shipperClientId: true }
            });
            
            const shipperUser = await prisma.shipperUser.findUnique({
              where: { id: req.user.id },
              select: { shipperClientId: true }
            });

            if (resource?.shipperClientId !== shipperUser?.shipperClientId) {
              return res.status(403).json({
                success: false,
                message: 'Access denied. You do not own this resource.'
              });
            }
            break;

          case 'INVOICE':
            resource = await prisma.shipperInvoice.findUnique({
              where: { id: resourceId },
              select: { shipperClientId: true }
            });
            
            const user = await prisma.shipperUser.findUnique({
              where: { id: req.user.id },
              select: { shipperClientId: true }
            });

            if (resource?.shipperClientId !== user?.shipperClientId) {
              return res.status(403).json({
                success: false,
                message: 'Access denied. You do not own this resource.'
              });
            }
            break;

          default:
            return res.status(400).json({
              success: false,
              message: 'Invalid resource type'
            });
        }
      }

      if (req.user.type === 'DRIVER') {
        // Drivers can only access their own assignments
        let resource;
        
        switch (resourceType) {
          case 'LOAD_ASSIGNMENT':
            resource = await prisma.loadAssignment.findUnique({
              where: { id: resourceId },
              select: { driverId: true }
            });

            if (resource?.driverId !== req.user.id) {
              return res.status(403).json({
                success: false,
                message: 'Access denied. This is not your assignment.'
              });
            }
            break;

          case 'SETTLEMENT':
            resource = await prisma.driverSettlement.findUnique({
              where: { id: resourceId },
              select: { driverId: true }
            });

            if (resource?.driverId !== req.user.id) {
              return res.status(403).json({
                success: false,
                message: 'Access denied. This is not your settlement.'
              });
            }
            break;

          default:
            return res.status(400).json({
              success: false,
              message: 'Invalid resource type'
            });
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Optional authentication (for public endpoints that can work with or without auth)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      type: decoded.type,
      email: decoded.email,
      role: decoded.role
    };
  } catch (error) {
    req.user = null;
  }

  next();
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeUserTypes,
  authorizeShipperPermissions,
  authorizeResourceOwner,
  optionalAuth
};

// ==================== USAGE EXAMPLES ====================
/*
// Example 1: Protect route with authentication only
router.get('/profile', authenticateToken, getProfile);

// Example 2: Only allow ADMIN and DISPATCHER roles
router.post('/loads/assign', 
  authenticateToken, 
  authorizeRoles('ADMIN', 'DISPATCHER'),
  assignLoadToDriver
);

// Example 3: Only allow internal users (any role)
router.get('/reports/daily',
  authenticateToken,
  authorizeUserTypes('INTERNAL_USER'),
  getDailyReport
);

// Example 4: Shipper user with specific permissions
router.post('/loads',
  authenticateToken,
  authorizeShipperPermissions('CREATE_LOAD'),
  createLoad
);

// Example 5: Resource ownership check
router.get('/loads/:id',
  authenticateToken,
  authorizeResourceOwner('LOAD'),
  getLoadById
);

// Example 6: Combine multiple middlewares
router.put('/loads/:id/approve',
  authenticateToken,
  authorizeRoles('ADMIN', 'DISPATCHER'),
  auditLog('APPROVE', 'LOAD'),
  approveLoad
);

// Example 7: Complex permission check
router.delete('/loads/:id',
  authenticateToken,
  authorizeUserTypes('INTERNAL_USER', 'SHIPPER_USER'),
  async (req, res, next) => {
    if (req.user.type === 'SHIPPER_USER') {
      // Check DELETE_LOAD permission
      return authorizeShipperPermissions('DELETE_LOAD')(req, res, next);
    }
    next();
  },
  authorizeResourceOwner('LOAD'),
  deleteLoad
);
*/