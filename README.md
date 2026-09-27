# Coding Kids Monitor

Chrome Extension sederhana berbasis Manifest V3 untuk membantu tutor Coding Kids mengambil screenshot tab coding siswa di Scratch (https://scratch.mit.edu/).

## Fitur

* **Student Name & Room Code**: Input nama siswa dan kode room untuk identifikasi sesi.
* **Connect / Disconnect**: Tombol toggle koneksi dengan status `Disconnected` / `Connected` (tanpa backend/internet).
* **Storage Otomatis**: Menyimpan Student Name dan Room Code secara lokal di `chrome.storage.local` agar tetap tersimpan saat popup ditutup dan dibuka kembali.
* **Deteksi Tab Scratch**: Otomatis mendeteksi apakah tab yang sedang aktif di Chrome adalah Scratch (`https://scratch.mit.edu/`).
* **Status Monitor**: Menampilkan status kesiapan (`Ready` jika di Scratch, atau instruksi buka Scratch jika di tab lain).
* **Manual Screenshot**: Screenshot hanya diambil ketika tombol **"Ambil Screenshot"** ditekan oleh pengguna.
* **Preview Screenshot**: Menampilkan pratinjau screenshot langsung di popup extension.
* **Download Screenshot**: Tombol **"Download"** untuk menyimpan hasil screenshot ke komputer lokal.
* **Privasi Ketat**: Tidak ada data yang dikirim ke server, tidak ada akses webcam/mikrofon/keylogger/background recording.

---

## Struktur File

```
extention-sreenshot/
├── manifest.json       # Konfigurasi ekstensi Chrome (Manifest V3)
├── popup.html          # Tampilan antarmuka popup ekstensi
├── popup.css           # Styling tampilan popup
├── popup.js            # Logika deteksi tab, storage, dan screenshot
├── icons/              # Ikon ekstensi dalam berbagai ukuran
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
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

## Cara Pengujian

### 1. Uji Student Name, Room Code & Status Koneksi
1. Buka popup ekstensi.
2. Status awal menampilkan: `Disconnected` dan tombol bertuliskan `Connect`.
3. Masukkan **Student Name** (contoh: `Budi`) dan **Room Code** (contoh: `ROOM-101`).
4. Klik tombol **Connect**:
   * Status berubah menjadi: `Connected` (warna hijau).
   * Tombol berubah menjadi: `Disconnect`.
5. Tutup popup ekstensi (klik di luar popup), lalu buka kembali:
   * **Student Name** tetap terisi `Budi`.
   * **Room Code** tetap terisi `ROOM-101`.
   * **Status** tetap `Connected`.
6. Klik tombol **Disconnect**:
   * Status kembali menjadi `Disconnected`.
   * Tombol kembali menjadi `Connect`.

### 2. Uji Tab Bukan Scratch
1. Buka tab baru, misalnya `https://google.com`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Bukan Scratch`
   * **Status Tab**: `Silakan buka Scratch terlebih dahulu.`
   * Kotak peringatan merah muncul.
   * Tombol **"Ambil Screenshot"** tidak dapat ditekan (disabled).

### 3. Uji Tab Scratch & Ambil Screenshot
1. Buka website Scratch: `https://scratch.mit.edu/` atau `https://scratch.mit.edu/projects/editor/`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Scratch`
   * **Status Tab**: `Ready`
   * Tombol **"Ambil Screenshot"** aktif.
4. Klik tombol **"Ambil Screenshot"**.
5. Gambar screenshot Scratch akan muncul di popup bersama tombol **"Download"**.

### 4. Uji Download
1. Klik tombol **"Download"**.
2. File PNG akan terunduh dengan format nama `scratch-screenshot-YYYY-MM-DD_HH-mm-ss.png`.
