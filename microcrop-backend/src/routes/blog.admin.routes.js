import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { blogImage, handleUploadError } from '../middleware/upload.middleware.js';
import {
  adminListPostsSchema,
  createPostSchema,
  updatePostSchema,
  publishPostSchema,
  idParamSchema,
  createCategorySchema,
  updateCategorySchema,
  createTagSchema,
} from '../validators/blog.validator.js';
import { blogAdminController } from '../controllers/blog.admin.controller.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

// Blog authoring is platform-only.
router.use(authenticate, authorize(ROLES.PLATFORM_ADMIN));

// Posts
router.get('/posts', validate(adminListPostsSchema, 'query'), blogAdminController.listPosts);
router.post('/posts', validate(createPostSchema), blogAdminController.createPost);
router.get('/posts/:id', validate(idParamSchema, 'params'), blogAdminController.getPost);
router.patch(
  '/posts/:id',
  validate(idParamSchema, 'params'),
  validate(updatePostSchema),
  blogAdminController.updatePost,
);
router.delete('/posts/:id', validate(idParamSchema, 'params'), blogAdminController.deletePost);
router.post(
  '/posts/:id/publish',
  validate(idParamSchema, 'params'),
  validate(publishPostSchema),
  blogAdminController.publishPost,
);
router.post(
  '/posts/:id/unpublish',
  validate(idParamSchema, 'params'),
  blogAdminController.unpublishPost,
);

// Image upload — multipart, field name "image"
router.post('/uploads', blogImage, handleUploadError, blogAdminController.uploadImage);

// Categories
router.get('/categories', blogAdminController.listCategories);
router.post('/categories', validate(createCategorySchema), blogAdminController.createCategory);
router.patch(
  '/categories/:id',
  validate(idParamSchema, 'params'),
  validate(updateCategorySchema),
  blogAdminController.updateCategory,
);
router.delete(
  '/categories/:id',
  validate(idParamSchema, 'params'),
  blogAdminController.deleteCategory,
);

// Tags
router.get('/tags', blogAdminController.listTags);
router.post('/tags', validate(createTagSchema), blogAdminController.createTag);
router.delete('/tags/:id', validate(idParamSchema, 'params'), blogAdminController.deleteTag);

export const blogAdminRouter = router;
