// ==================== src/controllers/pod.controller.js ====================
const prisma = require('../config/database');
const storageService = require('../services/storage.service');
const ApiResponse = require('../utils/response');

class PODController {
  // Submit POD
  async submitPOD(req, res, next) {
    try {
      const {
        loadId,
        recipientName,
        recipientTitle,
        gpsLat,
        gpsLng,
        notes
      } = req.body;

      // Validate load exists and driver has access
      const load = await prisma.load.findUnique({
        where: { id: loadId },
        include: {
          assignments: {
            where: { driverId: req.user.id }
          }
        }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      if (load.assignments.length === 0) {
        return ApiResponse.error(res, 'You are not assigned to this load', 403);
      }

      if (load.status !== 'DELIVERED' && load.status !== 'AT_DELIVERY') {
        return ApiResponse.error(res, 'Load must be delivered before submitting POD', 400);
      }

      // Validate files
      if (!req.files || !req.files.signature) {
        return ApiResponse.error(res, 'Signature image is required', 400);
      }

      // Upload signature
      storageService.validateImageFile(req.files.signature[0]);
      const signatureData = await storageService.upload(
        req.files.signature[0],
        'POD_SIGNATURE',
        {
          loadId,
          driverId: req.user.id
        }
      );

      // Create signature file record
      await prisma.fileUpload.create({
        data: {
          uploadedById: req.user.id,
          uploadedByType: 'DRIVER',
          ...signatureData,
          relatedEntityType: 'LOAD',
          relatedEntityId: loadId
        }
      });

      // Create POD document
      const podDocument = await prisma.podDocument.create({
        data: {
          loadId,
          driverId: req.user.id,
          signatureImage: signatureData.fileUrl,
          recipientName,
          recipientTitle,
          gpsLat: parseFloat(gpsLat),
          gpsLng: parseFloat(gpsLng),
          capturedAt: new Date(),
          syncedAt: new Date(),
          notes
        }
      });

      // Upload photos if provided
      if (req.files.photos && req.files.photos.length > 0) {
        for (let i = 0; i < req.files.photos.length; i++) {
          const photo = req.files.photos[i];
          
          storageService.validateImageFile(photo);
          const photoData = await storageService.upload(
            photo,
            'POD_PHOTO',
            {
              loadId,
              driverId: req.user.id,
              podDocumentId: podDocument.id
            }
          );

          // Create photo file record
          await prisma.fileUpload.create({
            data: {
              uploadedById: req.user.id,
              uploadedByType: 'DRIVER',
              ...photoData,
              relatedEntityType: 'LOAD',
              relatedEntityId: loadId
            }
          });

          // Create POD photo record
          await prisma.podPhoto.create({
            data: {
              podDocumentId: podDocument.id,
              photoUrl: photoData.fileUrl,
              photoOrder: i
            }
          });
        }
      }

      // Update load status
      await prisma.load.update({
        where: { id: loadId },
        data: { status: 'POD_SUBMITTED' }
      });

      await prisma.loadStatusHistory.create({
        data: {
          loadId,
          fromStatus: load.status,
          toStatus: 'POD_SUBMITTED',
          changedById: req.user.id,
          changedByType: 'DRIVER',
          notes: 'POD submitted by driver'
        }
      });

      // Fetch complete POD with photos
      const completePOD = await prisma.podDocument.findUnique({
        where: { id: podDocument.id },
        include: {
          photos: {
            orderBy: { photoOrder: 'asc' }
          },
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      return ApiResponse.success(res, completePOD, 'POD submitted successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Get POD by load ID
  async getPODByLoadId(req, res, next) {
    try {
      const { loadId } = req.params;

      const pod = await prisma.podDocument.findFirst({
        where: { loadId },
        include: {
          photos: {
            orderBy: { photoOrder: 'asc' }
          },
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          verifiedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!pod) {
        return ApiResponse.error(res, 'POD not found for this load', 404);
      }

      return ApiResponse.success(res, pod);
    } catch (error) {
      next(error);
    }
  }

  // Get POD by ID
  async getPODById(req, res, next) {
    try {
      const { id } = req.params;

      const pod = await prisma.podDocument.findUnique({
        where: { id },
        include: {
          photos: {
            orderBy: { photoOrder: 'asc' }
          },
          load: {
            select: {
              id: true,
              loadNumber: true,
              origin: true,
              destination: true,
              shipperClientId: true
            }
          },
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          verifiedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!pod) {
        return ApiResponse.error(res, 'POD not found', 404);
      }

      // Check access permissions
      if (req.user.type === 'DRIVER' && pod.driverId !== req.user.id) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      if (req.user.type === 'SHIPPER_USER') {
        const user = await prisma.shipperUser.findUnique({
          where: { id: req.user.id },
          select: { shipperClientId: true }
        });

        if (pod.load.shipperClientId !== user.shipperClientId) {
          return ApiResponse.error(res, 'Access denied', 403);
        }
      }

      return ApiResponse.success(res, pod);
    } catch (error) {
      next(error);
    }
  }

  // Verify POD
  async verifyPOD(req, res, next) {
    try {
      const { id } = req.params;
      const { approved, notes } = req.body;

      const pod = await prisma.podDocument.findUnique({
        where: { id },
        include: { load: true }
      });

      if (!pod) {
        return ApiResponse.error(res, 'POD not found', 404);
      }

      if (pod.verifiedAt) {
        return ApiResponse.error(res, 'POD already verified', 400);
      }

      // Update POD
      const updatedPOD = await prisma.podDocument.update({
        where: { id },
        data: {
          verifiedAt: new Date(),
          verifiedById: req.user.id,
          notes: notes || pod.notes
        }
      });

      // Update load status
      if (approved) {
        await prisma.load.update({
          where: { id: pod.loadId },
          data: { status: 'COMPLETED' }
        });

        await prisma.loadStatusHistory.create({
          data: {
            loadId: pod.loadId,
            fromStatus: pod.load.status,
            toStatus: 'COMPLETED',
            changedById: req.user.id,
            changedByType: 'INTERNAL_USER',
            notes: 'POD verified and approved'
          }
        });
      } else {
        await prisma.load.update({
          where: { id: pod.loadId },
          data: { status: 'POD_PENDING' }
        });

        await prisma.loadStatusHistory.create({
          data: {
            loadId: pod.loadId,
            fromStatus: pod.load.status,
            toStatus: 'POD_PENDING',
            changedById: req.user.id,
            changedByType: 'INTERNAL_USER',
            notes: notes || 'POD needs correction'
          }
        });
      }

      return ApiResponse.success(res, updatedPOD, 'POD verified successfully');
    } catch (error) {
      next(error);
    }
  }

  // Get POD photo
  async getPODPhoto(req, res, next) {
    try {
      const { id, photoId } = req.params;

      const photo = await prisma.podPhoto.findUnique({
        where: { id: photoId },
        include: {
          podDocument: {
            select: {
              id: true,
              loadId: true
            }
          }
        }
      });

      if (!photo || photo.podDocumentId !== id) {
        return ApiResponse.error(res, 'Photo not found', 404);
      }

      const fileUpload = await prisma.fileUpload.findFirst({
        where: {
          category: 'POD_PHOTO',
          relatedEntityId: photo.podDocument.loadId,
          fileUrl: photo.photoUrl
        }
      });

      if (!fileUpload) {
        return ApiResponse.error(res, 'File not found', 404);
      }

      if (storageService.storageMode === 'local') {
        const fileBuffer = await storageService.get(fileUpload.storageKey);
        res.setHeader('Content-Type', fileUpload.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${fileUpload.originalFileName}"`);
        res.send(fileBuffer);
      } else {
        const signedUrl = await storageService.getFileUrl(fileUpload.storageKey, 3600);
        res.redirect(signedUrl);
      }
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PODController();