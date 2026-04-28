import Joi from 'joi';

// Public reads
export const listPostsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(50).optional(),
  category: Joi.string().optional(),
  tag: Joi.string().optional(),
});

export const slugParamSchema = Joi.object({
  slug: Joi.string().min(1).max(120).required(),
});

// Admin: posts
export const adminListPostsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(50).optional(),
  status: Joi.string().valid('DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED').optional(),
  search: Joi.string().optional(),
});

export const createPostSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  slug: Joi.string().max(120).optional(),
  excerpt: Joi.string().max(280).required(),
  body: Joi.string().required(),
  coverImagePath: Joi.string().uri({ relativeOnly: true }).optional(),
  coverImageAlt: Joi.string().max(200).optional(),
  coverImageWidth: Joi.number().integer().min(1).optional(),
  coverImageHeight: Joi.number().integer().min(1).optional(),
  metaTitle: Joi.string().max(200).optional(),
  metaDescription: Joi.string().max(300).optional(),
  ogImagePath: Joi.string().uri({ relativeOnly: true }).optional(),
  categoryId: Joi.string().uuid().optional().allow(null, ''),
  tagSlugs: Joi.array().items(Joi.string().max(60)).optional(),
});

export const updatePostSchema = createPostSchema.fork(
  ['title', 'excerpt', 'body'],
  (s) => s.optional(),
);

export const publishPostSchema = Joi.object({
  scheduledFor: Joi.date().iso().optional(),
});

export const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// Admin: categories
export const createCategorySchema = Joi.object({
  name: Joi.string().min(1).max(80).required(),
  slug: Joi.string().max(80).optional(),
  description: Joi.string().max(500).optional(),
});

export const updateCategorySchema = Joi.object({
  name: Joi.string().min(1).max(80).optional(),
  slug: Joi.string().max(80).optional(),
  description: Joi.string().max(500).optional().allow(null, ''),
});

// Admin: tags
export const createTagSchema = Joi.object({
  name: Joi.string().min(1).max(60).required(),
  slug: Joi.string().max(60).optional(),
});
