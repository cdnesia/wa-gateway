import { Router } from 'express';
import { sessionManager } from '../handlers/session-manager.js';

const router = Router();

// Kirim teks — round-robin jika sessionId tidak diisi
router.post('/send-text', async (req, res) => {
    const { phone, message, sessionId = null } = req.body;

    if (!phone || !message) {
        return res.status(422).json({ success: false, message: 'Field phone dan message wajib diisi' });
    }

    try {
        const { sessionId: usedSession, client } = sessionManager.resolveSession(sessionId);
        const result = await client.sendText(phone, message);
        res.json({
            success: true,
            message: 'Pesan berhasil dikirim',
            data: { messageId: result?.key?.id, to: phone, sentVia: usedSession },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Kirim gambar
router.post('/send-image', async (req, res) => {
    const { phone, image, caption = '', sessionId = null } = req.body;

    if (!phone || !image) {
        return res.status(422).json({ success: false, message: 'Field phone dan image wajib diisi' });
    }

    try {
        let buffer;
        if (image.startsWith('http://') || image.startsWith('https://')) {
            const response = await fetch(image);
            buffer = Buffer.from(await response.arrayBuffer());
        } else {
            buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        }

        const { sessionId: usedSession, client } = sessionManager.resolveSession(sessionId);
        const result = await client.sendImage(phone, buffer, caption);
        res.json({
            success: true,
            message: 'Gambar berhasil dikirim',
            data: { messageId: result?.key?.id, to: phone, sentVia: usedSession },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Kirim dokumen
router.post('/send-document', async (req, res) => {
    const { phone, document, filename, mimetype = 'application/octet-stream', sessionId = null } = req.body;

    if (!phone || !document || !filename) {
        return res.status(422).json({ success: false, message: 'Field phone, document, dan filename wajib diisi' });
    }

    try {
        const buffer = Buffer.from(document.replace(/^data:[^;]+;base64,/, ''), 'base64');
        const { sessionId: usedSession, client } = sessionManager.resolveSession(sessionId);
        const result = await client.sendDocument(phone, buffer, filename, mimetype);
        res.json({
            success: true,
            message: 'Dokumen berhasil dikirim',
            data: { messageId: result?.key?.id, to: phone, sentVia: usedSession },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Cek nomor
router.post('/check-number', async (req, res) => {
    const { phone, sessionId = null } = req.body;

    if (!phone) {
        return res.status(422).json({ success: false, message: 'Field phone wajib diisi' });
    }

    try {
        const { client } = sessionManager.resolveSession(sessionId);
        const result = await client.checkNumber(phone);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;