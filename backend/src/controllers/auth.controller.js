// ==================== src/controllers/auth.controller.js ====================
const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const ApiResponse = require('../utils/response');

class AuthController {
  // Register Internal User (Admin/Dispatcher/Accountant)
  async registerInternalUser(req, res, next) {
    try {
      const { email, password, firstName, lastName, role, phone } = req.body;

      // Check if user exists
      const existingUser = await prisma.internalUser.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        return ApiResponse.error(res, 'Email already registered', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.internalUser.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
          role,
          phone: phone || null
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true
        }
      });

      // Generate tokens
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: 'INTERNAL_USER',
        role: user.role
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        type: 'INTERNAL_USER'
      });

      return ApiResponse.success(res, {
        user,
        token,
        refreshToken
      }, 'User registered successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Register Shipper User
  async registerShipperUser(req, res, next) {
    try {
      const { email, password, firstName, lastName, shipperClientId, phone, jobTitle } = req.body;

      // Check if shipper client exists
      const shipperClient = await prisma.shipperClient.findUnique({
        where: { id: shipperClientId }
      });

      if (!shipperClient) {
        return ApiResponse.error(res, 'Shipper client not found', 404);
      }

      // Check if user exists
      const existingUser = await prisma.shipperUser.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        return ApiResponse.error(res, 'Email already registered', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.shipperUser.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
          shipperClientId,
          phone: phone || null,
          jobTitle: jobTitle || null
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          shipperClientId: true,
          createdAt: true
        }
      });

      // Generate tokens
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: 'SHIPPER_USER',
        shipperClientId: user.shipperClientId
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        type: 'SHIPPER_USER'
      });

      return ApiResponse.success(res, {
        user,
        token,
        refreshToken
      }, 'User registered successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Register Driver
  async registerDriver(req, res, next) {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        phone,
        driverType,
        licenseNumber,
        licenseState,
        licenseExpiry,
        medicalCertExpiry,
        hireDate,
        payType,
        payRate
      } = req.body;

      // Check if driver exists
      const existingDriver = await prisma.driver.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingDriver) {
        return ApiResponse.error(res, 'Email already registered', 409);
      }

      // Check if license exists
      const existingLicense = await prisma.driver.findUnique({
        where: { licenseNumber }
      });

      if (existingLicense) {
        return ApiResponse.error(res, 'License number already registered', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create driver
      const driver = await prisma.driver.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
          phone,
          driverType,
          licenseNumber,
          licenseState,
          licenseExpiry: new Date(licenseExpiry),
          medicalCertExpiry: new Date(medicalCertExpiry),
          hireDate: new Date(hireDate),
          payType,
          payRate
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          driverType: true,
          licenseNumber: true,
          createdAt: true
        }
      });

      // Generate tokens
      const token = generateToken({
        id: driver.id,
        email: driver.email,
        type: 'DRIVER'
      });

      const refreshToken = generateRefreshToken({
        id: driver.id,
        type: 'DRIVER'
      });

      return ApiResponse.success(res, {
        user: driver,
        token,
        refreshToken
      }, 'Driver registered successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Login Internal User
  async loginInternalUser(req, res, next) {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await prisma.internalUser.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user) {
        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return ApiResponse.error(res, 'Account is locked. Please try again later.', 423);
      }

      // Check if account is active
      if (!user.isActive) {
        return ApiResponse.error(res, 'Account is inactive', 403);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        // Increment failed attempts
        const failedAttempts = user.failedLoginAttempts + 1;
        const updateData = { failedLoginAttempts: failedAttempts };

        // Lock account after 5 failed attempts
        if (failedAttempts >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        }

        await prisma.internalUser.update({
          where: { id: user.id },
          data: updateData
        });

        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      // Reset failed attempts and update last login
      await prisma.internalUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: new Date()
        }
      });

      // Generate tokens
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: 'INTERNAL_USER',
        role: user.role
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        type: 'INTERNAL_USER'
      });

      // Remove sensitive data
      delete user.passwordHash;
      delete user.failedLoginAttempts;
      delete user.lockedUntil;

      return ApiResponse.success(res, {
        user,
        token,
        refreshToken
      }, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  // Login Shipper User
  async loginShipperUser(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await prisma.shipperUser.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          shipperClient: {
            select: {
              id: true,
              legalName: true,
              status: true
            }
          }
        }
      });

      if (!user) {
        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return ApiResponse.error(res, 'Account is locked. Please try again later.', 423);
      }

      if (!user.isActive) {
        return ApiResponse.error(res, 'Account is inactive', 403);
      }

      if (user.shipperClient.status !== 'ACTIVE') {
        return ApiResponse.error(res, 'Shipper account is inactive', 403);
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        const failedAttempts = user.failedLoginAttempts + 1;
        const updateData = { failedLoginAttempts: failedAttempts };

        if (failedAttempts >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }

        await prisma.shipperUser.update({
          where: { id: user.id },
          data: updateData
        });

        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      await prisma.shipperUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: new Date()
        }
      });

      const token = generateToken({
        id: user.id,
        email: user.email,
        type: 'SHIPPER_USER',
        shipperClientId: user.shipperClientId
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        type: 'SHIPPER_USER'
      });

      delete user.passwordHash;
      delete user.failedLoginAttempts;
      delete user.lockedUntil;

      return ApiResponse.success(res, {
        user,
        token,
        refreshToken
      }, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  // Login Driver
  async loginDriver(req, res, next) {
    try {
      const { email, password } = req.body;

      const driver = await prisma.driver.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!driver) {
        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      if (driver.lockedUntil && driver.lockedUntil > new Date()) {
        return ApiResponse.error(res, 'Account is locked. Please try again later.', 423);
      }

      if (!driver.isActive) {
        return ApiResponse.error(res, 'Account is inactive', 403);
      }

      const isPasswordValid = await bcrypt.compare(password, driver.passwordHash);

      if (!isPasswordValid) {
        const failedAttempts = driver.failedLoginAttempts + 1;
        const updateData = { failedLoginAttempts: failedAttempts };

        if (failedAttempts >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }

        await prisma.driver.update({
          where: { id: driver.id },
          data: updateData
        });

        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      await prisma.driver.update({
        where: { id: driver.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: new Date()
        }
      });

      const token = generateToken({
        id: driver.id,
        email: driver.email,
        type: 'DRIVER'
      });

      const refreshToken = generateRefreshToken({
        id: driver.id,
        type: 'DRIVER'
      });

      delete driver.passwordHash;
      delete driver.failedLoginAttempts;
      delete driver.lockedUntil;

      return ApiResponse.success(res, {
        user: driver,
        token,
        refreshToken
      }, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  // Refresh Token
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return ApiResponse.error(res, 'Refresh token required', 400);
      }

      const decoded = verifyRefreshToken(refreshToken);

      // Fetch fresh user data
      let user;
      let newTokenPayload;

      switch (decoded.type) {
        case 'INTERNAL_USER':
          user = await prisma.internalUser.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true, role: true, isActive: true }
          });
          newTokenPayload = {
            id: user.id,
            email: user.email,
            type: 'INTERNAL_USER',
            role: user.role
          };
          break;

        case 'SHIPPER_USER':
          user = await prisma.shipperUser.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true, shipperClientId: true, isActive: true }
          });
          newTokenPayload = {
            id: user.id,
            email: user.email,
            type: 'SHIPPER_USER',
            shipperClientId: user.shipperClientId
          };
          break;

        case 'DRIVER':
          user = await prisma.driver.findUnique({
            where: { id: decoded.id },
            select: { id: true, email: true, isActive: true }
          });
          newTokenPayload = {
            id: user.id,
            email: user.email,
            type: 'DRIVER'
          };
          break;

        default:
          return ApiResponse.error(res, 'Invalid token type', 400);
      }

      if (!user || !user.isActive) {
        return ApiResponse.error(res, 'User not found or inactive', 403);
      }

      const newToken = generateToken(newTokenPayload);
      const newRefreshToken = generateRefreshToken({
        id: user.id,
        type: decoded.type
      });

      return ApiResponse.success(res, {
        token: newToken,
        refreshToken: newRefreshToken
      }, 'Token refreshed successfully');
    } catch (error) {
      return ApiResponse.error(res, 'Invalid or expired refresh token', 401);
    }
  }

  // Get Current User
  async getCurrentUser(req, res, next) {
    try {
      let user;

      switch (req.user.type) {
        case 'INTERNAL_USER':
          user = await prisma.internalUser.findUnique({
            where: { id: req.user.id },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              phone: true,
              isActive: true,
              createdAt: true,
              lastLogin: true
            }
          });
          break;

        case 'SHIPPER_USER':
          user = await prisma.shipperUser.findUnique({
            where: { id: req.user.id },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              jobTitle: true,
              isActive: true,
              createdAt: true,
              lastLogin: true,
              shipperClient: {
                select: {
                  id: true,
                  legalName: true,
                  tradeName: true,
                  status: true
                }
              },
              permissions: {
                select: {
                  permission: true
                }
              }
            }
          });
          break;

        case 'DRIVER':
          user = await prisma.driver.findUnique({
            where: { id: req.user.id },
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
              createdAt: true,
              lastLogin: true,
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
            }
          });
          break;
      }

      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      return ApiResponse.success(res, user, 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  // Change Password
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return ApiResponse.error(res, 'Current and new passwords required', 400);
      }

      if (newPassword.length < 8) {
        return ApiResponse.error(res, 'New password must be at least 8 characters', 400);
      }

      let user;
      let model;

      switch (req.user.type) {
        case 'INTERNAL_USER':
          user = await prisma.internalUser.findUnique({ where: { id: req.user.id } });
          model = prisma.internalUser;
          break;
        case 'SHIPPER_USER':
          user = await prisma.shipperUser.findUnique({ where: { id: req.user.id } });
          model = prisma.shipperUser;
          break;
        case 'DRIVER':
          user = await prisma.driver.findUnique({ where: { id: req.user.id } });
          model = prisma.driver;
          break;
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

      if (!isPasswordValid) {
        return ApiResponse.error(res, 'Current password is incorrect', 401);
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      await model.update({
        where: { id: req.user.id },
        data: {
          passwordHash: newPasswordHash,
          passwordUpdatedAt: new Date()
        }
      });

      return ApiResponse.success(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  // Logout (can be used for token blacklisting if implemented)
  async logout(req, res, next) {
    try {
      // In a stateless JWT system, logout is handled client-side by removing the token
      // If you implement token blacklisting, add logic here
      
      return ApiResponse.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  // Forgot Password (placeholder - implement email sending)
  async forgotPassword(req, res, next) {
    try {
      // TODO: Implement email service for password reset
      return ApiResponse.success(res, null, 'Password reset email sent (not implemented yet)');
    } catch (error) {
      next(error);
    }
  }

  // Reset Password (placeholder)
  async resetPassword(req, res, next) {
    try {
      // TODO: Implement password reset with token verification
      return ApiResponse.success(res, null, 'Password reset successful (not implemented yet)');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();