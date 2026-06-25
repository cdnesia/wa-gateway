import { Router } from 'express';
import QRCode from 'qrcode';
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

    const qrString = client.getQR();
    if (!qrString) {
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

    const qrBase64 = await QRCode.toDataURL(qrString);
    const qrTerminal = await QRCode.toString(qrString, { type: 'terminal', small: true });

    res.json({
        success: true,
        data: {
            sessionId: req.params.sessionId,
            connected: false,
            qrAvailable: true,
            qrBase64,
            qrTerminal,
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