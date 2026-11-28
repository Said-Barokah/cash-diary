# CashDiary — Mode Keluarga

Website untuk mencatat pengeluaran/pemasukan sehari-hari (bensin, makan, jajan, dll), dengan data tersimpan **online** di [Firebase Firestore](https://firebase.google.com/) dan **sinkron real-time** — suami dan istri (atau siapa pun) yang pakai kode keluarga yang sama akan melihat data yang sama, langsung update tanpa refresh, walau beda HP/device.

Tampilannya (HTML/CSS/JS) tetap di-hosting gratis lewat **GitHub Pages**; hanya datanya yang disimpan online di Firebase (juga gratis untuk pemakaian pribadi).

## Fitur
- **Kode Keluarga** — tanpa akun/email/password. Buat satu kode (8 karakter acak), bagikan ke pasangan, keduanya otomatis lihat data yang sama secara real-time.
- Catat transaksi (tanggal, tipe, kategori, jumlah, catatan)
- Kategori bisa ditambah sendiri langsung dari form
- Filter periode (bulan ini/lalu, 7/30 hari terakhir, semua, kustom) dan per kategori
- Kartu ringkasan: total pemasukan, pengeluaran, saldo
- Grafik donat pengeluaran per kategori + grafik batang pemasukan vs pengeluaran 6 bulan terakhir
- Export ke `.csv` (buka di Excel/Sheets)
- Mode terang/gelap
- Modal & notifikasi (toast) kustom — tidak ada pop-up `alert`/`confirm` bawaan browser

## Langkah 1 — Setup Firebase (sekali saja, gratis)

1. Buka [console.firebase.google.com](https://console.firebase.google.com), login pakai akun Google.
2. **Add project** → beri nama (misal `cashdiary`) → boleh matikan Google Analytics → **Create project**.
3. Di sidebar: **Build → Firestore Database → Create database** → pilih **Start in production mode** → pilih lokasi server terdekat (misal `asia-southeast2 (Jakarta)`) → **Enable**.
4. Di sidebar: **Build → Authentication → Get started** → tab **Sign-in method** → klik **Anonymous** → **Enable** → **Save**.
5. Masih di Firestore Database, buka tab **Rules**, ganti isinya dengan:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /households/{code}/{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
   lalu klik **Publish**.
6. Klik ikon gerigi (atas sidebar) → **Project settings** → scroll ke **Your apps** → klik ikon `</>` (Web) → beri nickname (misal `cashdiary-web`) → **jangan** centang Firebase Hosting → **Register app**. Akan muncul object `firebaseConfig` — copy nilainya.
7. Buka file `script.js`, cari bagian ini di bagian atas file, dan ganti dengan nilai Anda:
   ```js
   const firebaseConfig = {
     apiKey: "GANTI_DENGAN_API_KEY_ANDA",
     authDomain: "GANTI.firebaseapp.com",
     projectId: "GANTI",
     storageBucket: "GANTI.appspot.com",
     messagingSenderId: "GANTI",
     appId: "GANTI",
   };
   ```

## Langkah 2 — Deploy ke GitHub Pages

1. Buat repository baru di GitHub bernama `cash-diary`. **Harus Public** (GitHub Pages gratis hanya untuk repo publik — lihat catatan di bawah).
2. Upload semua file: `index.html`, `style.css`, `script.js` (yang sudah diisi `firebaseConfig`), `ui.js`, `favicon.ico`, `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`.
3. Buka **Settings → Pages** di repo tersebut.
4. **Build and deployment → Source**: pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, klik **Save**.
5. Tunggu 1-2 menit, website aktif di `https://USERNAME.github.io/cash-diary/`.

> **Repo harus Public**: GitHub Pages gratis cuma jalan dari repo publik. Ini aman di sini — kode di repo tidak memuat password apa pun; `firebaseConfig` memang didesain publik (keamanan data sebenarnya diatur oleh *Security Rules* di langkah 1.5, bukan dengan menyembunyikan config ini).

## Cara pakai

- Buka pertama kali → klik **"Buat kode keluarga baru"** → kode (misal `7K9QXZAB`) otomatis tersalin ke clipboard. Simpan/bagikan ke pasangan.
- Pasangan buka website yang sama di HP-nya → masukkan kode itu di kolom **"Sudah punya kode keluarga?"** → klik **Gabung**.
- Selesai — keduanya sekarang melihat data transaksi yang sama, real-time.
- Tombol **"Ganti kode"** di bagian atas untuk keluar dari kode saat ini (misal salah ketik, atau mau pindah ke kode lain).

## Soal keamanan & privasi

- Siapa pun yang tahu kode 8-karakter itu bisa baca & tulis data household tersebut — **tidak ada password tambahan**. Jaga kode seperti menjaga kunci rumah: jangan dibagikan ke sembarang orang.
- Tidak ada fitur "undang" atau approval — siapa pun yang memasukkan kode yang benar langsung masuk.
- Kalau merasa kode sudah tidak aman (misal tidak sengaja tersebar), solusinya: klik "Buat kode keluarga baru" untuk dapat kode baru, lalu pindah manual (catat ulang transaksi penting, atau mulai fresh) — tidak ada fitur "rotate kode" otomatis untuk household yang sama.

## Kalau ingin menjalankan di lokal (opsional)

```
python3 -m http.server 8000
```
lalu buka `http://localhost:8000`. (Browser modern mengizinkan `localhost` untuk Firebase, jadi testing lokal tetap berfungsi normal.)
