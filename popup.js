function startApp() {
  // Elemen Form Koneksi
  const modeSelect = document.getElementById('modeSelect');
  const studentNameInput = document.getElementById('studentName');
  const studentNameGroup = document.getElementById('studentNameGroup');
  const roomCodeInput = document.getElementById('roomCode');
  const connectionStatus = document.getElementById('connectionStatus');
  const connectBtn = document.getElementById('connectBtn');

  // Elemen Daftar Student (mode Teacher)
  const studentListSection = document.getElementById('studentListSection');
  const studentList = document.getElementById('studentList');

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
  let currentMode = 'student';

  // --- LOGIKA KONEKSI (lewat background service worker) ---

  // Update tampilan status koneksi
  function updateConnectionUI(connected, errorMsg) {
    isConnected = connected;
    if (connected) {
      connectionStatus.textContent = 'Connected';
      connectionStatus.className = 'status-badge status-connected';
      connectBtn.textContent = 'Disconnect';
      connectBtn.className = 'btn btn-disconnect';
      hideError();
    } else {
      connectionStatus.textContent = 'Disconnected';
      connectionStatus.className = 'status-badge status-disconnected';
      connectBtn.textContent = 'Connect';
      connectBtn.className = 'btn btn-connect';
      if (errorMsg) showError(errorMsg);
    }
  }

  // Update daftar student (mode Teacher)
  function updateStudentList(students) {
    studentList.innerHTML = '';
    if (!students || students.length === 0) {
      const li = document.createElement('li');
      li.className = 'student-list-empty';
      li.textContent = 'Belum ada student online.';
      studentList.appendChild(li);
      return;
    }
    students.forEach((name) => {
      const li = document.createElement('li');
      li.className = 'student-list-item';
      li.textContent = '🟢 ' + name;
      studentList.appendChild(li);
    });
  }

  // Update tampilan berdasarkan mode
  function updateModeUI() {
    currentMode = modeSelect.value;
    if (currentMode === 'teacher') {
      studentNameGroup.classList.add('hidden');
      studentListSection.classList.remove('hidden');
    } else {
      studentNameGroup.classList.remove('hidden');
      studentListSection.classList.add('hidden');
    }
  }

  // Muat data dari storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['mode', 'studentName', 'roomCode'], (result) => {
        if (chrome.runtime.lastError || !result) return;
        if (result.mode) {
          modeSelect.value = result.mode;
          updateModeUI();
        }
        if (result.studentName) studentNameInput.value = result.studentName;
        if (result.roomCode) roomCodeInput.value = result.roomCode;
      });
    } catch (e) {
      console.warn('Storage exception:', e);
    }

    modeSelect.addEventListener('change', () => {
      chrome.storage.local.set({ mode: modeSelect.value });
      updateModeUI();
    });
    studentNameInput.addEventListener('input', () => {
      chrome.storage.local.set({ studentName: studentNameInput.value });
    });
    roomCodeInput.addEventListener('input', () => {
      chrome.storage.local.set({ roomCode: roomCodeInput.value });
    });
  }

  // Sinkronisasi status koneksi dari background worker saat popup dibuka
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.connected) {
        updateConnectionUI(true);
      }
    });

    // Minta daftar student terakhir dari background saat popup dibuka
    chrome.runtime.sendMessage({ type: 'GET_STUDENTS' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      if (response.students && response.students.length > 0) {
        updateStudentList(response.students);
      }
    });

    // Dengarkan update status dari background worker
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'WS_STATUS') {
        updateConnectionUI(message.connected, message.error);
      } else if (message.type === 'STUDENT_LIST') {
        updateStudentList(message.students);
      }
    });
  }

  // Tombol Connect / Disconnect
  connectBtn.addEventListener('click', () => {
    if (isConnected) {
      chrome.runtime.sendMessage({ type: 'DISCONNECT' });
    } else {
      const mode = modeSelect.value;
      const room = roomCodeInput.value.trim();

      if (!room) {
        showError('Mohon isi Room Code.');
        return;
      }

      if (mode === 'student') {
        const name = studentNameInput.value.trim();
        if (!name) {
          showError('Mohon isi Student Name dan Room Code.');
          return;
        }
        hideError();
        chrome.runtime.sendMessage({
          type: 'CONNECT',
          mode: mode,
          studentName: name,
          roomCode: room
        });
      } else {
        hideError();
        chrome.runtime.sendMessage({
          type: 'CONNECT',
          mode: mode,
          studentName: '',
          roomCode: room
        });
      }
    }
  });

  // --- LOGIKA SCREENSHOT ---

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

  // Wrapper promise untuk chrome.tabs.query
  function queryTabs(queryInfo) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(queryInfo, (tabs) => {
          if (chrome.runtime.lastError) {
            resolve([]);
          } else {
            resolve(tabs || []);
          }
        });
      } catch (err) {
        resolve([]);
      }
    });
  }

  // Ambil active tab
  async function getActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return null;

    try {
      let tabs = await queryTabs({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0 && (tabs[0].url || tabs[0].pendingUrl)) return tabs[0];

      tabs = await queryTabs({ active: true, lastFocusedWindow: true });
      if (tabs && tabs.length > 0 && (tabs[0].url || tabs[0].pendingUrl)) return tabs[0];

      tabs = await queryTabs({ active: true });
      if (tabs && tabs.length > 0) return tabs[0];

      return null;
    } catch (err) {
      return null;
    }
  }

  // Periksa active tab dan update status
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
      tabStatus.textContent = 'Bukan Scratch';
      tabStatus.className = 'status-badge status-danger';
      monitorStatus.textContent = 'Silakan buka Scratch terlebih dahulu.';
      monitorStatus.className = 'status-badge status-danger';
    }
  }

  // Tombol Ambil Screenshot
  captureBtn.addEventListener('click', async () => {
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
          monitorStatus.textContent = 'Gagal';
          monitorStatus.className = 'status-badge status-danger';
          showError('Gagal mengambil screenshot.');
          return;
        }

        currentScreenshotUrl = dataUrl;
        screenshotPreview.src = dataUrl;
        screenshotSection.classList.remove('hidden');
        monitorStatus.textContent = 'Ready';
        monitorStatus.className = 'status-badge status-ready';
      });
    } catch (err) {
      captureBtn.disabled = false;
      captureBtn.textContent = 'Ambil Screenshot';
      monitorStatus.textContent = 'Gagal';
      monitorStatus.className = 'status-badge status-danger';
      showError('Gagal mengambil screenshot.');
    }
  });

  // Tombol Download
  downloadBtn.addEventListener('click', () => {
    if (!currentScreenshotUrl) return;

    try {
      const parts = currentScreenshotUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)[1];
      const byteCharacters = atob(parts[1]);
      const byteArrays = new Uint8Array(byteCharacters.length);

      for (let i = 0; i < byteCharacters.length; i++) {
        byteArrays[i] = byteCharacters.charCodeAt(i);
      }

      const blob = new Blob([byteArrays], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '-');
      const filename = 'scratch-screenshot-' + datePart + '_' + timePart + '.png';

      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err) {
      showError('Gagal mendownload screenshot.');
    }
  });

  // Inisialisasi mode UI
  updateModeUI();

  // Jalankan saat popup dibuka
  initializeStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}