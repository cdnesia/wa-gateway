import { Router } from 'express';
import { sessionManager } from '../handlers/session-manager.js';

const router = Router();

// Halaman semua sesi
router.get('/', (req, res) => {
    const sessions = sessionManager.listSessions();

    const cards = sessions.length === 0
        ? `<div class="empty">Belum ada sesi. Tambah via <code>POST /api/session/add</code></div>`
        : sessions.map(s => `
        <div class="card ${s.connected ? 'connected' : 'disconnected'}">
          <div class="card-header">
            <span class="session-id">${s.sessionId}</span>
            <span class="badge ${s.connected ? 'badge-connected' : 'badge-waiting'}">
              <span class="dot ${s.connected ? '' : 'pulse'}"></span>
              ${s.connected ? `✅ ${s.phone || 'Connected'}` : s.qrAvailable ? 'Scan QR' : 'Memuat...'}
            </span>
          </div>
          ${!s.connected ? `<a href="/scan/${s.sessionId}" class="btn-scan">📱 Scan QR</a>` : ''}
        </div>
      `).join('');

    res.send(buildPage('WA Gateway — Semua Sesi', `
    <h1>Sesi Aktif</h1>
    <p class="subtitle">${sessionManager.totalConnected()} / ${sessionManager.totalSessions()} terhubung</p>
    <div class="grid">${cards}</div>
    <div class="auto-refresh">Auto refresh dalam <span id="cd">10</span>s</div>
  `, 10));
});

// Halaman QR per sesi
router.get('/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const client = sessionManager.getSession(sessionId);

    if (!client) {
        return res.status(404).send(buildPage('Session Not Found', `
      <div class="card">
        <h1>Session tidak ditemukan</h1>
        <p class="hint">Session <strong>${sessionId}</strong> belum ditambahkan.</p>
        <a href="/scan" class="btn-refresh">← Kembali</a>
      </div>
    `));
    }

    const connected = client.isConnected();
    const qr = client.getQR();

    const content = connected ? `
    <div class="badge badge-connected"><span class="dot"></span> Terhubung</div>
    <div class="connected-icon">✅</div>
    <p class="hint">Nomor <strong>${client.getPhone() || '-'}</strong> sudah terhubung.</p>
    <a href="/scan" class="btn-refresh">← Semua Sesi</a>
  ` : qr ? `
    <div class="badge badge-waiting"><span class="dot pulse"></span> Menunggu Scan</div>
    <div class="qr-box"><img src="${qr}" alt="QR"></div>
    <p class="hint">
      Buka WhatsApp → <strong>Perangkat Tertaut → Tautkan Perangkat</strong><br>
      lalu scan QR di atas.
    </p>
    <a href="/scan/${sessionId}" class="btn-refresh">🔄 Refresh</a>
    <div class="auto-refresh">Auto refresh dalam <span id="cd">30</span>s</div>
  ` : `
    <div class="badge badge-loading"><span class="dot pulse"></span> Memuat...</div>
    <div class="waiting-box"><div class="spinner"></div><span>Menginisialisasi sesi...</span></div>
    <div class="auto-refresh">Auto refresh dalam <span id="cd">5</span>s</div>
  `;

    res.send(buildPage(`QR — ${sessionId}`, `
    <div class="card" style="text-align:center">
      <div class="logo">WA Gateway</div>
      <h1 style="margin-bottom:8px">${sessionId}</h1>
      ${content}
    </div>
  `, connected ? 0 : qr ? 30 : 5));
});

function buildPage(title, body, autoRefresh = 0) {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .logo{font-size:12px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:#64748b;margin-bottom:8px}
    h1{font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:24px}
    .subtitle{color:#475569;font-size:14px;margin-top:-16px;margin-bottom:24px}
    .grid{display:grid;gap:12px;width:100%;max-width:560px}
    .card{background:#1a1d27;border:1px solid #2d3148;border-radius:12px;padding:24px;width:100%;max-width:420px}
    .card.connected{border-color:#166534}
    .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .session-id{font-weight:700;font-size:16px;color:#f1f5f9}
    .badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600}
    .badge-connected{background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.25)}
    .badge-waiting{background:rgba(234,179,8,.12);color:#facc15;border:1px solid rgba(234,179,8,.25)}
    .badge-loading{background:rgba(99,102,241,.12);color:#818cf8;border:1px solid rgba(99,102,241,.25)}
    .dot{width:7px;height:7px;border-radius:50%;background:currentColor}
    .dot.pulse{animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .qr-box{background:#fff;border-radius:12px;padding:14px;display:inline-block;margin:16px auto}
    .qr-box img{display:block;width:240px;height:240px}
    .waiting-box{background:#13151f;border:1px dashed #2d3148;border-radius:12px;width:272px;height:100px;margin:16px auto;display:flex;align-items:center;justify-content:center;gap:12px;color:#475569}
    .spinner{width:28px;height:28px;border:3px solid #2d3148;border-top-color:#818cf8;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .hint{font-size:13px;color:#475569;line-height:1.7;margin:12px 0}
    .connected-icon{font-size:56px;margin:12px 0}
    .btn-scan,.btn-refresh{display:inline-flex;align-items:center;gap:6px;background:#2d3148;color:#e2e8f0;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;transition:background .2s;margin-top:8px}
    .btn-scan:hover,.btn-refresh:hover{background:#363b5e}
    .auto-refresh{font-size:12px;color:#334155;margin-top:16px;text-align:center}
    .auto-refresh span{color:#475569;font-weight:600}
    .empty{color:#475569;font-size:14px;padding:24px;text-align:center}
    code{background:#1e2235;padding:2px 6px;border-radius:4px;font-size:12px}
  </style>
</head>
<body>
  <div style="width:100%;display:flex;flex-direction:column;align-items:center">
    ${body}
  </div>
  <script>
    const cd = document.getElementById('cd');
    if (cd && ${autoRefresh} > 0) {
      let s = ${autoRefresh};
      setInterval(() => { s--; cd.textContent = s; if (s <= 0) location.reload(); }, 1000);
    }
  </script>
</body>
</html>`;
}

export default router;