import { Router } from 'express';
import NodeCache from 'node-cache';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const webhookCache = new NodeCache({ stdTTL: 0 });

// Semua route webhook butuh auth
router.use(authMiddleware);

router.post('/set', (req, res) => {
    const { url, events, secret } = req.body;

    if (!url) {
        return res.status(422).json({ success: false, message: 'Field url wajib diisi' });
    }

    try {
        new URL(url);
    } catch {
        return res.status(422).json({ success: false, message: 'URL tidak valid' });
    }

    webhookCache.set('config', { url, events: events || ['*'], secret: secret || null });

    res.json({
        success: true,
        message: 'Webhook berhasil dikonfigurasi',
        data: { url, events: events || ['*'] },
    });
});

router.get('/config', (req, res) => {
    const config = webhookCache.get('config');
    if (!config) {
        return res.json({ success: true, data: null, message: 'Webhook belum dikonfigurasi' });
    }
    res.json({ success: true, data: { url: config.url, events: config.events } });
});

router.delete('/remove', (req, res) => {
    webhookCache.del('config');
    res.json({ success: true, message: 'Webhook dihapus' });
});

export { webhookCache };
export default router;