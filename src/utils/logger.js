import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export function createLogger(name) {
  return pino(
    {
      name,
      level: process.env.LOG_LEVEL || 'info',
    },
    isDev
      ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
      : undefined
  );
}