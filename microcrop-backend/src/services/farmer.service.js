import prisma from '../config/database.js';
import { paginate, normalizePhone } from '../utils/helpers.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const farmerService = {
  async register(organizationId, data) {
    try {
      const normalizedPhone = normalizePhone(data.phoneNumber);

      const farmer = await prisma.farmer.create({
        data: {
          ...data,
          phoneNumber: normalizedPhone,
          organizationId,
        },
      });

      return farmer;
    } catch (error) {
      throw error;
    }
  },

  async list(organizationId, filters = {}) {
    try {
      const { skip, take, page, limit } = paginate(filters.page, filters.limit);

      const where = { organizationId };

      if (filters.search) {
        where.OR = [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { phoneNumber: { contains: filters.search } },
        ];
      }

      if (filters.kycStatus) {
        where.kycStatus = filters.kycStatus;
      }

      if (filters.county) {
        where.county = filters.county;
      }

      const [farmers, total] = await Promise.all([
        prisma.farmer.findMany({
          where,
          skip,
          take,
          include: {
            _count: {
              select: {
                plots: true,
                policies: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.farmer.count({ where }),
      ]);

      return { farmers, total };
    } catch (error) {
      throw error;
    }
  },

  async getById(organizationId, farmerId) {
    try {
      const farmer = await prisma.farmer.findFirst({
        where: { id: farmerId, organizationId },
        include: {
          plots: true,
          policies: true,
        },
      });

      if (!farmer) {
        throw new NotFoundError('Farmer not found');
      }

      return farmer;
    } catch (error) {
      throw error;
    }
  },

  async update(organizationId, farmerId, data) {
    try {
      const farmer = await prisma.farmer.findFirst({
        where: { id: farmerId, organizationId },
      });

      if (!farmer) {
        throw new NotFoundError('Farmer not found');
      }

      const updated = await prisma.farmer.update({
        where: { id: farmerId },
        data,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  },

  async updateKyc(organizationId, farmerId, status, reason, approvedBy) {
    try {
      const farmer = await prisma.farmer.findFirst({
        where: { id: farmerId, organizationId },
      });

      if (!farmer) {
        throw new NotFoundError('Farmer not found');
      }

      const updateData = { kycStatus: status };

      if (status === 'APPROVED') {
        updateData.kycApprovedBy = approvedBy;
        updateData.kycApprovedAt = new Date();
      }

      if (status === 'REJECTED') {
        updateData.kycRejectedReason = reason;
      }

      const updated = await prisma.farmer.update({
        where: { id: farmerId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  },

  async createPlot(organizationId, data) {
    try {
      const farmer = await prisma.farmer.findFirst({
        where: { id: data.farmerId, organizationId },
      });

      if (!farmer) {
        throw new NotFoundError('Farmer not found in this organization');
      }

      const plot = await prisma.plot.create({
        data: {
          ...data,
          organizationId,
        },
      });

      return plot;
    } catch (error) {
      throw error;
    }
  },

  async listPlots(organizationId, filters = {}) {
    try {
      const { skip, take, page, limit } = paginate(filters.page, filters.limit);

      const where = { organizationId };

      if (filters.farmerId) {
        where.farmerId = filters.farmerId;
      }

      const [plots, total] = await Promise.all([
        prisma.plot.findMany({
          where,
          skip,
          take,
          include: {
            farmer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.plot.count({ where }),
      ]);

      return { plots, total };
    } catch (error) {
      throw error;
    }
  },

  async getPlot(organizationId, plotId) {
    try {
      const plot = await prisma.plot.findFirst({
        where: { id: plotId, organizationId },
        include: {
          farmer: true,
          policies: true,
        },
      });

      if (!plot) {
        throw new NotFoundError('Plot not found');
      }

      return plot;
    } catch (error) {
      throw error;
    }
  },

  async bulkImport(organizationId, farmersData) {
    try {
      const errors = [];
      const validFarmers = [];
      const seenPhones = new Set();
      const seenNationalIds = new Set();

      // Validate and check for duplicates within the batch
      for (let i = 0; i < farmersData.length; i++) {
        const farmer = farmersData[i];
        const normalizedPhone = normalizePhone(farmer.phoneNumber);

        if (seenPhones.has(normalizedPhone)) {
          errors.push({ row: i + 1, field: 'phoneNumber', message: 'Duplicate phone number within batch' });
          continue;
        }
        if (seenNationalIds.has(farmer.nationalId)) {
          errors.push({ row: i + 1, field: 'nationalId', message: 'Duplicate national ID within batch' });
          continue;
        }

        seenPhones.add(normalizedPhone);
        seenNationalIds.add(farmer.nationalId);
        validFarmers.push({ ...farmer, phoneNumber: normalizedPhone });
      }

      // Check existing farmers in DB
      const existingByPhone = await prisma.farmer.findMany({
        where: {
          organizationId,
          phoneNumber: { in: Array.from(seenPhones) },
        },
        select: { phoneNumber: true },
      });
      const existingPhones = new Set(existingByPhone.map((f) => f.phoneNumber));

      const existingByNationalId = await prisma.farmer.findMany({
        where: {
          organizationId,
          nationalId: { in: Array.from(seenNationalIds) },
        },
        select: { nationalId: true },
      });
      const existingNationalIds = new Set(existingByNationalId.map((f) => f.nationalId));

      const toCreate = [];
      for (const farmer of validFarmers) {
        if (existingPhones.has(farmer.phoneNumber)) {
          errors.push({ row: farmersData.indexOf(farmer) + 1, field: 'phoneNumber', message: 'Phone number already registered' });
          continue;
        }
        if (existingNationalIds.has(farmer.nationalId)) {
          errors.push({ row: farmersData.indexOf(farmer) + 1, field: 'nationalId', message: 'National ID already registered' });
          continue;
        }
        toCreate.push({
          firstName: farmer.firstName,
          lastName: farmer.lastName,
          phoneNumber: farmer.phoneNumber,
          nationalId: farmer.nationalId,
          county: farmer.county,
          subCounty: farmer.subCounty || null,
          ward: farmer.ward || null,
          village: farmer.village || null,
          kycStatus: 'PENDING',
          organizationId,
        });
      }

      let imported = 0;
      if (toCreate.length > 0) {
        const result = await prisma.$transaction(async (tx) => {
          return tx.farmer.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        });
        imported = result.count;
      }

      logger.info('Bulk farmer import completed', {
        organizationId,
        imported,
        skipped: farmersData.length - imported,
        errors: errors.length,
      });

      return {
        imported,
        skipped: farmersData.length - imported,
        errors,
        total: farmersData.length,
      };
    } catch (error) {
      logger.error('Failed to bulk import farmers', { organizationId, error: error.message });
      throw error;
    }
  },

  async bulkImportPlots(organizationId, plotsData) {
    try {
      const errors = [];
      const toCreate = [];

      // Collect all unique farmer phones
      const uniquePhones = [...new Set(plotsData.map((p) => normalizePhone(p.farmerPhone)))];

      // Look up all farmers at once
      const farmers = await prisma.farmer.findMany({
        where: {
          organizationId,
          phoneNumber: { in: uniquePhones },
        },
        select: { id: true, phoneNumber: true },
      });
      const farmerByPhone = new Map(farmers.map((f) => [f.phoneNumber, f.id]));

      for (let i = 0; i < plotsData.length; i++) {
        const plot = plotsData[i];
        const normalizedPhone = normalizePhone(plot.farmerPhone);
        const farmerId = farmerByPhone.get(normalizedPhone);

        if (!farmerId) {
          errors.push({ row: i + 1, field: 'farmerPhone', message: `Farmer not found with phone: ${plot.farmerPhone}` });
          continue;
        }

        toCreate.push({
          name: plot.plotName,
          latitude: plot.latitude,
          longitude: plot.longitude,
          acreage: plot.acreage,
          cropType: plot.cropType,
          farmerId,
          organizationId,
        });
      }

      let imported = 0;
      if (toCreate.length > 0) {
        const result = await prisma.$transaction(async (tx) => {
          return tx.plot.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        });
        imported = result.count;
      }

      logger.info('Bulk plot import completed', {
        organizationId,
        imported,
        skipped: plotsData.length - imported,
        errors: errors.length,
      });

      return {
        imported,
        skipped: plotsData.length - imported,
        errors,
        total: plotsData.length,
      };
    } catch (error) {
      logger.error('Failed to bulk import plots', { organizationId, error: error.message });
      throw error;
    }
  },
};

export default farmerService;
