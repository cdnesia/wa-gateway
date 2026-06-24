import crypto from 'crypto';
import { createLogger } from './logger.js';

const logger = createLogger('Webhook');

export async function sendWebhook(event, data) {
    const { webhookCache } = await import('../routes/webhook.js');
    const config = webhookCache.get('config');

    if (!config?.url) return;

    if (config.events && !config.events.includes('*') && !config.events.includes(event)) {
        return;
    }

    const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
    };

    const headers = { 'Content-Type': 'application/json' };

    if (config.secret) {
        const signature = crypto
            .createHmac('sha256', config.secret)
            .update(JSON.stringify(payload))
            .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(config.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            logger.warn({ event, status: response.status }, 'Webhook endpoint returned non-2xx');
        } else {
            logger.debug({ event, url: config.url }, 'Webhook sent');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            logger.error({ event }, 'Webhook request timeout');
        } else {
            logger.error({ event, err: err.message }, 'Webhook delivery failed');
        }
    }
}