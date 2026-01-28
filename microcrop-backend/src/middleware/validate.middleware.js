import { ValidationError } from '../utils/errors.js';

export function validate(schema, property = 'body') {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(new ValidationError('Validation failed', details));
    }

    // req.query is read-only in Express, so merge validated values instead
    if (property === 'query') {
      Object.assign(req.query, value);
    } else {
      req[property] = value;
    }
    next();
  };
}
