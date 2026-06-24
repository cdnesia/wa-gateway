import { WhatsAppClient } from './whatsapp.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SessionManager');

class SessionManager {
    constructor() {
        this.sessions = new Map(); // sessionId -> WhatsAppClient
        this.rotateIndex = 0;
    }

    // ─── Tambah sesi baru ──────────────────────────────────────────────────────
    async addSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            logger.warn({ sessionId }, 'Session already exists');
            return this.sessions.get(sessionId);
        }

        logger.info({ sessionId }, 'Adding new session');
        const client = new WhatsAppClient(sessionId);
        this.sessions.set(sessionId, client);
        await client.connect();
        return client;
    }

    // ─── Hapus sesi ────────────────────────────────────────────────────────────
    async removeSession(sessionId) {
        const client = this.sessions.get(sessionId);
        if (!client) return false;

        await client.logout();
        this.sessions.delete(sessionId);
        logger.info({ sessionId }, 'Session removed');
        return true;
    }

    // ─── Ambil sesi tertentu ───────────────────────────────────────────────────
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    // ─── List semua sesi ───────────────────────────────────────────────────────
    listSessions() {
        const result = [];
        for (const [id, client] of this.sessions) {
            result.push({
                sessionId: id,
                connected: client.isConnected(),
                qrAvailable: !client.isConnected() && !!client.getQR(),
                phone: client.getPhone(),
            });
        }
        return result;
    }

    // ─── Round-Robin: ambil sesi connected berikutnya ─────────────────────────
    getNextSession() {
        const connected = [...this.sessions.entries()].filter(([, c]) => c.isConnected());

        if (connected.length === 0) {
            throw new Error('Tidak ada sesi yang terhubung');
        }

        // Rotasi index
        this.rotateIndex = this.rotateIndex % connected.length;
        const [sessionId, client] = connected[this.rotateIndex];
        this.rotateIndex++;

        logger.info({ sessionId, rotateIndex: this.rotateIndex }, 'Round-robin selected');
        return { sessionId, client };
    }

    // ─── Ambil sesi spesifik atau auto round-robin ─────────────────────────────
    resolveSession(sessionId = null) {
        if (sessionId) {
            const client = this.sessions.get(sessionId);
            if (!client) throw new Error(`Session '${sessionId}' tidak ditemukan`);
            if (!client.isConnected()) throw new Error(`Session '${sessionId}' belum terhubung`);
            return { sessionId, client };
        }
        return this.getNextSession();
    }

    totalConnected() {
        return [...this.sessions.values()].filter(c => c.isConnected()).length;
    }

    totalSessions() {
        return this.sessions.size;
    }
}

// Singleton
export const sessionManager = new SessionManager();