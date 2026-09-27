# Coding Kids Monitor — V0

Chrome Extension sederhana berbasis Manifest V3 untuk membantu tutor Coding Kids mengambil screenshot tab coding siswa di Scratch (`https://scratch.mit.edu/`).

## Fitur V0

* **Deteksi Tab Scratch**: Otomatis mendeteksi apakah tab yang sedang aktif di Chrome adalah Scratch (`https://scratch.mit.edu/`).
* **Status Monitor**: Menampilkan status kesiapan (`Ready` jika di Scratch, atau instruksi buka Scratch jika di tab lain).
* **Manual Screenshot**: Screenshot hanya diambil ketika tombol **"Ambil Screenshot"** ditekan oleh pengguna (tidak ada screenshot otomatis).
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
├── popup.js            # Logika deteksi tab, screenshot, dan download
├── icons/              # Ikon ekstensi dalam berbagai ukuran
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md           # Dokumentasi instalasi dan pengujian
└── specs.txt           # Spesifikasi kebutuhan V0
```

---

## Cara Instalasi & Reload di Google Chrome

Jika extension sudah terpasang sebelumnya, cukup klik tombol **Reload** (ikon putar) pada kartu ekstensi di halaman `chrome://extensions/`.

Langkah instalasi baru:
1. Buka browser **Google Chrome**.
2. Masuk ke halaman Extensions: ketik `chrome://extensions/` di address bar.
3. Aktifkan **Developer mode** di pojok kanan atas.
4. Klik tombol **Load unpacked** di pojok kiri atas.
5. Pilih folder proyek:
   ```
   /home/andromeda/extention-sreenshot
   ```
6. Ekstensi **Coding Kids Monitor** akan muncul dan siap digunakan.

---

## Cara Pengujian (Acceptance Test)

### 1. Uji Tab Bukan Scratch
1. Buka tab baru, misalnya `https://google.com`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Bukan Scratch`
   * **Status**: `Silakan buka Scratch terlebih dahulu.`
   * Kotak peringatan merah muncul.
   * Tombol **"Ambil Screenshot"** tidak dapat ditekan (disabled).

### 2. Uji Tab Scratch & Ambil Screenshot
1. Buka website Scratch: `https://scratch.mit.edu/` atau `https://scratch.mit.edu/projects/editor/`.
2. Klik ikon ekstensi **Coding Kids Monitor**.
3. Hasil:
   * **Active tab**: `Scratch`
   * **Status**: `Ready`
   * Tombol **"Ambil Screenshot"** aktif.
4. Klik tombol **"Ambil Screenshot"**.
5. Gambar screenshot Scratch akan muncul di popup bersama tombol **"Download"**.

### 3. Uji Download
1. Klik tombol **"Download"**.
2. File PNG akan terunduh dengan format nama `scratch-screenshot-YYYY-MM-DD_HH-mm-ss.png`.
