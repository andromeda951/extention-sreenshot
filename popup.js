function startApp() {
  // Elemen Form Koneksi
  const studentNameInput = document.getElementById('studentName');
  const roomCodeInput = document.getElementById('roomCode');
  const connectionStatus = document.getElementById('connectionStatus');
  const connectBtn = document.getElementById('connectBtn');

  // Elemen Monitor & Screenshot
  const tabStatus = document.getElementById('tabStatus');
  const monitorStatus = document.getElementById('monitorStatus');
  const errorMessage = document.getElementById('errorMessage');
  const captureBtn = document.getElementById('captureBtn');
  const screenshotSection = document.getElementById('screenshotSection');
  const screenshotPreview = document.getElementById('screenshotPreview');
  const downloadBtn = document.getElementById('downloadBtn');

  let currentScreenshotUrl = null;
  let isConnected = false;

  // --- LOGIKA KONEKSI & STORAGE ---

  // Update tampilan status koneksi
  function updateConnectionUI(connected) {
    isConnected = connected;
    if (connected) {
      connectionStatus.textContent = 'Connected';
      connectionStatus.className = 'status-badge status-connected';
      connectBtn.textContent = 'Disconnect';
      connectBtn.className = 'btn btn-disconnect';
    } else {
      connectionStatus.textContent = 'Disconnected';
      connectionStatus.className = 'status-badge status-disconnected';
      connectBtn.textContent = 'Connect';
      connectBtn.className = 'btn btn-connect';
    }
  }

  // Muat data tersimpan dari chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['studentName', 'roomCode', 'isConnected'], (result) => {
        if (chrome.runtime.lastError || !result) {
          console.warn('Storage get error:', chrome.runtime.lastError);
          return;
        }
        if (result.studentName) {
          studentNameInput.value = result.studentName;
        }
        if (result.roomCode) {
          roomCodeInput.value = result.roomCode;
        }
        updateConnectionUI(Boolean(result.isConnected));
      });
    } catch (e) {
      console.warn('Storage exception:', e);
    }

    // Simpan otomatis saat input berubah
    studentNameInput.addEventListener('input', () => {
      chrome.storage.local.set({ studentName: studentNameInput.value });
    });

    roomCodeInput.addEventListener('input', () => {
      chrome.storage.local.set({ roomCode: roomCodeInput.value });
    });
  }

  // Tombol Connect / Disconnect (tidak terhubung ke backend/internet)
  connectBtn.addEventListener('click', () => {
    if (isConnected) {
      // Ubah status ke Disconnected
      updateConnectionUI(false);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ isConnected: false });
      }
    } else {
      const name = studentNameInput.value.trim();
      const room = roomCodeInput.value.trim();

      if (!name || !room) {
        showError('Mohon isi Student Name dan Room Code.');
        return;
      }

      hideError();

      // Simpan dan ubah status ke Connected
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          studentName: studentNameInput.value,
          roomCode: roomCodeInput.value,
          isConnected: true
        });
      }
      updateConnectionUI(true);
    }
  });

  // --- LOGIKA SCREENSHOT V0 ---

  // Cek apakah URL merupakan website Scratch
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

  // Tampilkan pesan error
  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.classList.remove('hidden');
    }
  }

  // Sembunyikan pesan error
  function hideError() {
    if (errorMessage) {
      errorMessage.textContent = '';
      errorMessage.classList.add('hidden');
    }
  }

  // Wrapper promise untuk chrome.tabs.query yang aman dari hanging
  function queryTabs(queryInfo) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(queryInfo, (tabs) => {
          if (chrome.runtime.lastError) {
            console.warn('queryTabs lastError:', chrome.runtime.lastError);
            resolve([]);
          } else {
            resolve(tabs || []);
          }
        });
      } catch (err) {
        console.warn('queryTabs exception:', err);
        resolve([]);
      }
    });
  }

  // Ambil active tab dengan fallback multi-strategi
  async function getActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      console.warn('Chrome Tabs API tidak tersedia di konteks ini.');
      return null;
    }

    try {
      // 1. Coba window aktif saat ini
      let tabs = await queryTabs({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0 && (tabs[0].url || tabs[0].pendingUrl)) {
        return tabs[0];
      }

      // 2. Coba window yang terakhir difokuskan
      tabs = await queryTabs({ active: true, lastFocusedWindow: true });
      if (tabs && tabs.length > 0 && (tabs[0].url || tabs[0].pendingUrl)) {
        return tabs[0];
      }

      // 3. Fallback: semua tab aktif di browser
      tabs = await queryTabs({ active: true });
      if (tabs && tabs.length > 0) {
        return tabs[0];
      }

      return null;
    } catch (err) {
      console.error('Error saat mengambil active tab:', err);
      return null;
    }
  }

  // Periksa active tab dan perbarui status di UI
  async function initializeStatus() {
    try {
      const tab = await getActiveTab();
      const url = tab ? (tab.url || tab.pendingUrl) : null;

      if (url && isScratchUrl(url)) {
        tabStatus.textContent = 'Scratch';
        tabStatus.className = 'status-badge status-success';

        monitorStatus.textContent = 'Ready';
        monitorStatus.className = 'status-badge status-ready';

        captureBtn.disabled = false;
        hideError();
      } else {
        tabStatus.textContent = 'Bukan Scratch';
        tabStatus.className = 'status-badge status-danger';

        monitorStatus.textContent = 'Silakan buka Scratch terlebih dahulu.';
        monitorStatus.className = 'status-badge status-danger';

        captureBtn.disabled = true;
        showError('Silakan buka Scratch terlebih dahulu.');
      }
    } catch (err) {
      console.error('Error initializeStatus:', err);
      tabStatus.textContent = 'Bukan Scratch';
      tabStatus.className = 'status-badge status-danger';
      monitorStatus.textContent = 'Silakan buka Scratch terlebih dahulu.';
      monitorStatus.className = 'status-badge status-danger';
    }
  }

  // Event handler tombol Ambil Screenshot
  captureBtn.addEventListener('click', async () => {
    // Validasi ulang apakah tab aktif adalah Scratch
    const tab = await getActiveTab();
    const url = tab ? (tab.url || tab.pendingUrl) : null;

    if (!url || !isScratchUrl(url)) {
      tabStatus.textContent = 'Bukan Scratch';
      tabStatus.className = 'status-badge status-danger';
      monitorStatus.textContent = 'Silakan buka Scratch terlebih dahulu.';
      monitorStatus.className = 'status-badge status-danger';
      captureBtn.disabled = true;
      showError('Silakan buka Scratch terlebih dahulu.');
      return;
    }

    // Set UI state sedang mengambil screenshot
    captureBtn.disabled = true;
    captureBtn.textContent = 'Mengambil...';
    monitorStatus.textContent = 'Mengambil screenshot...';
    monitorStatus.className = 'status-badge status-loading';
    hideError();

    const targetWindowId = tab.windowId || null;

    try {
      chrome.tabs.captureVisibleTab(targetWindowId, { format: 'png' }, (dataUrl) => {
        captureBtn.disabled = false;
        captureBtn.textContent = 'Ambil Screenshot';

        if (chrome.runtime.lastError || !dataUrl) {
          console.error('Error captureVisibleTab:', chrome.runtime.lastError);
          monitorStatus.textContent = 'Gagal';
          monitorStatus.className = 'status-badge status-danger';
          showError('Gagal mengambil screenshot.');
          return;
        }

        // Tampilkan hasil screenshot
        currentScreenshotUrl = dataUrl;
        screenshotPreview.src = dataUrl;
        screenshotSection.classList.remove('hidden');

        monitorStatus.textContent = 'Ready';
        monitorStatus.className = 'status-badge status-ready';
      });
    } catch (err) {
      console.error('Exception saat screenshot:', err);
      captureBtn.disabled = false;
      captureBtn.textContent = 'Ambil Screenshot';
      monitorStatus.textContent = 'Gagal';
      monitorStatus.className = 'status-badge status-danger';
      showError('Gagal mengambil screenshot.');
    }
  });

  // Event handler tombol Download
  downloadBtn.addEventListener('click', () => {
    if (!currentScreenshotUrl) return;

    try {
      // Konversi data URI ke Blob untuk unduhan yang aman dan kompatibel
      const parts = currentScreenshotUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)[1];
      const byteCharacters = atob(parts[1]);
      const byteArrays = new Uint8Array(byteCharacters.length);

      for (let i = 0; i < byteCharacters.length; i++) {
        byteArrays[i] = byteCharacters.charCodeAt(i);
      }

      const blob = new Blob([byteArrays], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      // Generate nama file dengan timestamp
      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '-');
      const filename = 'scratch-screenshot-' + datePart + '_' + timePart + '.png';

      // Trigger download via anchor element
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Bersihkan object URL setelah beberapa saat
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 5000);
    } catch (err) {
      console.error('Error saat mendownload screenshot:', err);
      showError('Gagal mendownload screenshot.');
    }
  });

  // Jalankan pemeriksaan status saat popup dibuka
  initializeStatus();
}

// Eksekusi startApp dengan aman terhadap lifecycle readyState
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
