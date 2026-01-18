// ==================== src/validators/load.validator.js ====================
const { body, validationResult } = require('express-validator');

const validateLoad = [
  body('origin').trim().notEmpty().withMessage('Origin is required'),
  body('destination').trim().notEmpty().withMessage('Destination is required'),
  body('equipmentType').isIn(['DRY_VAN', 'REEFER', 'FLATBED', 'STEP_DECK', 'LOWBOY']).withMessage('Valid equipment type required'),
  body('weightLbs').isInt({ min: 1 }).withMessage('Weight must be a positive integer'),
  body('commodity').trim().notEmpty().withMessage('Commodity is required'),
  body('pickupDate').isISO8601().withMessage('Valid pickup date required'),
  body('deliveryDate').isISO8601().withMessage('Valid delivery date required'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateLoadUpdate = [
  body('equipmentType').optional().isIn(['DRY_VAN', 'REEFER', 'FLATBED', 'STEP_DECK', 'LOWBOY']),
  body('weightLbs').optional().isInt({ min: 1 }),
  body('pickupDate').optional().isISO8601(),
  body('deliveryDate').optional().isISO8601(),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateLoad,
  validateLoadUpdate
};