// ==================== src/middleware/upload.js ====================
const multer = require('multer');

// Configure multer to use memory storage (file.buffer)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types - validation happens in service layer
    cb(null, true);
  }
});

module.exports = upload;