import prisma from '../config/database.js';
import { paginate } from '../utils/helpers.js';
import {
  slugify,
  suffixSlug,
  calcReadingTime,
  serializePost,
  serializePostSummary,
} from '../utils/blog.utils.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { triggerRevalidate } from './blog-revalidate.service.js';

// Minimal include used by both list & get — keeps response shape consistent.
const POST_INCLUDE = {
  author: true,
  category: true,
  tags: { include: { tag: true } },
};

// ============================================
// Public reads
// ============================================

const blogService = {
  async listPublishedPosts({ page = 1, pageSize = 20, category, tag } = {}) {
    const { skip, take, page: p, limit } = paginate(page, Math.min(pageSize, 50));

    const where = {
      status: 'PUBLISHED',
      publishedAt: { lte: new Date() },
      ...(category && { category: { slug: category } }),
      ...(tag && { tags: { some: { tag: { slug: tag } } } }),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take,
        include: POST_INCLUDE,
        orderBy: { publishedAt: 'desc' },
      }),
      prisma.post.count({ where }),
    ]);

    return {
      data: posts.map(serializePostSummary),
      pagination: {
        page: p,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getPublishedPostBySlug(slug) {
    const now = new Date();
    const post = await prisma.post.findFirst({
      where: { slug, status: 'PUBLISHED', publishedAt: { lte: now } },
      include: POST_INCLUDE,
    });

    if (post) return serializePost(post);

    // Slug might have been renamed — return a redirect signal so the controller can 301.
    const redirect = await prisma.postSlugRedirect.findUnique({ where: { oldSlug: slug } });
    if (redirect) {
      const target = await prisma.post.findFirst({
        where: { id: redirect.postId, status: 'PUBLISHED', publishedAt: { lte: now } },
        select: { slug: true },
      });
      if (target) return { redirectTo: target.slug };
    }

    throw new NotFoundError('Post not found');
  },

  async listCategories() {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            posts: {
              where: { status: 'PUBLISHED', publishedAt: { lte: new Date() } },
            },
          },
        },
      },
    });
    return categories.map((c) => ({ slug: c.slug, name: c.name, postCount: c._count.posts }));
  },

  // ============================================
  // Admin: post CRUD
  // ============================================

  async listAllPosts({ page = 1, pageSize = 20, status, search } = {}) {
    const { skip, take, page: p, limit } = paginate(page, Math.min(pageSize, 50));

    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take,
        include: POST_INCLUDE,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.post.count({ where }),
    ]);

    return {
      data: posts.map(serializePostSummary),
      total,
      page: p,
      limit,
    };
  },

  async getAdminPostById(id) {
    const post = await prisma.post.findUnique({ where: { id }, include: POST_INCLUDE });
    if (!post) throw new NotFoundError('Post not found');
    return serializePost(post);
  },

  async createPost(authorId, data) {
    const slug = await this._reserveSlug(data.slug || slugify(data.title));
    if (!slug) throw new ValidationError('Could not generate a unique slug from the provided title');

    const tags = await this._resolveTagIds(data.tagSlugs || []);

    const post = await prisma.post.create({
      data: {
        slug,
        title: data.title,
        excerpt: data.excerpt,
        body: data.body,
        coverImagePath: data.coverImagePath || null,
        coverImageAlt: data.coverImageAlt || null,
        coverImageWidth: data.coverImageWidth || null,
        coverImageHeight: data.coverImageHeight || null,
        metaTitle: data.metaTitle || null,
        metaDescription: data.metaDescription || null,
        ogImagePath: data.ogImagePath || null,
        readingTimeMinutes: calcReadingTime(data.body),
        status: 'DRAFT',
        authorId,
        categoryId: data.categoryId || null,
        tags: tags.length ? { create: tags.map((tagId) => ({ tagId })) } : undefined,
      },
      include: POST_INCLUDE,
    });

    return serializePost(post);
  },

  async updatePost(id, data) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Post not found');

    let nextSlug = existing.slug;
    if (data.slug && data.slug !== existing.slug) {
      // Once a post has been published its slug is immutable from the URL standpoint,
      // but we still allow rename — the old slug becomes a redirect.
      nextSlug = await this._reserveSlug(slugify(data.slug));
      if (!nextSlug) throw new ValidationError('Slug is already in use');
      if (existing.status === 'PUBLISHED') {
        await prisma.postSlugRedirect.upsert({
          where: { oldSlug: existing.slug },
          update: { postId: existing.id },
          create: { oldSlug: existing.slug, postId: existing.id },
        });
      }
    }

    const update = {
      slug: nextSlug,
      ...(data.title !== undefined && { title: data.title }),
      ...(data.excerpt !== undefined && { excerpt: data.excerpt }),
      ...(data.body !== undefined && {
        body: data.body,
        readingTimeMinutes: calcReadingTime(data.body),
      }),
      ...(data.coverImagePath !== undefined && { coverImagePath: data.coverImagePath }),
      ...(data.coverImageAlt !== undefined && { coverImageAlt: data.coverImageAlt }),
      ...(data.coverImageWidth !== undefined && { coverImageWidth: data.coverImageWidth }),
      ...(data.coverImageHeight !== undefined && { coverImageHeight: data.coverImageHeight }),
      ...(data.metaTitle !== undefined && { metaTitle: data.metaTitle }),
      ...(data.metaDescription !== undefined && { metaDescription: data.metaDescription }),
      ...(data.ogImagePath !== undefined && { ogImagePath: data.ogImagePath }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
    };

    if (data.tagSlugs) {
      const tagIds = await this._resolveTagIds(data.tagSlugs);
      update.tags = {
        deleteMany: {},
        create: tagIds.map((tagId) => ({ tagId })),
      };
    }

    const post = await prisma.post.update({ where: { id }, data: update, include: POST_INCLUDE });

    if (post.status === 'PUBLISHED') {
      triggerRevalidate(post.slug, 'update');
    }

    return serializePost(post);
  },

  async publishPost(id, { scheduledFor } = {}) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Post not found');

    const now = new Date();
    const willSchedule = scheduledFor && new Date(scheduledFor) > now;

    const post = await prisma.post.update({
      where: { id },
      data: {
        status: willSchedule ? 'SCHEDULED' : 'PUBLISHED',
        publishedAt: willSchedule ? new Date(scheduledFor) : existing.publishedAt || now,
        scheduledFor: willSchedule ? new Date(scheduledFor) : null,
      },
      include: POST_INCLUDE,
    });

    if (post.status === 'PUBLISHED') {
      triggerRevalidate(post.slug, 'publish');
    }

    return serializePost(post);
  },

  async unpublishPost(id) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Post not found');

    const post = await prisma.post.update({
      where: { id },
      data: { status: 'UNPUBLISHED' },
      include: POST_INCLUDE,
    });

    triggerRevalidate(post.slug, 'unpublish');
    return serializePost(post);
  },

  async deletePost(id) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Post not found');

    await prisma.post.delete({ where: { id } });

    if (existing.status === 'PUBLISHED') {
      triggerRevalidate(existing.slug, 'unpublish');
    }
    return { id };
  },

  // ============================================
  // Admin: categories & tags
  // ============================================

  async listAdminCategories() {
    const cats = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    });
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      postCount: c._count.posts,
    }));
  },

  async createCategory({ name, slug, description }) {
    const finalSlug = slug ? slugify(slug) : slugify(name);
    const taken = await prisma.category.findUnique({ where: { slug: finalSlug } });
    if (taken) throw new ConflictError('A category with that slug already exists');
    return prisma.category.create({ data: { name, slug: finalSlug, description: description || null } });
  },

  async updateCategory(id, { name, slug, description }) {
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (slug !== undefined) {
      const finalSlug = slugify(slug);
      const taken = await prisma.category.findFirst({ where: { slug: finalSlug, NOT: { id } } });
      if (taken) throw new ConflictError('A category with that slug already exists');
      data.slug = finalSlug;
    }
    return prisma.category.update({ where: { id }, data });
  },

  async deleteCategory(id) {
    await prisma.category.delete({ where: { id } });
    return { id };
  },

  async listTags() {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    });
    return tags.map((t) => ({ id: t.id, slug: t.slug, name: t.name, postCount: t._count.posts }));
  },

  async createTag({ name, slug }) {
    const finalSlug = slug ? slugify(slug) : slugify(name);
    const taken = await prisma.tag.findUnique({ where: { slug: finalSlug } });
    if (taken) throw new ConflictError('A tag with that slug already exists');
    return prisma.tag.create({ data: { name, slug: finalSlug } });
  },

  async deleteTag(id) {
    await prisma.tag.delete({ where: { id } });
    return { id };
  },

  // ============================================
  // Internal helpers
  // ============================================

  // Tries the requested slug; on collision appends a random suffix and tries again.
  // Returns the slug we successfully reserved (i.e. is currently free).
  async _reserveSlug(desired) {
    const base = desired || 'post';
    const candidates = [base, suffixSlug(base), suffixSlug(base), suffixSlug(base)];
    for (const candidate of candidates) {
      const [post, redirect] = await Promise.all([
        prisma.post.findUnique({ where: { slug: candidate } }),
        prisma.postSlugRedirect.findUnique({ where: { oldSlug: candidate } }),
      ]);
      if (!post && !redirect) return candidate;
    }
    return null;
  },

  // Caller passes tag slugs; we upsert any that don't exist yet so the dashboard can
  // create tags inline when authoring a post.
  async _resolveTagIds(slugs) {
    if (!slugs.length) return [];
    const ids = [];
    for (const raw of slugs) {
      const slug = slugify(raw);
      if (!slug) continue;
      const tag = await prisma.tag.upsert({
        where: { slug },
        update: {},
        create: { slug, name: raw },
      });
      ids.push(tag.id);
    }
    return ids;
  },
};

export default blogService;
