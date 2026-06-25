import { Router } from 'express';
import { sessionManager } from '../handlers/session-manager.js';
import { createLogger } from '../utils/logger.js';

const router = Router();
const logger = createLogger('SessionRoutes');

// List semua sesi
router.get('/', (req, res) => {
    res.json({
        success: true,
        data: {
            sessions: sessionManager.listSessions(),
            totalConnected: sessionManager.totalConnected(),
            totalSessions: sessionManager.totalSessions(),
        },
    });
});

// Tambah sesi baru
router.post('/add', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(422).json({ success: false, message: 'Field sessionId wajib diisi' });
    }

    try {
        await sessionManager.addSession(sessionId);
        res.json({ success: true, message: `Session '${sessionId}' ditambahkan. Gunakan GET /api/session/${sessionId}/qr untuk mendapatkan QR code.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Ambil QR code via API (untuk Postman/CLI)
router.get('/:sessionId/qr', async (req, res) => {
    const client = sessionManager.getSession(req.params.sessionId);
    if (!client) {
        return res.status(404).json({ success: false, message: 'Session tidak ditemukan' });
    }

    if (client.isConnected()) {
        return res.json({
            success: true,
            data: {
                sessionId: req.params.sessionId,
                connected: true,
                phone: client.getPhone(),
                qrAvailable: false,
            },
            message: 'Session sudah terhubung, tidak perlu QR.',
        });
    }

    const qrBase64 = client.getQR();
    const qrTerminal = client.getQRTerminal();
    logger.info({ sessionId: req.params.sessionId, hasQR: !!qrBase64, connected: client.isConnected() }, 'QR requested');

    if (!qrBase64 && !qrTerminal) {
        return res.json({
            success: true,
            data: {
                sessionId: req.params.sessionId,
                connected: false,
                qrAvailable: false,
            },
            message: 'QR belum tersedia, coba lagi dalam beberapa detik.',
        });
    }

    res.json({
        success: true,
        data: {
            sessionId: req.params.sessionId,
            connected: false,
            qrAvailable: true,
            qrBase64: qrBase64 || null,
            qrTerminal: qrTerminal || null,
        },
    });
});

// Status sesi tertentu
router.get('/:sessionId/status', (req, res) => {
    const client = sessionManager.getSession(req.params.sessionId);
    if (!client) {
        return res.status(404).json({ success: false, message: 'Session tidak ditemukan' });
    }
    res.json({
        success: true,
        data: {
            sessionId: req.params.sessionId,
            connected: client.isConnected(),
            phone: client.getPhone(),
            qrAvailable: !client.isConnected() && !!client.getQR(),
        },
    });
});

// Hapus sesi
router.delete('/:sessionId', async (req, res) => {
    try {
        const removed = await sessionManager.removeSession(req.params.sessionId);
        if (!removed) return res.status(404).json({ success: false, message: 'Session tidak ditemukan' });
        res.json({ success: true, message: `Session '${req.params.sessionId}' dihapus` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;