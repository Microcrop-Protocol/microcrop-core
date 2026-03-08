import prisma from '../config/database.js';
import { AppError } from '../utils/errors.js';

const insuranceUnitService = {
  async create(data) {
    const existing = await prisma.insuranceUnit.findUnique({
      where: { unitCode: data.unitCode },
    });

    if (existing) {
      throw new AppError(`Insurance unit with code "${data.unitCode}" already exists`, 409, 'UNIT_EXISTS');
    }

    return prisma.insuranceUnit.create({ data });
  },

  async list(query = {}) {
    const { page = 1, limit = 50, county, isActive } = query;
    const skip = (page - 1) * limit;

    const where = {};
    if (county) where.county = { contains: county, mode: 'insensitive' };
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      prisma.insuranceUnit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { county: 'asc' },
        include: {
          _count: { select: { herds: true, policies: true, forageAlerts: true } },
        },
      }),
      prisma.insuranceUnit.count({ where }),
    ]);

    return { data, total, page, limit };
  },

  async getById(id) {
    const unit = await prisma.insuranceUnit.findUnique({
      where: { id },
      include: {
        _count: { select: { herds: true, policies: true, forageAlerts: true } },
      },
    });

    if (!unit) {
      throw new AppError('Insurance unit not found', 404, 'UNIT_NOT_FOUND');
    }

    return unit;
  },

  async getByCode(unitCode) {
    const unit = await prisma.insuranceUnit.findUnique({
      where: { unitCode },
    });

    if (!unit) {
      throw new AppError(`Insurance unit "${unitCode}" not found`, 404, 'UNIT_NOT_FOUND');
    }

    return unit;
  },

  async getByCounty(county) {
    return prisma.insuranceUnit.findFirst({
      where: {
        county: { equals: county, mode: 'insensitive' },
        isActive: true,
      },
    });
  },

  async update(id, data) {
    const unit = await prisma.insuranceUnit.findUnique({ where: { id } });
    if (!unit) {
      throw new AppError('Insurance unit not found', 404, 'UNIT_NOT_FOUND');
    }

    return prisma.insuranceUnit.update({ where: { id }, data });
  },

  async addNDVIReading(data) {
    const { insuranceUnitId, season, year, captureDate, ndviValue, cumulativeNDVI, source } = data;

    const unit = await prisma.insuranceUnit.findUnique({ where: { id: insuranceUnitId } });
    if (!unit) {
      throw new AppError('Insurance unit not found', 404, 'UNIT_NOT_FOUND');
    }

    return prisma.insuranceUnitNDVI.create({
      data: {
        insuranceUnitId,
        season,
        year,
        captureDate: new Date(captureDate),
        ndviValue,
        cumulativeNDVI,
        source: source || 'MODIS',
      },
    });
  },

  async getNDVIReadings(insuranceUnitId, season, year) {
    return prisma.insuranceUnitNDVI.findMany({
      where: { insuranceUnitId, season, year },
      orderBy: { captureDate: 'asc' },
    });
  },

  async getLatestNDVI(insuranceUnitId, season, year) {
    return prisma.insuranceUnitNDVI.findFirst({
      where: { insuranceUnitId, season, year },
      orderBy: { captureDate: 'desc' },
    });
  },
};

export default insuranceUnitService;
