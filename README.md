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
* **Privasi Ketat**: Tidak ada data yang dikirim ke server, tidak ada akses webcam/mikrofon/keylogger/background recording.

---

## Struktur File

```
extention-sreenshot/
├── manifest.json       # Konfigurasi ekstensi Chrome (Manifest V3)
├── popup.html          # Tampilan antarmuka popup ekstensi
├── popup.css           # Styling tampilan popup
├── popup.js            # Logika deteksi tab, storage, dan screenshot
├── background.js       # Service worker: koneksi WebSocket ke backend
├── icons/              # Ikon ekstensi dalam berbagai ukuran
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── server/             # Backend WebSocket (Go)
│   ├── main.go         # Server WebSocket + grouping client per room
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

### 3. Uji Realtime Daftar Student (1 Teacher + 2 Student)

1. **Teacher**: Buka popup, pilih mode **Teacher**, room `ABC123`, klik **Connect**.
   * Daftar student kosong: `Belum ada student online.`
2. **Student Budi**: Buka popup di browser/device lain, pilih mode **Student**, nama `Budi`, room `ABC123`, klik **Connect**.
   * Teacher menerima update: `🟢 Budi`
3. **Student Andi**: Buka popup di browser/device lain, pilih mode **Student**, nama `Andi`, room `ABC123`, klik **Connect**.
   * Teacher menerima update: `🟢 Budi`, `🟢 Andi`
4. **Budi disconnect**: Klik **Disconnect** di popup Budi.
   * Teacher menerima update: `🟢 Andi`

### 4. Uji Tab Bukan Scratch

1. Buka tab baru, misalnya `https://google.com`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Bukan Scratch`
   * **Status Tab**: `Silakan buka Scratch terlebih dahulu.`
   * Kotak peringatan merah muncul.
   * Tombol **"Ambil Screenshot"** tidak dapat ditekan (disabled).

### 5. Uji Tab Scratch & Ambil Screenshot

1. Buka website Scratch: `https://scratch.mit.edu/` atau `https://scratch.mit.edu/projects/editor/`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Scratch`
   * **Status Tab**: `Ready`
   * Tombol **"Ambil Screenshot"** aktif.
4. Klik tombol **"Ambil Screenshot"**.
5. Gambar screenshot Scratch akan muncul di popup bersama tombol **"Download"**.

### 6. Uji Download

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