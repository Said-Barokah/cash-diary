# CashDiary

Website sederhana untuk mencatat pengeluaran/pemasukan sehari-hari (bensin, makan, jajan, dll), 100% jalan di browser — tanpa server. Datanya tersimpan sebagai database **SQLite asli** (lewat [sql.js](https://sql.js.org/), SQLite yang di-compile ke WebAssembly) di dalam IndexedDB browser Anda, lengkap dengan fitur export/import file `.sqlite` untuk backup atau pindah antar device.

## Fitur
- **Profil terpisah** — seperti profil Netflix, pilih/buat nama profil di dropdown atas, tiap profil punya data transaksi & kategori sendiri yang sepenuhnya terpisah (tanpa password)
- Catat transaksi (tanggal, tipe, kategori, jumlah, catatan)
- Kategori bisa ditambah sendiri langsung dari form
- Filter periode (bulan ini/lalu, 7/30 hari terakhir, semua, kustom) dan per kategori
- Kartu ringkasan: total pemasukan, pengeluaran, saldo
- Grafik donat pengeluaran per kategori + grafik batang pemasukan vs pengeluaran 6 bulan terakhir
- Export ke `.sqlite` (backup/pindah device) dan `.csv` (buka di Excel/Sheets)
- Mode terang/gelap

## Cara deploy ke GitHub Pages

1. Buat repository baru di GitHub (publik), beri nama `cash-diary`.
2. Upload semua file ini ke root repository: `index.html`, `style.css`, `script.js`, `favicon.ico`, `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `favicon-192.png`, `favicon-512.png`, `apple-touch-icon.png`.
   - Lewat web: klik **Add file → Upload files** di halaman repo, drag semua file sekaligus, lalu **Commit changes**.
   - Atau lewat git:
     ```
     git init
     git add .
     git commit -m "CashDiary"
     git branch -M main
     git remote add origin https://github.com/USERNAME/cash-diary.git
     git push -u origin main
     ```
3. Buka **Settings → Pages** di repo tersebut.
4. Di bagian **Build and deployment**, pilih source **Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
5. Tunggu 1-2 menit, website akan aktif di:
   `https://USERNAME.github.io/cash-diary/`

## Penting soal penyimpanan data

- Data disimpan **di browser ini saja** (IndexedDB), per browser/device. Membuka website ini dari HP dan laptop akan menunjukkan dua set data yang berbeda.
- **Profil** hanya memisahkan data di dalam satu browser/device yang sama (tanpa login/password) — bukan akun yang bisa dipakai login dari device lain. Kalau mau "profil A" juga bisa diakses dari HP lain, tetap pakai Export/Import `.sqlite` di profil tersebut.
- Untuk pindah data antar device atau sekadar backup: klik **Export .sqlite** di satu device, lalu buka website di device lain dan klik **Import .sqlite** untuk memuatnya (ini akan menimpa data yang ada di device tujuan).
- Jangan bersihkan "Site data"/cache browser untuk domain github.io Anda, karena itu akan ikut menghapus database ini. Biasakan export berkala sebagai backup.
- File `.sqlite` yang di-export bisa dibuka dengan tool SQLite biasa (DB Browser for SQLite, dsb.) kalau sewaktu-waktu perlu analisis manual.

## Menjalankan di lokal (opsional, untuk coba-coba sebelum deploy)

Buka folder ini di terminal lalu jalankan server statis sederhana, misalnya:
```
python3 -m http.server 8000
```
lalu buka `http://localhost:8000` di browser.
