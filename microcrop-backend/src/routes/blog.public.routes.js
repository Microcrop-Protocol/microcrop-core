import { Router } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { listPostsSchema, slugParamSchema } from '../validators/blog.validator.js';
import { blogPublicController } from '../controllers/blog.public.controller.js';

const router = Router();

router.get('/posts', validate(listPostsSchema, 'query'), blogPublicController.listPosts);
router.get('/posts/:slug', validate(slugParamSchema, 'params'), blogPublicController.getPostBySlug);
router.get('/categories', blogPublicController.listCategories);

export const blogPublicRouter = router;
