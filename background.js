// background.js — Service Worker yang menjaga koneksi WebSocket tetap hidup
// Koneksi WebSocket dikelola di sini, bukan di popup, agar tidak terputus
// ketika popup ditutup (popup Chrome MV3 adalah dokumen sementara).

// Muat konfigurasi global (APP_WS_URL). Ubah config.js saat deploy ke VPS.
importScripts('config.js');

const WS_URL = APP_WS_URL;

let socket = null;
let isConnected = false;
let lastStudents = [];

// ---- Keepalive: cegah service worker mati karena idle (MV3 mati ~30 detik) ----
// chrome.alarms bangunkan service worker setiap 25 detik.
chrome.alarms.create('ws-keepalive', { periodInMinutes: 0.4 }); // ~24 detik

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ws-keepalive') {
    // Jika socket terbuka, kirim ping text agar koneksi tidak idle.
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
    } else {
      // Service worker baru bangun setelah mati idle.
      // Jika sebelumnya terhubung, reconnect otomatis.
      chrome.storage.local.get(['isConnected', 'mode', 'studentName', 'roomCode'], (result) => {
        if (result.isConnected && result.roomCode) {
          console.log('[background] Reconnect otomatis...');
          connectWebSocket(result.mode || 'student', result.studentName || '', result.roomCode);
        }
      });
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

// ---- Broadcast daftar student ke popup (untuk mode teacher) ----
function broadcastStudentList(students) {
  lastStudents = students || [];
  // Simpan di storage agar bisa diambil lagi saat popup dibuka kembali.
  chrome.storage.local.set({ students: lastStudents });
  chrome.runtime.sendMessage({
    type: 'STUDENT_LIST',
    students: lastStudents
  }).catch(() => {
    // Popup tidak sedang terbuka, abaikan error ini.
  });
}

// ---- Cek apakah URL merupakan website Scratch ----
function isScratchUrl(urlString) {
  if (!urlString) return false;
  try {
    const url = new URL(urlString);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'scratch.mit.edu' || url.hostname.endsWith('.scratch.mit.edu'))
    );
  } catch {
    return false;
  }
}

// ---- Ambil screenshot tab Scratch aktif ----
function captureScratchScreenshot() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // Cari tab Scratch
      const scratchTab = (tabs || []).find((tab) => {
        const url = tab.url || tab.pendingUrl || '';
        return isScratchUrl(url);
      });

      if (!scratchTab) {
        reject(new Error('Tidak ada tab Scratch yang terbuka'));
        return;
      }

      console.log('[background] Tab Scratch ditemukan:', scratchTab.id, scratchTab.url);

      // Aktifkan tab Scratch agar bisa di-capture
      chrome.tabs.update(scratchTab.id, { active: true }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error('Gagal aktifkan tab: ' + chrome.runtime.lastError.message));
          return;
        }

        // Fokuskan window agar captureVisibleTab berhasil
        chrome.windows.update(scratchTab.windowId, { focused: true }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error('Gagal fokuskan window: ' + chrome.runtime.lastError.message));
            return;
          }

          // Capture tab yang sekarang aktif di window tersebut
          chrome.tabs.captureVisibleTab(scratchTab.windowId, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
              reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Gagal capture'));
              return;
            }
            console.log('[background] Screenshot berhasil, ukuran:', dataUrl.length, 'chars');
            resolve(dataUrl);
          });
        });
      });
    });
  });
}

// ---- Kirim screenshot ke server ----
function sendScreenshotToServer(dataUrl) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('[background] Socket tidak terbuka, screenshot tidak dikirim');
    return;
  }
  socket.send(JSON.stringify({
    type: 'screenshot_result',
    image_data: dataUrl
  }));
}

// ---- Buka koneksi WebSocket ----
function connectWebSocket(mode, studentName, roomCode) {
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
    chrome.storage.local.set({ isConnected: true, mode, studentName, roomCode });

    // Kirim pesan register ke server
    const registerMsg = {
      type: 'register',
      mode: mode,
      room_code: roomCode
    };
    if (mode === 'student') {
      registerMsg.student_name = studentName;
    }
    socket.send(JSON.stringify(registerMsg));

    broadcastStatus(true);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'student_list') {
        broadcastStudentList(msg.students);
      } else if (msg.type === 'screenshot_request') {
        // Student menerima perintah screenshot dari teacher.
        // Ambil screenshot tab Scratch aktif dan kirim kembali ke server.
        console.log('[background] Menerima perintah screenshot');
        captureScratchScreenshot()
          .then((dataUrl) => {
            console.log('[background] Screenshot berhasil diambil');
            sendScreenshotToServer(dataUrl);
          })
          .catch((err) => {
            console.error('[background] Gagal mengambil screenshot:', err.message);
          });
      }
    } catch (e) {
      console.warn('[background] Pesan tidak valid:', e);
    }
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
  lastStudents = [];
  chrome.storage.local.set({ isConnected: false, students: [] });
  broadcastStatus(false);
}

// ---- Terima pesan dari popup ----
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CONNECT') {
    connectWebSocket(message.mode, message.studentName, message.roomCode);
    sendResponse({ ok: true });
  } else if (message.type === 'DISCONNECT') {
    disconnectWebSocket();
    sendResponse({ ok: true });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({
      connected: !!(socket && socket.readyState === WebSocket.OPEN)
    });
  } else if (message.type === 'GET_STUDENTS') {
    if (lastStudents.length > 0) {
      sendResponse({ students: lastStudents });
    } else {
      // Service worker baru bangun, memory kosong — baca dari storage.
      chrome.storage.local.get(['students'], (result) => {
        sendResponse({ students: result.students || [] });
      });
    }
  }
  return true;
});