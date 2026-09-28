// dashboard.js — Logika Teacher Dashboard
// Dipisah dari dashboard.html karena CSP MV3 melarang inline script.

const WS_URL = 'ws://localhost:8080/ws';

let ws = null;
let roomCode = '';
let students = [];
let screenshots = {}; // studentName -> dataUrl

// Elemen
const connectPanel = document.getElementById('connectPanel');
const dashboardContent = document.getElementById('dashboardContent');
const roomInput = document.getElementById('roomInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connStatus = document.getElementById('connStatus');
const roomDisplay = document.getElementById('roomDisplay');
const errorBanner = document.getElementById('errorBanner');
const studentsGrid = document.getElementById('studentsGrid');
const screenshotAllBtn = document.getElementById('screenshotAllBtn');

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.style.display = 'block';
}

function hideError() {
  errorBanner.style.display = 'none';
}

function setConnectedUI(connected) {
  if (connected) {
    connStatus.textContent = 'Connected';
    connStatus.className = 'status-badge status-connected';
    disconnectBtn.disabled = false;
    connectPanel.style.display = 'none';
    dashboardContent.style.display = 'block';
    roomDisplay.textContent = roomCode;
  } else {
    connStatus.textContent = 'Disconnected';
    connStatus.className = 'status-badge status-disconnected';
    disconnectBtn.disabled = true;
    connectPanel.style.display = 'block';
    dashboardContent.style.display = 'none';
    roomDisplay.textContent = '-';
  }
}

function renderStudents() {
  studentsGrid.innerHTML = '';

  if (students.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Belum ada student online.';
    studentsGrid.appendChild(empty);
    return;
  }

  students.forEach((name) => {
    const card = document.createElement('div');
    card.className = 'student-card';
    card.id = 'card-' + name;

    // Header
    const header = document.createElement('div');
    header.className = 'student-card-header';
    const nameEl = document.createElement('span');
    nameEl.className = 'student-name';
    nameEl.textContent = name;
    const statusEl = document.createElement('span');
    statusEl.className = 'student-status student-online';
    statusEl.textContent = '🟢 Online';
    header.appendChild(nameEl);
    header.appendChild(statusEl);

    // Tombol screenshot
    const btnWrap = document.createElement('div');
    const shotBtn = document.createElement('button');
    shotBtn.className = 'btn btn-primary btn-sm';
    shotBtn.textContent = '📸 Screenshot';
    shotBtn.addEventListener('click', () => requestScreenshot(name));
    btnWrap.appendChild(shotBtn);

    // Screenshot box
    const shotBox = document.createElement('div');
    shotBox.className = 'screenshot-box';
    shotBox.id = 'shot-' + name;

    if (screenshots[name]) {
      const img = document.createElement('img');
      img.src = screenshots[name];
      img.alt = 'Screenshot ' + name;
      shotBox.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'screenshot-placeholder';
      placeholder.textContent = 'Belum ada screenshot';
      shotBox.appendChild(placeholder);
    }

    card.appendChild(header);
    card.appendChild(btnWrap);
    card.appendChild(shotBox);
    studentsGrid.appendChild(card);
  });
}

function setScreenshotLoading(name) {
  const box = document.getElementById('shot-' + name);
  if (!box) return;
  box.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'screenshot-loading';
  loading.textContent = 'Mengambil screenshot...';
  box.appendChild(loading);
}

function setScreenshotResult(name, dataUrl) {
  screenshots[name] = dataUrl;
  const box = document.getElementById('shot-' + name);
  if (!box) return;
  box.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'Screenshot ' + name;
  box.appendChild(img);
}

function requestScreenshot(target) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  setScreenshotLoading(target);
  ws.send(JSON.stringify({
    type: 'screenshot_request',
    target: target
  }));
}

function requestScreenshotAll() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  students.forEach((name) => setScreenshotLoading(name));
  ws.send(JSON.stringify({
    type: 'screenshot_request',
    target: 'all'
  }));
}

function connect() {
  const room = roomInput.value.trim();
  if (!room) {
    showError('Mohon isi Room Code.');
    return;
  }
  hideError();
  roomCode = room;

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    showError('Gagal membuat WebSocket: ' + e.message);
    return;
  }

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'register',
      mode: 'teacher',
      room_code: roomCode
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'registered') {
        setConnectedUI(true);
      } else if (msg.type === 'student_list') {
        students = msg.students || [];
        renderStudents();
      } else if (msg.type === 'screenshot_result') {
        setScreenshotResult(msg.student_name, msg.image_data);
      }
    } catch (e) {
      // abaikan pesan tidak valid
    }
  };

  ws.onclose = () => {
    ws = null;
    setConnectedUI(false);
  };

  ws.onerror = () => {
    showError('Gagal terhubung ke server. Pastikan backend berjalan di ws://localhost:8080/ws');
  };
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  students = [];
  screenshots = {};
  setConnectedUI(false);
}

connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
screenshotAllBtn.addEventListener('click', requestScreenshotAll);

// Ambil room code dari URL query param jika ada (?room=ABC123)
const params = new URLSearchParams(window.location.search);
const roomParam = params.get('room');
if (roomParam) {
  roomInput.value = roomParam;
  connect();
}