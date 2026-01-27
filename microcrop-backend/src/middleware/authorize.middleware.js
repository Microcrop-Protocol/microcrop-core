import { ForbiddenError } from '../utils/errors.js';
import { ROLES } from '../utils/constants.js';

export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    // Platform admin has access to everything
    if (req.user.role === ROLES.PLATFORM_ADMIN) {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}
