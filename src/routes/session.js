import { Router } from 'express';
import { sessionManager } from '../handlers/session-manager.js';

const router = Router();

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
        res.json({ success: true, message: `Session '${sessionId}' ditambahkan, scan QR di /scan/${sessionId}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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