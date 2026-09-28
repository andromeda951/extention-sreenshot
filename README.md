# Coding Kids Monitor

Chrome Extension sederhana berbasis Manifest V3 untuk membantu tutor Coding Kids mengambil screenshot tab coding siswa di Scratch (https://scratch.mit.edu/).

## Fitur

* **Mode Teacher / Student**: Pilihan mode di popup extension.
* **Student Name & Room Code**: Input nama siswa dan kode room untuk identifikasi sesi.
* **Connect / Disconnect**: Tombol toggle koneksi dengan status `Disconnected` / `Connected`.
* **Storage Otomatis**: Menyimpan Mode, Student Name dan Room Code secara lokal di `chrome.storage.local` agar tetap tersimpan saat popup ditutup dan dibuka kembali.
* **Deteksi Tab Scratch**: Otomatis mendeteksi apakah tab yang sedang aktif di Chrome adalah Scratch (`https://scratch.mit.edu/`).
* **Status Monitor**: Menampilkan status kesiapan (`Ready` jika di Scratch, atau instruksi buka Scratch jika di tab lain).
* **Manual Screenshot**: Screenshot hanya diambil ketika tombol **"Ambil Screenshot"** ditekan oleh pengguna.
* **Preview Screenshot**: Menampilkan pratinjau screenshot langsung di popup extension.
* **Download Screenshot**: Tombol **"Download"** untuk menyimpan hasil screenshot ke komputer lokal.
* **Daftar Student Online (Teacher)**: Teacher menerima update realtime daftar student yang sedang terhubung ke room.
* **Teacher Dashboard**: Halaman dashboard untuk teacher menampilkan daftar student dan screenshot.
* **Screenshot Request (Teacher → Student)**: Teacher dapat meminta screenshot dari satu student atau semua student. Student otomatis mengambil screenshot tanpa perlu menekan tombol apa pun.
* **Privasi Ketat**: Tidak ada data yang dikirim ke server, tidak ada akses webcam/mikrofon/keylogger/background recording.

---

## Struktur File

```
extention-sreenshot/
├── manifest.json       # Konfigurasi ekstensi Chrome (Manifest V3)
├── popup.html          # Tampilan antarmuka popup ekstensi
├── popup.css           # Styling tampilan popup
├── popup.js            # Logika deteksi tab, storage, dan screenshot
├── background.js       # Service worker: koneksi WebSocket + auto screenshot
├── dashboard.html      # Teacher Dashboard (halaman extension)
├── dashboard.js        # Logika Teacher Dashboard (dipisah karena CSP MV3)
├── test-student.html   # Simulator student untuk testing (buka di tab browser)
├── icons/              # Ikon ekstensi dalam berbagai ukuran
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── server/             # Backend WebSocket (Go)
│   ├── main.go         # Server WebSocket + grouping client per room + relay screenshot
│   ├── main_test.go    # Test backend
│   ├── go.mod          # Dependency Go
│   └── go.sum          # Checksum dependency
├── README.md           # Dokumentasi instalasi dan pengujian
└── specs.txt           # Spesifikasi kebutuhan
```

---

## Cara Instalasi & Reload di Google Chrome

Jika ekstensi sudah terpasang:
1. Buka `chrome://extensions/` di browser Google Chrome.
2. Klik tombol **Reload (🔄)** pada kartu ekstensi **Coding Kids Monitor**.

Jika baru pertama kali memasang:
1. Buka browser **Google Chrome**.
2. Masuk ke halaman `chrome://extensions/`.
3. Aktifkan **Developer mode** di pojok kanan atas.
4. Klik tombol **Load unpacked** di pojok kiri atas.
5. Pilih folder proyek: `/home/andromeda/extention-sreenshot`.

---

## Cara Menjalankan Backend

Backend adalah server WebSocket sederhana di Go (hanya memory, tanpa database).

```bash
cd server
go run .
```

Server berjalan di port `8080` dengan endpoint WebSocket: `ws://localhost:8080/ws`.

---

## Cara Deploy ke VPS (Render — Web Services)

> Pilihan yang benar di Render adalah **Web Services** (Dynamic web app), **bukan** Background Workers (yang untuk job queue).

### 1. Push project ke GitHub

```bash
git init
git add .
git commit -m "Step 5 - Teacher screenshot request"
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

### 2. Deploy di Render

1. Buka [render.com](https://render.com) → **New** → **Blueprint** (Render akan membaca `render.yaml`).
2. Pilih repo GitHub yang sudah di-push.
3. Render otomatis deploy server Go dari folder `server/` (lihat `render.yaml`).
4. Tunggu sampai status `Live`.

### 3. Ubah config.js

Setelah deploy selesai, Render memberi URL seperti:
```
https://coding-kids-monitor.onrender.com
```

Ubah `config.js` di project:

```js
// Sebelum (lokal):
const APP_WS_URL = 'ws://localhost:8080/ws';

// Sesudah (VPS Render):
const APP_WS_URL = 'wss://coding-kids-monitor.onrender.com/ws';
```

> ⚠️ Gunakan `wss://` (bukan `ws://`) karena Render menyediakan HTTPS secara otomatis.

### 4. Reload extension

1. Ubah `config.js`.
2. Buka `chrome://extensions/`.
3. Klik **Reload (🔄)** pada kartu Coding Kids Monitor.
4. Install/reload di semua laptop (teacher dan student) — gunakan **Load unpacked** dari folder proyek.

### 5. Catatan penting

* `server/go.mod` dan `server/go.sum` sudah ada — Render tidak perlu instal tambahan.
* Server membaca port dari environment variable `$PORT` yang disediakan Render.
* File `test-student.html` dan `dashboard.html` juga membaca `config.js` — otomatis ikut berubah.
* Screenshot yang dikirim antar-laptop melalui VPS sama seperti di lokal.

---

## Cara Membuka Teacher Dashboard

1. Buka popup extension.
2. Pilih mode **Teacher**.
3. Isi **Room Code**.
4. Klik tombol **"Buka Teacher Dashboard"** di section Students.
5. Dashboard terbuka di tab baru dan otomatis connect ke room.

Atau buka langsung: `chrome-extension://<extension-id>/dashboard.html?room=ABC123`

---

## Alur WebSocket Screenshot

```
Teacher Dashboard          Go Backend               Student Extension
     │                         │                          │
     │ 1. screenshot_request   │                          │
     │  (target: "Budi")       │                          │
     ├────────────────────────►│                          │
     │                         │ 2. screenshot_request    │
     │                         ├─────────────────────────►│
     │                         │                          │ 3. capture tab Scratch
     │                         │                          │    (otomatis, tanpa klik)
     │                         │ 4. screenshot_result     │
     │                         │◄─────────────────────────┤
     │ 5. screenshot_result    │                          │
     │◄────────────────────────┤                          │
     │                         │                          │
     │ 6. Tampilkan screenshot │                          │
     │    di dashboard         │                          │
```

Untuk **Screenshot Semua**, teacher mengirim `target: "all"` dan backend meneruskan ke semua student di room.

---

## Cara Pengujian

### 1. Uji Mode Student & Koneksi

1. Buka popup ekstensi.
2. Status awal menampilkan: `Disconnected` dan tombol bertuliskan `Connect`.
3. Pilih mode **Student**.
4. Masukkan **Student Name** (contoh: `Budi`) dan **Room Code** (contoh: `ABC123`).
5. Klik tombol **Connect**:
   * Status berubah menjadi: `Connected` (warna hijau).
   * Tombol berubah menjadi: `Disconnect`.
6. Tutup popup ekstensi (klik di luar popup), lalu buka kembali:
   * **Mode** tetap terisi `Student`.
   * **Student Name** tetap terisi `Budi`.
   * **Room Code** tetap terisi `ABC123`.
   * **Status** tetap `Connected`.
7. Klik tombol **Disconnect**:
   * Status kembali menjadi `Disconnected`.
   * Tombol kembali menjadi `Connect`.

### 2. Uji Mode Teacher & Daftar Student

1. Buka popup ekstensi di browser **Teacher**.
2. Pilih mode **Teacher**.
3. Masukkan **Room Code** (contoh: `ABC123`).
4. Klik tombol **Connect**.
5. Section **Students:** muncul dengan daftar student yang sedang online.
6. **Tutup popup lalu buka kembali**: daftar student tetap muncul tanpa perlu reconnect (koneksi WebSocket dijaga oleh background service worker, dan daftar student terakhir disimpan di storage).

### 3. Uji Realtime Daftar Student (1 Teacher + 2 Student) — Cukup 1 Laptop

> **Tidak perlu dua laptop dan tidak perlu profile Chrome terpisah.** Gunakan extension untuk Teacher, dan file `test-student.html` (simulator student) untuk Student. Simulator terhubung langsung ke WebSocket backend, jadi bisa dibuka di beberapa tab sekaligus.

**Persiapan:**
1. Pastikan backend berjalan: `cd server && go run .`
2. Buka file `test-student.html` di browser (klik dua kali file-nya, atau drag ke tab Chrome).

**Langkah testing:**
1. **Teacher** (extension): Buka popup, pilih mode **Teacher**, room `ABC123`, klik **Connect**.
   * Daftar student kosong: `Belum ada student online.`
2. **Student Budi** (tab 1 `test-student.html`): isi nama `Budi`, room `ABC123`, klik **Connect**.
   * Teacher menerima update: `🟢 Budi`
3. **Student Andi** (tab 2 `test-student.html`): isi nama `Andi`, room `ABC123`, klik **Connect**.
   * Teacher menerima update: `🟢 Budi`, `🟢 Andi`
4. **Budi disconnect** (tab 1): klik **Disconnect**.
   * Teacher menerima update: `🟢 Andi`

> 💡 Buka `test-student.html` di tab sebanyak yang Anda mau untuk simulasi banyak student sekaligus.

### 4. Uji Screenshot Satu Student (Teacher Dashboard)

1. Pastikan backend berjalan.
2. **Teacher**: Buka popup → mode **Teacher** → room `ABC123` → **Connect** → klik **"Buka Teacher Dashboard"**.
3. **Student Budi**: Buka `test-student.html` → nama `Budi` → room `ABC123` → **Connect**.
4. Di dashboard, klik tombol **"📸 Screenshot"** pada kartu Budi.
5. Dashboard menampilkan "Mengambil screenshot..." lalu screenshot Budi muncul.
   * Jika Budi adalah extension asli: screenshot tab Scratch Budi diambil otomatis.
   * Jika Budi adalah `test-student.html`: gambar placeholder dikirim sebagai simulasi.

### 5. Uji Screenshot Semua Student

1. Pastikan ada minimal 2 student online (misal Budi & Andi via `test-student.html`).
2. Di dashboard, klik tombol **"📸 Screenshot Semua"**.
3. Semua student otomatis mengambil screenshot dan hasilnya muncul di dashboard masing-masing kartu.

### 6. Uji Tab Bukan Scratch

1. Buka tab baru, misalnya `https://google.com`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Bukan Scratch`
   * **Status Tab**: `Silakan buka Scratch terlebih dahulu.`
   * Kotak peringatan merah muncul.
   * Tombol **"Ambil Screenshot"** tidak dapat ditekan (disabled).

### 7. Uji Tab Scratch & Ambil Screenshot (V0)

1. Buka website Scratch: `https://scratch.mit.edu/` atau `https://scratch.mit.edu/projects/editor/`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Scratch`
   * **Status Tab**: `Ready`
   * Tombol **"Ambil Screenshot"** aktif.
4. Klik tombol **"Ambil Screenshot"**.
5. Gambar screenshot Scratch akan muncul di popup bersama tombol **"Download"**.

### 8. Uji Download

1. Klik tombol **"Download"**.
2. File PNG akan terunduh dengan format nama `scratch-screenshot-YYYY-MM-DD_HH-mm-ss.png`.

---

## Protokol WebSocket

### Register (pesan pertama dari client)

```json
{
  "type": "register",
  "mode": "student",
  "student_name": "Budi",
  "room_code": "ABC123"
}
```

Untuk teacher, `student_name` tidak diperlukan:

```json
{
  "type": "register",
  "mode": "teacher",
  "room_code": "ABC123"
}
```

### Server → Client

* `registered`: ack bahwa client terdaftar.
* `student_list`: daftar student online di room (hanya untuk teacher).

```json
{
  "type": "student_list",
  "students": ["Budi", "Andi"]
}
```

### Teacher → Server → Student (Screenshot Request)

Teacher mengirim:

```json
{
  "type": "screenshot_request",
  "target": "Budi"
}
```

Untuk semua student:

```json
{
  "type": "screenshot_request",
  "target": "all"
}
```

Server meneruskan ke student yang dituju:

```json
{
  "type": "screenshot_request"
}
```

### Student → Server → Teacher (Screenshot Result)

Student mengirim:

```json
{
  "type": "screenshot_result",
  "image_data": "data:image/png;base64,..."
}
```

Server meneruskan ke semua teacher di room:

```json
{
  "type": "screenshot_result",
  "student_name": "Budi",
  "image_data": "data:image/png;base64,..."
}