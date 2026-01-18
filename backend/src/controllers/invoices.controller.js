// ==================== src/controllers/invoices.controller.js ====================
const prisma = require('../config/database');
const ApiResponse = require('../utils/response');
const notificationService = require('../services/notification.service');

class InvoiceController {
  // Get all invoices
  async getAllInvoices(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        shipperClientId,
        dateFrom,
        dateTo,
        search
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

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
      }

      if (status) where.status = status;
      if (shipperClientId) where.shipperClientId = shipperClientId;

      if (dateFrom || dateTo) {
        where.issuedAt = {};
        if (dateFrom) where.issuedAt.gte = new Date(dateFrom);
        if (dateTo) where.issuedAt.lte = new Date(dateTo);
      }

      if (search) {
        where.OR = [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { shipperClient: { legalName: { contains: search, mode: 'insensitive' } } }
        ];
      }

      const [invoices, total] = await Promise.all([
        prisma.shipperInvoice.findMany({
          where,
          skip,
          take,
          include: {
            shipperClient: {
              select: {
                id: true,
                legalName: true,
                tradeName: true,
                email: true
              }
            },
            load: {
              select: {
                id: true,
                loadNumber: true,
                origin: true,
                destination: true,
                pickupDate: true,
                deliveryDate: true
              }
            },
            lineItems: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }),
        prisma.shipperInvoice.count({ where })
      ]);

      return ApiResponse.paginated(res, invoices, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      });
    } catch (error) {
      next(error);
    }
  }

  // Get invoice by ID
  async getInvoiceById(req, res, next) {
    try {
      const { id } = req.params;

      const invoice = await prisma.shipperInvoice.findUnique({
        where: { id },
        include: {
          shipperClient: {
            select: {
              id: true,
              legalName: true,
              tradeName: true,
              email: true,
              phoneNumber: true,
              billingAddress: true
            }
          },
          load: {
            select: {
              id: true,
              loadNumber: true,
              origin: true,
              destination: true,
              pickupDate: true,
              deliveryDate: true,
              actualPickupTime: true,
              actualDeliveryTime: true,
              equipmentType: true,
              weightLbs: true,
              commodity: true
            }
          },
          lineItems: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!invoice) {
        return ApiResponse.error(res, 'Invoice not found', 404);
      }

      // Check access permissions
      if (req.user.type === 'SHIPPER_USER') {
        const user = await prisma.shipperUser.findUnique({
          where: { id: req.user.id },
          select: { shipperClientId: true }
        });

        if (invoice.shipperClientId !== user.shipperClientId) {
          return ApiResponse.error(res, 'Access denied', 403);
        }
      }

      return ApiResponse.success(res, invoice);
    } catch (error) {
      next(error);
    }
  }

  // Create invoice from load
  async createInvoiceFromLoad(req, res, next) {
    try {
      const { loadId } = req.params;
      const { lineItems, taxRate = 0, notes } = req.body;

      // Get load
      const load = await prisma.load.findUnique({
        where: { id: loadId },
        include: {
          shipperClient: true
        }
      });

      if (!load) {
        return ApiResponse.error(res, 'Load not found', 404);
      }

      if (load.status !== 'COMPLETED') {
        return ApiResponse.error(res, 'Load must be completed before invoicing', 400);
      }

      // Check if invoice already exists
      const existingInvoice = await prisma.shipperInvoice.findFirst({
        where: {
          loadId,
          status: { not: 'CANCELLED' }
        }
      });

      if (existingInvoice) {
        return ApiResponse.error(res, 'Invoice already exists for this load', 400);
      }

      // Generate invoice number
      const year = new Date().getFullYear();
      const lastInvoice = await prisma.shipperInvoice.findFirst({
        where: {
          invoiceNumber: {
            startsWith: `INV-${year}-`
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      let invoiceNumber;
      if (lastInvoice) {
        const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
        invoiceNumber = `INV-${year}-${String(lastNumber + 1).padStart(4, '0')}`;
      } else {
        invoiceNumber = `INV-${year}-0001`;
      }

      // Calculate amounts
      let subtotal = 0;
      const invoiceLineItems = lineItems || [
        {
          description: `Freight charges - Load ${load.loadNumber}`,
          quantity: 1,
          unitPrice: parseFloat(load.shipperRate),
          amount: parseFloat(load.shipperRate)
        }
      ];

      invoiceLineItems.forEach(item => {
        subtotal += parseFloat(item.amount);
      });

      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      // Calculate due date (payment terms from shipper client)
      const paymentTerms = load.shipperClient.paymentTerms || 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + paymentTerms);

      // Create invoice
      const invoice = await prisma.shipperInvoice.create({
        data: {
          shipperClientId: load.shipperClientId,
          loadId,
          invoiceNumber,
          subtotal,
          taxAmount,
          total,
          status: 'DRAFT',
          notes,
          dueDate,
          lineItems: {
            create: invoiceLineItems
          }
        },
        include: {
          lineItems: true,
          shipperClient: {
            select: {
              id: true,
              legalName: true,
              tradeName: true
            }
          },
          load: {
            select: {
              id: true,
              loadNumber: true
            }
          }
        }
      });

      return ApiResponse.success(res, invoice, 'Invoice created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  // Update invoice
  async updateInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const { lineItems, taxRate, notes } = req.body;

      const invoice = await prisma.shipperInvoice.findUnique({
        where: { id },
        include: { lineItems: true }
      });

      if (!invoice) {
        return ApiResponse.error(res, 'Invoice not found', 404);
      }

      if (invoice.status !== 'DRAFT') {
        return ApiResponse.error(res, 'Only draft invoices can be updated', 400);
      }

      // If line items provided, update them
      if (lineItems) {
        // Delete existing line items
        await prisma.invoiceLineItem.deleteMany({
          where: { invoiceId: id }
        });

        // Calculate new subtotal
        let subtotal = 0;
        lineItems.forEach(item => {
          subtotal += parseFloat(item.amount);
        });

        const taxAmount = taxRate ? subtotal * (taxRate / 100) : invoice.taxAmount;
        const total = subtotal + parseFloat(taxAmount);

        // Update invoice with new line items
        const updatedInvoice = await prisma.shipperInvoice.update({
          where: { id },
          data: {
            subtotal,
            taxAmount,
            total,
            notes: notes || invoice.notes,
            lineItems: {
              create: lineItems
            }
          },
          include: {
            lineItems: true,
            shipperClient: true,
            load: true
          }
        });

        return ApiResponse.success(res, updatedInvoice, 'Invoice updated successfully');
      }

      // Update only notes if no line items
      const updatedInvoice = await prisma.shipperInvoice.update({
        where: { id },
        data: { notes },
        include: {
          lineItems: true,
          shipperClient: true,
          load: true
        }
      });

      return ApiResponse.success(res, updatedInvoice, 'Invoice updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Issue invoice
  async issueInvoice(req, res, next) {
    try {
      const { id } = req.params;

      const invoice = await prisma.shipperInvoice.findUnique({
        where: { id },
        include: {
          shipperClient: true,
          load: true
        }
      });

      if (!invoice) {
        return ApiResponse.error(res, 'Invoice not found', 404);
      }

      if (invoice.status !== 'DRAFT') {
        return ApiResponse.error(res, 'Invoice already issued', 400);
      }

      const updatedInvoice = await prisma.shipperInvoice.update({
        where: { id },
        data: {
          status: 'SENT',
          issuedAt: new Date()
        },
        include: {
          lineItems: true,
          shipperClient: true,
          load: true
        }
      });

      // Send notification to shipper
      await notificationService.notifyInvoiceIssued(updatedInvoice, invoice.shipperClient);

      // TODO: Send email with invoice PDF

      return ApiResponse.success(res, updatedInvoice, 'Invoice issued successfully');
    } catch (error) {
      next(error);
    }
  }

  // Mark as paid
  async markAsPaid(req, res, next) {
    try {
      const { id } = req.params;
      const { paymentMethod, paymentReference, paidAt } = req.body;

      const invoice = await prisma.shipperInvoice.findUnique({
        where: { id },
        include: { shipperClient: true }
      });

      if (!invoice) {
        return ApiResponse.error(res, 'Invoice not found', 404);
      }

      if (invoice.status === 'PAID') {
        return ApiResponse.error(res, 'Invoice already paid', 400);
      }

      if (invoice.status === 'CANCELLED') {
        return ApiResponse.error(res, 'Cannot mark cancelled invoice as paid', 400);
      }

      const updatedInvoice = await prisma.shipperInvoice.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          paymentMethod,
          paymentReference
        }
      });

      // Update shipper client balance
      await prisma.shipperClient.update({
        where: { id: invoice.shipperClientId },
        data: {
          currentBalance: {
            decrement: parseFloat(invoice.total)
          }
        }
      });

      return ApiResponse.success(res, updatedInvoice, 'Invoice marked as paid');
    } catch (error) {
      next(error);
    }
  }

  // Cancel invoice
  async cancelInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const invoice = await prisma.shipperInvoice.findUnique({
        where: { id }
      });

      if (!invoice) {
        return ApiResponse.error(res, 'Invoice not found', 404);
      }

      if (invoice.status === 'PAID') {
        return ApiResponse.error(res, 'Cannot cancel paid invoice', 400);
      }

      const updatedInvoice = await prisma.shipperInvoice.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: reason || invoice.notes
        }
      });

      return ApiResponse.success(res, updatedInvoice, 'Invoice cancelled');
    } catch (error) {
      next(error);
    }
  }

  // Get invoice statistics
  async getInvoiceStats(req, res, next) {
    try {
      const { shipperClientId, dateFrom, dateTo } = req.query;

      const where = {
        deletedAt: null
      };

      if (shipperClientId) where.shipperClientId = shipperClientId;

      if (dateFrom || dateTo) {
        where.issuedAt = {};
        if (dateFrom) where.issuedAt.gte = new Date(dateFrom);
        if (dateTo) where.issuedAt.lte = new Date(dateTo);
      }

      const [totalInvoices, paidInvoices, overdueInvoices, draftInvoices] = await Promise.all([
        prisma.shipperInvoice.count({ where }),
        prisma.shipperInvoice.count({ where: { ...where, status: 'PAID' } }),
        prisma.shipperInvoice.count({
          where: {
            ...where,
            status: { in: ['SENT', 'OVERDUE'] },
            dueDate: { lt: new Date() }
          }
        }),
        prisma.shipperInvoice.count({ where: { ...where, status: 'DRAFT' } })
      ]);

      // Calculate revenue
      const invoices = await prisma.shipperInvoice.findMany({
        where,
        select: { total: true, status: true }
      });

      const totalRevenue = invoices.reduce((sum, inv) => sum + parseFloat(inv.total), 0);
      const paidRevenue = invoices
        .filter(inv => inv.status === 'PAID')
        .reduce((sum, inv) => sum + parseFloat(inv.total), 0);
      const outstandingRevenue = invoices
        .filter(inv => inv.status !== 'PAID' && inv.status !== 'CANCELLED')
        .reduce((sum, inv) => sum + parseFloat(inv.total), 0);

      const stats = {
        totalInvoices,
        paidInvoices,
        overdueInvoices,
        draftInvoices,
        totalRevenue: totalRevenue.toFixed(2),
        paidRevenue: paidRevenue.toFixed(2),
        outstandingRevenue: outstandingRevenue.toFixed(2)
      };

      return ApiResponse.success(res, stats);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InvoiceController();
