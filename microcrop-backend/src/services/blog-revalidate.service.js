import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

const TIMEOUT_MS = 5000;

// Fire-and-forget. Marketing site rebuilds the post page on its own; failures here
// must never block a publish or update. Logged so ops can spot a misconfigured webhook.
export function triggerRevalidate(slug, event) {
  if (!env.blogRevalidateUrl || !env.blogRevalidateSecret) return;

  axios
    .post(
      env.blogRevalidateUrl,
      { slug, event },
      {
        headers: { 'x-revalidate-secret': env.blogRevalidateSecret },
        timeout: TIMEOUT_MS,
      },
    )
    .then(() => {
      logger.info({ slug, event }, 'blog revalidate webhook ok');
    })
    .catch((err) => {
      logger.warn(
        { slug, event, status: err.response?.status, message: err.message },
        'blog revalidate webhook failed',
      );
    });
}
