import prisma from '../config/database.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

export async function loadOrganization(req, _res, next) {
  try {
    let org = null;

    if (req.user && req.user.organizationId) {
      // JWT auth: always resolve org from the authenticated user's organizationId
      org = await prisma.organization.findUnique({
        where: { id: req.user.organizationId },
      });
    } else if (!req.user) {
      // Service-to-service: use API key only when no JWT user is present
      const apiKey = req.headers['x-api-key'];
      if (apiKey) {
        org = await prisma.organization.findUnique({
          where: { apiKey },
        });
      }
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
