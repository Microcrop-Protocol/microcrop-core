import path from 'path';
import fs from 'fs/promises';
import blogService from '../services/blog.service.js';
import { formatResponse, formatPaginatedResponse } from '../utils/helpers.js';
import { absoluteUrl } from '../utils/blog.utils.js';
import { ValidationError } from '../utils/errors.js';

export const blogAdminController = {
  async listPosts(req, res, next) {
    try {
      const result = await blogService.listAllPosts(req.query);
      res
        .status(200)
        .json(formatPaginatedResponse(result.data, result.total, result.page, result.limit));
    } catch (error) {
      next(error);
    }
  },

  async getPost(req, res, next) {
    try {
      const post = await blogService.getAdminPostById(req.params.id);
      res.status(200).json(formatResponse(post));
    } catch (error) {
      next(error);
    }
  },

  async createPost(req, res, next) {
    try {
      const post = await blogService.createPost(req.user.id, req.body);
      res.status(201).json(formatResponse(post));
    } catch (error) {
      next(error);
    }
  },

  async updatePost(req, res, next) {
    try {
      const post = await blogService.updatePost(req.params.id, req.body);
      res.status(200).json(formatResponse(post));
    } catch (error) {
      next(error);
    }
  },

  async publishPost(req, res, next) {
    try {
      const post = await blogService.publishPost(req.params.id, req.body);
      res.status(200).json(formatResponse(post));
    } catch (error) {
      next(error);
    }
  },

  async unpublishPost(req, res, next) {
    try {
      const post = await blogService.unpublishPost(req.params.id);
      res.status(200).json(formatResponse(post));
    } catch (error) {
      next(error);
    }
  },

  async deletePost(req, res, next) {
    try {
      await blogService.deletePost(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },

  // Returns the stored path + absolute URL so the dashboard can drop it into the post
  // body. The dashboard reads natural dimensions from the loaded image and sends them
  // along with createPost/updatePost as coverImageWidth/coverImageHeight.
  async uploadImage(req, res, next) {
    try {
      if (!req.file) throw new ValidationError('Image file is required (field name: image)');
      const storedPath = `/uploads/${req.file.filename}`;
      res.status(201).json(
        formatResponse({
          path: storedPath,
          url: absoluteUrl(storedPath),
          mimeType: req.file.mimetype,
          size: req.file.size,
        }),
      );
    } catch (error) {
      if (req.file?.filename) {
        fs.unlink(path.join(process.cwd(), 'uploads', req.file.filename)).catch(() => {});
      }
      next(error);
    }
  },

  async listCategories(_req, res, next) {
    try {
      const data = await blogService.listAdminCategories();
      res.status(200).json(formatResponse(data));
    } catch (error) {
      next(error);
    }
  },

  async createCategory(req, res, next) {
    try {
      const data = await blogService.createCategory(req.body);
      res.status(201).json(formatResponse(data));
    } catch (error) {
      next(error);
    }
  },

  async updateCategory(req, res, next) {
    try {
      const data = await blogService.updateCategory(req.params.id, req.body);
      res.status(200).json(formatResponse(data));
    } catch (error) {
      next(error);
    }
  },

  async deleteCategory(req, res, next) {
    try {
      await blogService.deleteCategory(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },

  async listTags(_req, res, next) {
    try {
      const data = await blogService.listTags();
      res.status(200).json(formatResponse(data));
    } catch (error) {
      next(error);
    }
  },

  async createTag(req, res, next) {
    try {
      const data = await blogService.createTag(req.body);
      res.status(201).json(formatResponse(data));
    } catch (error) {
      next(error);
    }
  },

  async deleteTag(req, res, next) {
    try {
      await blogService.deleteTag(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
};

export default blogAdminController;
