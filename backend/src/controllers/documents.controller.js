// ==================== src/controllers/documents.controller.js ====================
const prisma = require('../config/database');
const storageService = require('../services/storage.service');
const ApiResponse = require('../utils/response');

class DocumentController {
  // Upload load document
  async uploadLoadDocument(req, res, next) {
    try {
      const { loadId } = req.params;
      const { documentType } = req.body;

      if (!req.file) {
        return ApiResponse.error(res, 'No file uploaded', 400);
      }

      // Validate document type
      storageService.validateDocumentFile(req.file);

      // Upload file
      const fileData = await storageService.upload(
        req.file,
        'LOAD_DOCUMENT',
        {
          loadId,
          uploadedBy: req.user.id,
          documentType
        }
      );

      // Create file upload record
      const fileUpload = await prisma.fileUpload.create({
        data: {
          uploadedById: req.user.id,
          uploadedByType: req.user.type,
          ...fileData,
          relatedEntityType: 'LOAD',
          relatedEntityId: loadId
        }
      });

      // Create load document record
      const document = await prisma.loadDocument.create({
        data: {
          loadId,
          uploadedById: req.user.id,
          documentType,
          documentUrl: fileData.fileUrl,
          fileName: fileData.originalFileName,
          status: 'PENDING_REVIEW'
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return ApiResponse.success(res, document, 'Document uploaded successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Get load documents
  async getLoadDocuments(req, res, next) {
    try {
      const { loadId } = req.params;
      const { status } = req.query;

      const where = { loadId };
      if (status) where.status = status;

      const documents = await prisma.loadDocument.findMany({
        where,
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          approvals: {
            include: {
              approvedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        },
        orderBy: {
          uploadedAt: 'desc'
        }
      });

      return ApiResponse.success(res, documents);
    } catch (error) {
      next(error);
    }
  }

  // Get single document
  async getDocument(req, res, next) {
    try {
      const { id } = req.params;

      const document = await prisma.loadDocument.findUnique({
        where: { id },
        include: {
          load: {
            select: {
              id: true,
              loadNumber: true,
              shipperClientId: true
            }
          },
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          approvals: {
            include: {
              approvedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      if (!document) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      // Check access permissions
      if (req.user.type === 'SHIPPER_USER') {
        const user = await prisma.shipperUser.findUnique({
          where: { id: req.user.id },
          select: { shipperClientId: true }
        });

        if (document.load.shipperClientId !== user.shipperClientId) {
          return ApiResponse.error(res, 'Access denied', 403);
        }
      }

      return ApiResponse.success(res, document);
    } catch (error) {
      next(error);
    }
  }

  // Download document
  async downloadDocument(req, res, next) {
    try {
      const { id } = req.params;

      const document = await prisma.loadDocument.findUnique({
        where: { id }
      });

      if (!document) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      const fileUpload = await prisma.fileUpload.findFirst({
        where: {
          relatedEntityType: 'LOAD',
          relatedEntityId: document.loadId,
          originalFileName: document.fileName
        }
      });

      if (!fileUpload) {
        return ApiResponse.error(res, 'File not found in storage', 404);
      }

      if (storageService.storageMode === 'local') {
        const fileBuffer = await storageService.get(fileUpload.storageKey);
        res.setHeader('Content-Type', fileUpload.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileUpload.originalFileName}"`);
        res.send(fileBuffer);
      } else {
        // For cloud storage, redirect to signed URL
        const signedUrl = await storageService.getFileUrl(fileUpload.storageKey, 3600);
        res.redirect(signedUrl);
      }
    } catch (error) {
      next(error);
    }
  }

  // Delete document
  async deleteDocument(req, res, next) {
    try {
      const { id } = req.params;

      const document = await prisma.loadDocument.findUnique({
        where: { id }
      });

      if (!document) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      // Only uploader or admin can delete
      if (req.user.type !== 'INTERNAL_USER' && document.uploadedById !== req.user.id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      // Find and delete file from storage
      const fileUpload = await prisma.fileUpload.findFirst({
        where: {
          relatedEntityType: 'LOAD',
          relatedEntityId: document.loadId,
          originalFileName: document.fileName
        }
      });

      if (fileUpload) {
        await storageService.delete(fileUpload.storageKey);
        await prisma.fileUpload.update({
          where: { id: fileUpload.id },
          data: { deletedAt: new Date() }
        });
      }

      // Delete document record
      await prisma.loadDocument.delete({
        where: { id }
      });

      return ApiResponse.success(res, null, 'Document deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  // Approve document
  async approveDocument(req, res, next) {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const document = await prisma.loadDocument.findUnique({
        where: { id }
      });

      if (!document) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      // Create approval
      await prisma.documentApproval.create({
        data: {
          loadDocumentId: id,
          approvedById: req.user.id,
          approved: true,
          notes
        }
      });

      // Update document status
      const updatedDocument = await prisma.loadDocument.update({
        where: { id },
        data: { status: 'APPROVED' }
      });

      return ApiResponse.success(res, updatedDocument, 'Document approved');
    } catch (error) {
      next(error);
    }
  }

  // Reject document
  async rejectDocument(req, res, next) {
    try {
      const { id } = req.params;
      const { rejectionReason, notes } = req.body;

      if (!rejectionReason) {
        return ApiResponse.error(res, 'Rejection reason is required', 400);
      }

      const document = await prisma.loadDocument.findUnique({
        where: { id }
      });

      if (!document) {
        return ApiResponse.error(res, 'Document not found', 404);
      }

      // Create approval record (with approved: false)
      await prisma.documentApproval.create({
        data: {
          loadDocumentId: id,
          approvedById: req.user.id,
          approved: false,
          rejectionReason,
          notes
        }
      });

      // Update document status
      const updatedDocument = await prisma.loadDocument.update({
        where: { id },
        data: { status: 'REJECTED' }
      });

      return ApiResponse.success(res, updatedDocument, 'Document rejected');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DocumentController();