document.addEventListener('DOMContentLoaded', () => {
  const tabStatus = document.getElementById('tabStatus');
  const monitorStatus = document.getElementById('monitorStatus');
  const errorMessage = document.getElementById('errorMessage');
  const captureBtn = document.getElementById('captureBtn');
  const screenshotSection = document.getElementById('screenshotSection');
  const screenshotPreview = document.getElementById('screenshotPreview');
  const downloadBtn = document.getElementById('downloadBtn');

  let currentScreenshotUrl = null;

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

  // Ambil tab aktif dengan fallback multi-window (kompatibel Linux & multi-display)
  async function getActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      console.warn('Chrome Tabs API tidak tersedia di konteks ini.');
      return null;
    }

    try {
      // Coba cari tab aktif di window saat ini
      const tabsCurrent = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabsCurrent && tabsCurrent.length > 0 && (tabsCurrent[0].url || tabsCurrent[0].pendingUrl)) {
        return tabsCurrent[0];
      }

      // Fallback ke window yang terakhir difokuskan
      const tabsLastFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabsLastFocused && tabsLastFocused.length > 0) {
        return tabsLastFocused[0];
      }

      return tabsCurrent && tabsCurrent.length > 0 ? tabsCurrent[0] : null;
    } catch (err) {
      console.error('Error saat mengambil active tab:', err);
      return null;
    }
  }

  // Periksa active tab dan perbarui status di UI
  async function initializeStatus() {
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
  }

  // Event handler tombol "Ambil Screenshot"
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

  // Event handler tombol "Download"
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
      const filename = `scratch-screenshot-${datePart}_${timePart}.png`;

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
});
