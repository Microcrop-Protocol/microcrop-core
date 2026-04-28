import blogService from '../services/blog.service.js';

const CACHE_HEADER_VALUE = 'public, s-maxage=60, stale-while-revalidate=300';

export const blogPublicController = {
  async listPosts(req, res, next) {
    try {
      const result = await blogService.listPublishedPosts(req.query);
      res.set('Cache-Control', CACHE_HEADER_VALUE);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getPostBySlug(req, res, next) {
    try {
      const result = await blogService.getPublishedPostBySlug(req.params.slug);

      // Slug was renamed — tell the marketing site where the post lives now.
      if (result.redirectTo) {
        res.set('Cache-Control', CACHE_HEADER_VALUE);
        return res.status(301).json({
          error: { code: 'POST_MOVED', message: 'Post slug changed', redirectTo: result.redirectTo },
        });
      }

      res.set('Cache-Control', CACHE_HEADER_VALUE);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  async listCategories(_req, res, next) {
    try {
      const data = await blogService.listCategories();
      res.set('Cache-Control', CACHE_HEADER_VALUE);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  },
};

export default blogPublicController;
