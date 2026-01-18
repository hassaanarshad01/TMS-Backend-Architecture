// ==================== src/services/storage.service.js ====================
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// For future cloud integration
// const AWS = require('aws-sdk');
// const s3 = new AWS.S3({
//   region: process.env.AWS_REGION,
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
// });

class StorageService {
  constructor() {
    // Set storage mode: 'local' or 'cloud'
    this.storageMode = process.env.STORAGE_MODE || 'local';
    this.uploadPath = process.env.UPLOAD_PATH || './uploads';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB default
    
    // Initialize local storage directories
    if (this.storageMode === 'local') {
      this.initializeLocalStorage();
    }
  }

  async initializeLocalStorage() {
    const directories = [
      'uploads/documents',
      'uploads/pod-signatures',
      'uploads/pod-photos',
      'uploads/vehicle-docs',
      'uploads/driver-docs',
      'uploads/invoices',
      'uploads/maintenance',
      'uploads/temp'
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error);
      }
    }
  }

  // ==================== LOCAL STORAGE METHODS ====================

  async uploadLocal(file, category, metadata = {}) {
    try {
      // Validate file size
      if (file.size > this.maxFileSize) {
        throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize} bytes`);
      }

      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      
      // Determine subdirectory based on category
      const subDir = this.getCategoryPath(category);
      const filePath = path.join(this.uploadPath, subDir, fileName);

      // Save file to disk
      await fs.writeFile(filePath, file.buffer);

      // Return file information
      return {
        fileName,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileExtension: fileExtension.replace('.', ''),
        storageProvider: 'local',
        storageKey: filePath,
        storageBucket: null,
        fileUrl: `/uploads/${subDir}/${fileName}`, // Relative URL
        category,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      throw new Error(`Local upload failed: ${error.message}`);
    }
  }

  async deleteLocal(storageKey) {
    try {
      await fs.unlink(storageKey);
      return { success: true, message: 'File deleted successfully' };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: false, message: 'File not found' };
      }
      throw new Error(`Local delete failed: ${error.message}`);
    }
  }

  async getLocal(storageKey) {
    try {
      const fileBuffer = await fs.readFile(storageKey);
      return fileBuffer;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw new Error(`Local read failed: ${error.message}`);
    }
  }

  async moveLocal(oldPath, newCategory) {
    try {
      const fileName = path.basename(oldPath);
      const newSubDir = this.getCategoryPath(newCategory);
      const newPath = path.join(this.uploadPath, newSubDir, fileName);

      await fs.rename(oldPath, newPath);

      return {
        storageKey: newPath,
        fileUrl: `/uploads/${newSubDir}/${fileName}`
      };
    } catch (error) {
      throw new Error(`Local move failed: ${error.message}`);
    }
  }

  // ==================== CLOUD STORAGE METHODS (S3) ====================
  
  async uploadCloud(file, category, metadata = {}) {
    try {
      // Placeholder for S3 upload
      // Uncomment when ready to integrate
      
      /*
      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const s3Key = `${this.getCategoryPath(category)}/${fileName}`;

      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          category,
          ...metadata
        }
      };

      const result = await s3.upload(params).promise();

      return {
        fileName,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileExtension: fileExtension.replace('.', ''),
        storageProvider: 's3',
        storageKey: s3Key,
        storageBucket: process.env.AWS_S3_BUCKET,
        fileUrl: result.Location,
        category,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
          etag: result.ETag
        }
      };
      */

      throw new Error('Cloud storage not yet implemented. Set STORAGE_MODE=local');
    } catch (error) {
      throw new Error(`Cloud upload failed: ${error.message}`);
    }
  }

  async deleteCloud(storageKey) {
    try {
      // Placeholder for S3 delete
      /*
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey
      };

      await s3.deleteObject(params).promise();
      return { success: true, message: 'File deleted successfully' };
      */

      throw new Error('Cloud storage not yet implemented');
    } catch (error) {
      throw new Error(`Cloud delete failed: ${error.message}`);
    }
  }

  async getSignedUrlCloud(storageKey, expiresIn = 3600) {
    try {
      // Placeholder for S3 signed URL
      /*
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey,
        Expires: expiresIn
      };

      const signedUrl = await s3.getSignedUrlPromise('getObject', params);
      return signedUrl;
      */

      throw new Error('Cloud storage not yet implemented');
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  // ==================== UNIFIED INTERFACE ====================

  async upload(file, category, metadata = {}) {
    if (this.storageMode === 'local') {
      return await this.uploadLocal(file, category, metadata);
    } else {
      return await this.uploadCloud(file, category, metadata);
    }
  }

  async delete(storageKey) {
    if (this.storageMode === 'local') {
      return await this.deleteLocal(storageKey);
    } else {
      return await this.deleteCloud(storageKey);
    }
  }

  async get(storageKey) {
    if (this.storageMode === 'local') {
      return await this.getLocal(storageKey);
    } else {
      throw new Error('Cloud get not implemented. Use signed URLs instead.');
    }
  }

  async getFileUrl(storageKey, expiresIn = 3600) {
    if (this.storageMode === 'local') {
      // For local, return the relative path
      const relativePath = storageKey.replace(this.uploadPath, '/uploads');
      return relativePath.replace(/\\/g, '/'); // Normalize path separators
    } else {
      // For cloud, return signed URL
      return await this.getSignedUrlCloud(storageKey, expiresIn);
    }
  }

  // ==================== HELPER METHODS ====================

  getCategoryPath(category) {
    const categoryMap = {
      'LOAD_DOCUMENT': 'documents',
      'POD_SIGNATURE': 'pod-signatures',
      'POD_PHOTO': 'pod-photos',
      'VEHICLE_DOCUMENT': 'vehicle-docs',
      'DRIVER_DOCUMENT': 'driver-docs',
      'INVOICE_ATTACHMENT': 'invoices',
      'MAINTENANCE_RECEIPT': 'maintenance',
      'OTHER': 'temp'
    };

    return categoryMap[category] || 'temp';
  }

  validateFileType(file, allowedTypes) {
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
    }
    return true;
  }

  validateImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    return this.validateFileType(file, allowedTypes);
  }

  validateDocumentFile(file) {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];
    return this.validateFileType(file, allowedTypes);
  }
}

module.exports = new StorageService();



// ==================== ADDITIONAL PACKAGE.JSON DEPENDENCIES ====================
/*
Add these to your package.json dependencies:

"multer": "^1.4.5-lts.1",
"uuid": "^9.0.1",
"aws-sdk": "^2.1691.0"  // For future cloud integration

Then run: npm install
*/

// ==================== USAGE EXAMPLES ====================
/*
// Example 1: Upload a load document
const storageService = require('../services/storage.service');
const upload = require('../middleware/upload');

router.post('/loads/:id/documents',
  authenticateToken,
  upload.single('document'), // 'document' is the field name in form-data
  async (req, res, next) => {
    try {
      // Validate file type
      storageService.validateDocumentFile(req.file);

      // Upload file
      const fileData = await storageService.upload(
        req.file,
        'LOAD_DOCUMENT',
        {
          loadId: req.params.id,
          uploadedBy: req.user.id,
          documentType: req.body.documentType
        }
      );

      // Create file record in database
      const fileUpload = await prisma.fileUpload.create({
        data: {
          uploadedById: req.user.id,
          uploadedByType: req.user.type,
          ...fileData,
          relatedEntityType: 'LOAD',
          relatedEntityId: req.params.id
        }
      });

      // Create load document record
      const document = await prisma.loadDocument.create({
        data: {
          loadId: req.params.id,
          uploadedById: req.user.id,
          documentType: req.body.documentType,
          documentUrl: fileData.fileUrl,
          fileName: fileData.originalFileName
        }
      });

      res.json({ success: true, data: document });
    } catch (error) {
      next(error);
    }
  }
);

// Example 2: Upload multiple POD photos
router.post('/pods/:id/photos',
  authenticateToken,
  upload.array('photos', 5), // Max 5 photos
  async (req, res, next) => {
    try {
      const uploadedPhotos = [];

      for (const file of req.files) {
        storageService.validateImageFile(file);

        const fileData = await storageService.upload(
          file,
          'POD_PHOTO',
          {
            podDocumentId: req.params.id,
            uploadedBy: req.user.id
          }
        );

        const photo = await prisma.podPhoto.create({
          data: {
            podDocumentId: req.params.id,
            photoUrl: fileData.fileUrl,
            photoOrder: uploadedPhotos.length
          }
        });

        uploadedPhotos.push(photo);
      }

      res.json({ success: true, data: uploadedPhotos });
    } catch (error) {
      next(error);
    }
  }
);

// Example 3: Download/view a file
router.get('/files/:fileId',
  authenticateToken,
  async (req, res, next) => {
    try {
      const fileUpload = await prisma.fileUpload.findUnique({
        where: { id: req.params.fileId }
      });

      if (!fileUpload) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      if (storageService.storageMode === 'local') {
        const fileBuffer = await storageService.get(fileUpload.storageKey);
        res.setHeader('Content-Type', fileUpload.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${fileUpload.originalFileName}"`);
        res.send(fileBuffer);
      } else {
        // For cloud, redirect to signed URL
        const signedUrl = await storageService.getFileUrl(fileUpload.storageKey, 3600);
        res.redirect(signedUrl);
      }
    } catch (error) {
      next(error);
    }
  }
);

// Example 4: Delete a file
router.delete('/files/:fileId',
  authenticateToken,
  async (req, res, next) => {
    try {
      const fileUpload = await prisma.fileUpload.findUnique({
        where: { id: req.params.fileId }
      });

      if (!fileUpload) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }

      // Delete from storage
      await storageService.delete(fileUpload.storageKey);

      // Soft delete from database
      await prisma.fileUpload.update({
        where: { id: req.params.fileId },
        data: { deletedAt: new Date() }
      });

      res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);
*/

// ==================== .ENV ADDITIONS ====================
/*
# File Storage
STORAGE_MODE=local
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Cloud Storage (for future use)
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=your-key
# AWS_SECRET_ACCESS_KEY=your-secret
# AWS_S3_BUCKET=tms-documents
*/