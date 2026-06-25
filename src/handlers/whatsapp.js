import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { sendWebhook } from '../utils/webhook.js';

const logger = createLogger('WhatsApp');

export class WhatsAppClient {
    constructor(sessionId = 'default') {
        this.sessionId = sessionId;
        this.sock = null;
        this.qrCode = null;
        this.qrBase64 = null;
        this.qrTerminal = null;
        this.connected = false;
        this.phone = null;
        this.reconnectAttempts = 0;
        this.maxReconnect = parseInt(process.env.MAX_RECONNECT || '0');
        this.sessionPath = path.join(process.env.SESSION_PATH || './sessions', sessionId);
        this.reconnectTimer = null;
    }

    async connect() {
        try {
            // Reset QR state so browser shows "initializing" instead of stale QR
            this.qrCode = null;
            this.qrBase64 = null;
            this.qrTerminal = null;
            this.connected = false;

            const { version } = await fetchLatestBaileysVersion();
            logger.info({ sessionId: this.sessionId, version }, 'Connecting...');

            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

            // Timeout: jika dalam 60 detik tidak ada QR atau koneksi, hapus auth & coba ulang
            this._clearQrTimeout();
            this._qrTimeout = setTimeout(() => {
                if (!this.connected && !this.qrCode) {
                    logger.warn({ sessionId: this.sessionId }, 'No QR received within 60s — clearing auth and reconnecting');
                    this._clearQrTimeout();
                    this._forceReconnect().catch(err =>
                        logger.error({ sessionId: this.sessionId, err }, 'Force reconnect failed'));
                }
            }, 60_000);

            this.sock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' }),
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: process.env.MARK_ONLINE === 'true',
                keepAliveIntervalMs: 25_000,
            });

            this.sock.ev.on('connection.update', async (update) => {
                await this._handleConnectionUpdate(update, saveCreds);
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const msg of messages) {
                        await this._handleIncomingMessage(msg);
                    }
                }
            });

            this.sock.ev.on('messages.update', async (updates) => {
                for (const update of updates) {
                    await sendWebhook('message.status', { sessionId: this.sessionId, update });
                }
            });

        } catch (err) {
            logger.error({ sessionId: this.sessionId, err }, 'Failed to connect');
            await this._scheduleReconnect();
        }
    }

    async _handleConnectionUpdate(update, saveCreds) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            this.qrCode = qr;
            this.connected = false;
            this._clearQrTimeout();

            const { default: qrcodeTerminal } = await import('qrcode-terminal');
            console.log(`\n─── QR Session: ${this.sessionId} ───`);
            qrcodeTerminal.generate(qr, { small: true });

            const QRCode = (await import('qrcode')).default;
            try {
                this.qrBase64 = await QRCode.toDataURL(qr);
            } catch (_) {
                this.qrBase64 = null;
            }
            try {
                this.qrTerminal = await QRCode.toString(qr, { type: 'terminal', small: true });
            } catch (_) {
                this.qrTerminal = null;
            }

            logger.info({ sessionId: this.sessionId }, 'QR ready');
            await sendWebhook('session.qr', { sessionId: this.sessionId, qrBase64: this.qrBase64 });
        }

        if (connection === 'open') {
            this.connected = true;
            this.qrCode = null;
            this.qrBase64 = null;
            this.qrTerminal = null;
            this.reconnectAttempts = 0;
            this.phone = this.sock.user?.id?.split(':')[0] || null;
            this._clearQrTimeout();

            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            logger.info({ sessionId: this.sessionId, phone: this.phone }, 'Connected ✅');
            await sendWebhook('session.connected', {
                sessionId: this.sessionId,
                user: this.sock.user,
                phone: this.phone,
            });
        }

        if (connection === 'close') {
            try {
                await this._handleDisconnect(lastDisconnect);
            } catch (err) {
                logger.error({ sessionId: this.sessionId, err }, 'Error handling disconnect — force reconnect');
                await this._forceReconnect();
            }
        }
    }

    async _handleDisconnect(lastDisconnect) {
        this.connected = false;
        this._clearQrTimeout();

        // Ekstrak status code — dari Boom, error mentah, atau fallback
        const error = lastDisconnect?.error;
        const statusCode = error?.output?.statusCode
            || error?.statusCode
            || (error ? 500 : 0)
            || 0;

        // Alasan disconnect yang memerlukan hapus auth & QR baru:
        const needsNewAuth = [
            DisconnectReason.loggedOut,          // 401 — user logout dari HP
            DisconnectReason.badSession,         // 500 — session invalid
            DisconnectReason.forbidden,          // 403 — akun diblokir/detect spam
            DisconnectReason.connectionReplaced, // 440 — session dipakai di device lain
            DisconnectReason.multideviceMismatch,// 411 — multi-device mismatch
        ].includes(statusCode);

        logger.warn({
            sessionId: this.sessionId,
            statusCode,
            needsNewAuth,
            errorMessage: error?.message || '(no message)',
        }, 'Connection closed');

        await sendWebhook('session.disconnected', {
            sessionId: this.sessionId,
            statusCode,
            needsNewAuth,
        });

        // Force hapus auth → QR baru
        if (needsNewAuth) {
            logger.warn({ sessionId: this.sessionId, statusCode }, 'Auth invalid — regenerating QR...');
            await this._forceReconnect();
            return;
        }

        // WA server restart — reconnect langsung tanpa hapus auth
        if (statusCode === DisconnectReason.restartRequired) {
            this.reconnectAttempts = 0;
            await this.connect();
            return;
        }

        // Status code tidak dikenal / internet putus / timeout → reconnect dengan backoff
        await this._scheduleReconnect();
    }

    async _scheduleReconnect() {
        if (this.maxReconnect > 0 && this.reconnectAttempts >= this.maxReconnect) {
            logger.warn({ sessionId: this.sessionId }, 'Max reconnect reached — trying forced clean reconnect');
            await this._forceReconnect();
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
        logger.info({ sessionId: this.sessionId, attempt: this.reconnectAttempts, delayMs: delay }, 'Reconnecting...');

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.connect();
        }, delay);
    }

    _clearQrTimeout() {
        if (this._qrTimeout) {
            clearTimeout(this._qrTimeout);
            this._qrTimeout = null;
        }
    }

    async _forceReconnect() {
        // Tutup socket lama
        if (this.sock) {
            try { this.sock.end(); } catch (_) { /* ignore */ }
            this.sock = null;
        }

        // Hapus file auth agar Baileys dipaksa generate QR baru
        const fs = await import('fs/promises');
        try {
            await fs.rm(this.sessionPath, { recursive: true, force: true });
            logger.info({ sessionId: this.sessionId }, 'Auth files deleted — will generate new QR');
        } catch (err) {
            logger.error({ sessionId: this.sessionId, err }, 'Failed to delete auth files');
        }

        this.reconnectAttempts = 0;
        await this.connect();
    }

    async _handleIncomingMessage(msg) {
        try {
            if (msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const messageType = Object.keys(msg.message || {})[0];
            const body = this._extractMessageBody(msg);
            const isGroup = from?.endsWith('@g.us');

            logger.info({ sessionId: this.sessionId, from, messageType }, 'Incoming message');

            await sendWebhook('message.received', {
                sessionId: this.sessionId,
                messageId: msg.key.id,
                from,
                fromMe: false,
                isGroup,
                participant: msg.key.participant || null,
                pushName: msg.pushName || null,
                messageType,
                body,
                timestamp: msg.messageTimestamp,
                raw: msg,
            });
        } catch (err) {
            logger.error({ sessionId: this.sessionId, err }, 'Error handling message');
        }
    }

    _extractMessageBody(msg) {
        const m = msg.message;
        if (!m) return null;
        return (
            m.conversation ||
            m.extendedTextMessage?.text ||
            m.imageMessage?.caption ||
            m.videoMessage?.caption ||
            m.documentMessage?.caption ||
            null
        );
    }

    isConnected() { return this.connected; }
    getQR() { return this.qrBase64; }
    getQRTerminal() { return this.qrTerminal; }
    getPhone() { return this.phone; }
    getSessionId() { return this.sessionId; }

    _formatJID(phone) {
        const clean = phone.replace(/[^0-9]/g, '');
        if (clean.endsWith('@s.whatsapp.net') || clean.endsWith('@g.us')) return clean;
        return `${clean}@s.whatsapp.net`;
    }

    async sendText(phone, text) {
        this._assertConnected();
        const jid = this._formatJID(phone);
        const result = await this.sock.sendMessage(jid, { text });
        return result;
    }

    async sendImage(phone, imageBuffer, caption = '') {
        this._assertConnected();
        const jid = this._formatJID(phone);
        return await this.sock.sendMessage(jid, { image: imageBuffer, caption });
    }

    async sendDocument(phone, fileBuffer, filename, mimetype) {
        this._assertConnected();
        const jid = this._formatJID(phone);
        return await this.sock.sendMessage(jid, { document: fileBuffer, fileName: filename, mimetype });
    }

    async checkNumber(phone) {
        this._assertConnected();
        const jid = this._formatJID(phone);
        const [result] = await this.sock.onWhatsApp(jid);
        return { exists: result?.exists || false, jid: result?.jid || null };
    }

    async logout() {
        if (this.sock) {
            await this.sock.logout();
            this.connected = false;
        }
    }

    _assertConnected() {
        if (!this.connected) throw new Error(`Session '${this.sessionId}' belum terhubung`);
    }
}