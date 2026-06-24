import 'dotenv/config';
import express from 'express';
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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