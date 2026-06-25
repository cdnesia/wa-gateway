import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createLogger } from './utils/logger.js';
import { sessionManager } from './handlers/session-manager.js';
import { authMiddleware } from './middleware/auth.js';
import messageRoutes from './routes/message.js';
import sessionRoutes from './routes/session.js';
import webhookRoutes from './routes/webhook.js';
import qrPageRoutes from './routes/qr-page.js';

const logger = createLogger('App');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
        },
    },
}));
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting Sederhana ──────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;  // 1 menit
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT || '60'); // 60 req/menit

app.use((req, res, next) => {
    // Skip health check dan QR page
    if (req.path === '/health' || req.path.startsWith('/scan')) return next();

    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

    if (now > entry.resetAt) {
        entry.count = 1;
        entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    } else {
        entry.count++;
    }

    rateLimitMap.set(ip, entry);

    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ success: false, message: 'Too many requests — coba lagi nanti' });
    }

    next();
});

app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.url }, 'Incoming request');
    next();
});

app.use('/api/session', authMiddleware, sessionRoutes);
app.use('/api/message', authMiddleware, messageRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/scan', qrPageRoutes);

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'wa-gateway',
        sessions: sessionManager.listSessions(),
        totalConnected: sessionManager.totalConnected(),
        timestamp: new Date().toISOString(),
    });
});

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

app.use((err, req, res, next) => {
    logger.error(err, 'Unhandled error');
    res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, async () => {
    logger.info(`WA Gateway running on port ${PORT}`);

    // Auto-init sesi dari env: SESSIONS=sesi1,sesi2,sesi3
    const sessionIds = (process.env.SESSIONS || 'default').split(',').map(s => s.trim()).filter(Boolean);
    for (const id of sessionIds) {
        await sessionManager.addSession(id);
    }

    logger.info({ sessions: sessionIds }, 'Sessions initialized');
});