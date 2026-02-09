import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Mask sensitive fields in log metadata
const SENSITIVE_KEYS = ['phoneNumber', 'mpesaPhone', 'mpesaRef', 'nationalId', 'walletAddress'];

function maskValue(key, value) {
  if (!value || typeof value !== 'string') return value;
  if (SENSITIVE_KEYS.includes(key)) {
    return value.length > 4 ? '****' + value.slice(-4) : '****';
  }
  return value;
}

function sanitizeMeta(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitizeMeta(item));
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      cleaned[key] = sanitizeMeta(value);
    } else {
      cleaned[key] = maskValue(key, value);
    }
  }
  return cleaned;
}

const sanitizeFormat = winston.format((info) => {
  for (const key of SENSITIVE_KEYS) {
    if (info[key]) info[key] = maskValue(key, info[key]);
  }
  return info;
})();

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    sanitizeFormat,
    logFormat
  ),
  defaultMeta: { service: 'microcrop-backend' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
});

export const stream = {
  write: (message) => logger.http(message.trim()),
};

export default logger;
