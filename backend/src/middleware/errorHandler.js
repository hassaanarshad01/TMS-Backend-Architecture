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
