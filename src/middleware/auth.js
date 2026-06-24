import { createLogger } from '../utils/logger.js';

const logger = createLogger('Auth');

export function authMiddleware(req, res, next) {
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        logger.warn('API_KEY tidak di-set — semua request diizinkan');
        return next();
    }

    const providedKey =
        req.headers['x-api-key'] ||
        req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!providedKey || providedKey !== apiKey) {
        logger.warn({ ip: req.ip, url: req.url }, 'Unauthorized request');
        return res.status(401).json({ success: false, message: 'Unauthorized — API key tidak valid' });
    }

    next();
}