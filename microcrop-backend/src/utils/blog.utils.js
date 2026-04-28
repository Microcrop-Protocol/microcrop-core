import crypto from 'crypto';
import { env } from '../config/env.js';

const WORDS_PER_MINUTE = 200;

export function slugify(input) {
  if (!input) return '';
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function calcReadingTime(markdown) {
  if (!markdown) return 1;
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_~\-]+/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

// Random short suffix for slug collisions: "my-post" → "my-post-a3f2"
export function suffixSlug(base) {
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base}-${suffix}`;
}

// Build absolute URL for a stored upload path. Path is stored as `/uploads/<file>` so
// we always prepend the configured base host.
export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (env.imageCdnBaseUrl || env.publicApiUrl || env.backendUrl || '').replace(/\/$/, '');
  if (!base) return pathOrUrl;
  return `${base}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

// Map a Post row (with author + category + tags) to the public response shape.
export function serializePostSummary(post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    coverImage: post.coverImagePath
      ? {
          url: absoluteUrl(post.coverImagePath),
          alt: post.coverImageAlt || post.title,
          width: post.coverImageWidth || 0,
          height: post.coverImageHeight || 0,
        }
      : null,
    category: post.category ? { slug: post.category.slug, name: post.category.name } : null,
    tags: (post.tags || []).map((pt) => ({ slug: pt.tag.slug, name: pt.tag.name })),
    author: {
      name: `${post.author.firstName} ${post.author.lastName}`.trim(),
      role: post.author.displayRole || '',
      avatarUrl: absoluteUrl(post.author.avatarUrl) || '',
    },
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    updatedAt: post.updatedAt.toISOString(),
    readingTimeMinutes: post.readingTimeMinutes,
  };
}

export function serializePost(post) {
  const summary = serializePostSummary(post);
  return {
    ...summary,
    body: post.body,
    seo: {
      metaTitle: post.metaTitle || undefined,
      metaDescription: post.metaDescription || undefined,
      ogImageUrl: post.ogImagePath
        ? absoluteUrl(post.ogImagePath)
        : summary.coverImage
          ? summary.coverImage.url
          : undefined,
    },
  };
}
