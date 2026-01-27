import prisma from '../config/database.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export async function loadOrganization(req, _res, next) {
  try {
    let org = null;

    // Method 1: API Key header
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      org = await prisma.organization.findUnique({
        where: { apiKey },
      });
    }

    // Method 2: JWT organizationId
    if (!org && req.user && req.user.organizationId) {
      org = await prisma.organization.findUnique({
        where: { id: req.user.organizationId },
      });
    }

    if (!org) {
      throw new UnauthorizedError('Organization not found');
    }

    if (!org.isActive) {
      throw new ForbiddenError('Organization is deactivated');
    }

    req.organization = org;
    next();
  } catch (error) {
    next(error);
  }
}
