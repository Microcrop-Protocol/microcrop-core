import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';

const herdService = {
  async create(organizationId, data) {
    const { farmerId, name, livestockType, headCount, estimatedValue, latitude, longitude, weatherStationId } = data;

    // Verify farmer belongs to org
    const farmer = await prisma.farmer.findFirst({
      where: { id: farmerId, organizationId },
    });

    if (!farmer) {
      throw new AppError('Farmer not found in this organization', 404, 'FARMER_NOT_FOUND');
    }

    const herd = await prisma.herd.create({
      data: {
        farmerId,
        organizationId,
        name,
        livestockType,
        headCount,
        estimatedValue,
        latitude,
        longitude,
        weatherStationId,
      },
      include: {
        farmer: {
          select: { id: true, firstName: true, lastName: true, phoneNumber: true },
        },
      },
    });

    return herd;
  },

  async list(organizationId, query) {
    const { page = 1, limit = 20, livestockType, farmerId, search } = query;
    const skip = (page - 1) * limit;

    const where = { organizationId };

    if (livestockType) {
      where.livestockType = livestockType;
    }

    if (farmerId) {
      where.farmerId = farmerId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { farmer: { firstName: { contains: search, mode: 'insensitive' } } },
        { farmer: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.herd.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          farmer: {
            select: { id: true, firstName: true, lastName: true, phoneNumber: true },
          },
          _count: { select: { policies: true } },
        },
      }),
      prisma.herd.count({ where }),
    ]);

    return { data, total, page, limit };
  },

  async getById(organizationId, herdId) {
    const herd = await prisma.herd.findFirst({
      where: { id: herdId, organizationId },
      include: {
        farmer: {
          select: { id: true, firstName: true, lastName: true, phoneNumber: true, county: true },
        },
        policies: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            policyNumber: true,
            status: true,
            coverageType: true,
            livestockPeril: true,
            sumInsured: true,
            premium: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!herd) {
      throw new AppError('Herd not found', 404, 'HERD_NOT_FOUND');
    }

    return herd;
  },

  async update(organizationId, herdId, data) {
    const herd = await prisma.herd.findFirst({
      where: { id: herdId, organizationId },
    });

    if (!herd) {
      throw new AppError('Herd not found', 404, 'HERD_NOT_FOUND');
    }

    const updated = await prisma.herd.update({
      where: { id: herdId },
      data,
      include: {
        farmer: {
          select: { id: true, firstName: true, lastName: true, phoneNumber: true },
        },
      },
    });

    return updated;
  },

  async listByFarmer(organizationId, farmerId) {
    const farmer = await prisma.farmer.findFirst({
      where: { id: farmerId, organizationId },
    });

    if (!farmer) {
      throw new AppError('Farmer not found in this organization', 404, 'FARMER_NOT_FOUND');
    }

    const herds = await prisma.herd.findMany({
      where: { farmerId, organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { policies: true } },
      },
    });

    return herds;
  },
};

export default herdService;
