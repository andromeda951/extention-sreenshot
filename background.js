// background.js — Service Worker yang menjaga koneksi WebSocket tetap hidup
// Koneksi WebSocket dikelola di sini, bukan di popup, agar tidak terputus
// ketika popup ditutup (popup Chrome MV3 adalah dokumen sementara).

const WS_URL = 'ws://localhost:8080/ws';

let socket = null;
let isConnected = false;

// ---- Keepalive: cegah service worker mati karena idle (MV3 mati ~30 detik) ----
// chrome.alarms bangunkan service worker setiap 25 detik.
chrome.alarms.create('ws-keepalive', { periodInMinutes: 0.4 }); // ~24 detik

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ws-keepalive') {
    // Cukup memiliki listener ini sudah cukup untuk menjaga SW tetap aktif.
    // Jika socket terbuka, kirim ping text agar koneksi tidak idle.
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }
});

// ---- Broadcast status ke popup ----
function broadcastStatus(connected, errorMsg) {
  chrome.runtime.sendMessage({
    type: 'WS_STATUS',
    connected: connected,
    error: errorMsg || null
  }).catch(() => {
    // Popup tidak sedang terbuka, abaikan error ini.
  });
}

// ---- Buka koneksi WebSocket ----
function connectWebSocket(studentName, roomCode) {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    // Sudah terhubung, langsung beritahu popup
    broadcastStatus(true);
    return;
  }

  console.log('[background] Menghubungkan ke', WS_URL);

  try {
    socket = new WebSocket(WS_URL);
  } catch (e) {
    console.error('[background] Gagal membuat WebSocket:', e);
    broadcastStatus(false, 'Gagal membuat koneksi WebSocket: ' + e.message);
    return;
  }

  socket.onopen = () => {
    console.log('[background] WebSocket terhubung');
    isConnected = true;
    chrome.storage.local.set({ isConnected: true, studentName, roomCode });
    broadcastStatus(true);
  };

  socket.onclose = (event) => {
    console.log('[background] WebSocket terputus, code:', event.code);
    isConnected = false;
    socket = null;
    chrome.storage.local.set({ isConnected: false });
    broadcastStatus(false);
  };

  socket.onerror = (err) => {
    console.error('[background] WebSocket error:', err);
    isConnected = false;
    chrome.storage.local.set({ isConnected: false });
    broadcastStatus(false, 'Gagal terhubung ke server (ws://localhost:8080/ws). Pastikan backend Go aktif.');
  };
}

// ---- Putus koneksi WebSocket ----
function disconnectWebSocket() {
  if (socket) {
    socket.close(1000, 'User disconnect');
    socket = null;
  }
  isConnected = false;
  chrome.storage.local.set({ isConnected: false });
  broadcastStatus(false);
}

// ---- Terima pesan dari popup ----
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CONNECT') {
    connectWebSocket(message.studentName, message.roomCode);
    sendResponse({ ok: true });
  } else if (message.type === 'DISCONNECT') {
    disconnectWebSocket();
    sendResponse({ ok: true });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({
      connected: !!(socket && socket.readyState === WebSocket.OPEN)
    });
  }
  return true;
});
