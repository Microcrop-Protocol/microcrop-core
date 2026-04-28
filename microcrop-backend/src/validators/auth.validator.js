import Joi from 'joi';

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one number, and one special character',
    }),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  phone: Joi.string()
    .pattern(/^\+254\d{9}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Phone must be a valid Kenyan number (+254XXXXXXXXX)',
    }),
  role: Joi.string()
    .valid('ORG_ADMIN', 'ORG_STAFF', 'FARMER')
    .required(),
  organizationId: Joi.string()
    .uuid()
    .when('role', {
      is: Joi.string().valid('ORG_ADMIN', 'ORG_STAFF'),
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const updateMeSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  phone: Joi.string()
    .pattern(/^\+254\d{9}$/)
    .optional()
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Phone must be a valid Kenyan number (+254XXXXXXXXX)',
    }),
  // Author profile fields (used when this user authors blog Posts)
  bio: Joi.string().max(500).optional().allow(null, ''),
  avatarUrl: Joi.string().max(500).optional().allow(null, ''),
  displayRole: Joi.string().max(100).optional().allow(null, ''),
}).min(1);

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/)
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one number, and one special character',
    }),
});
