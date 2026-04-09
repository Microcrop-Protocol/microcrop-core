import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Mask sensitive fields in log metadata
const SENSITIVE_KEYS = [
  'phoneNumber', 'mpesaPhone', 'mpesaRef', 'nationalId', 'walletAddress', 'resetToken',
  'password', 'apiKey', 'privateKey', 'jwtSecret', 'refreshToken', 'accessToken',
];

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

const isProd = process.env.NODE_ENV === 'production';

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const consoleFormat = isProd
  ? combine(logFormat)
  : combine(colorize(), logFormat);

const fileFormat = isProd
  ? combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      sanitizeFormat,
      winston.format.json()
    )
  : combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      sanitizeFormat,
      logFormat
    );

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    sanitizeFormat,
    logFormat
  ),
  defaultMeta: { service: 'microcrop-backend' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    }),
  ],
});

export const stream = {
  write: (message) => logger.http(message.trim()),
};

export default logger;
