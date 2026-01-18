// ==================== PROJECT STRUCTURE ====================
/*
backend/
├── src/
│   ├── config/
│   │   ├── database.js         # Prisma client initialization
│   │   └── env.js              # Environment variables
│   ├── middleware/
│   │   ├── auth.js             # Authentication middleware
│   │   ├── errorHandler.js     # Global error handler
│   │   ├── validation.js       # Request validation
│   │   └── auditLog.js         # Audit logging middleware
│   ├── routes/
│   │   ├── index.js            # Main router
│   │   ├── auth.routes.js      # Authentication routes
│   │   ├── loads.routes.js     # Load management
│   │   ├── drivers.routes.js   # Driver management
│   │   ├── vehicles.routes.js  # Fleet management
│   │   ├── shippers.routes.js  # Shipper client routes
│   │   ├── invoices.routes.js  # Invoice management
│   │   ├── settlements.routes.js # Driver settlements
│   │   ├── notifications.routes.js # Notifications
│   │   └── reports.routes.js   # Analytics & reports
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── loads.controller.js
│   │   ├── drivers.controller.js
│   │   └── ... (one for each route)
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── loads.service.js
│   │   ├── email.service.js
│   │   ├── notification.service.js
│   │   └── ... (business logic)
│   ├── validators/
│   │   ├── load.validator.js
│   │   ├── driver.validator.js
│   │   └── ... (validation schemas)
│   ├── utils/
│   │   ├── logger.js
│   │   ├── jwt.js
│   │   └── response.js
│   └── app.js                  # Express app setup
├── server.js                   # Entry point
├── .env
├── .env.example
├── package.json
└── README.md
*/

// ==================== PACKAGE.JSON ====================
/*
{
  "name": "tms-backend",
  "version": "1.0.0",
  "description": "Transportation Management System Backend API",
  "main": "server.js",
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "migrate": "prisma migrate dev",
    "migrate:prod": "prisma migrate deploy",
    "studio": "prisma studio",
    "seed": "node prisma/seed.js"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "dotenv": "^16.3.1",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "express-validator": "^7.0.1",
    "express-rate-limit": "^7.1.5",
    "morgan": "^1.10.0",
    "compression": "^1.7.4",
    "cookie-parser": "^1.4.6"
  },
  "devDependencies": {
    "prisma": "^5.22.0",
    "nodemon": "^3.0.2"
  }
}
*/

// ==================== .ENV.EXAMPLE ====================
/*
# Server
NODE_ENV=development
PORT=5000
API_VERSION=v1

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/tms_dev"
SHADOW_DATABASE_URL="postgresql://user:password@localhost:5432/tms_shadow"

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRES_IN=30d

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# AWS S3 (for file storage)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=tms-documents

# Email (optional - for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password

# Logging
LOG_LEVEL=debug
*/

// ==================== server.js ====================
require('dotenv').config();
const app = require('./src/app');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Closing server gracefully...`);
  
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const server = app.listen(PORT, async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
});

// ==================== src/app.js ====================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// API Routes
app.use(`/api/${process.env.API_VERSION || 'v1'}`, routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;

// ==================== src/config/database.js ====================
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

module.exports = prisma;

// ==================== src/middleware/errorHandler.js ====================
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Prisma errors
  if (err.code) {
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          success: false,
          message: 'A record with this value already exists',
          field: err.meta?.target?.[0]
        });
      case 'P2025':
        return res.status(404).json({
          success: false,
          message: 'Record not found'
        });
      case 'P2003':
        return res.status(400).json({
          success: false,
          message: 'Invalid foreign key reference'
        });
      default:
        return res.status(500).json({
          success: false,
          message: 'Database error',
          ...(process.env.NODE_ENV === 'development' && { error: err.message })
        });
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;

// ==================== src/utils/response.js ====================
class ApiResponse {
  static success(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }

  static error(res, message, statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      ...(errors && { errors })
    });
  }

  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit)
      }
    });
  }
}

module.exports = ApiResponse;

// ==================== INSTALLATION INSTRUCTIONS ====================
/*
1. Create project directory:
   mkdir tms-backend && cd tms-backend

2. Initialize npm:
   npm init -y

3. Install dependencies:
   npm install express cors helmet dotenv bcrypt jsonwebtoken express-validator express-rate-limit morgan compression cookie-parser @prisma/client

4. Install dev dependencies:
   npm install -D prisma nodemon

5. Initialize Prisma (if not done):
   npx prisma init

6. Copy your schema to prisma/schema.prisma

7. Create .env file with the configuration above

8. Run migration:
   npx prisma migrate dev --name initial_schema

9. Create the folder structure as shown above

10. Start development:
    npm run dev
*/