# Keamanan Moco — Status & Batasan

Dokumen ini menjelaskan kontrol keamanan yang **benar-benar diterapkan** pada prototype Moco (HTML/CSS/JavaScript + LocalStorage) dan yang **belum bisa dijamin** tanpa backend.

> **Ringkas:** Moco belum aman untuk produksi. Login admin sudah memakai password ter-hash, TOTP, batas percobaan, sesi, validasi, escaping, dan log lokal. Namun semuanya berjalan di browser dan dapat dilewati oleh pengguna yang menguasai perangkat atau DevTools.

## 1. Yang diterapkan

| Kontrol | Implementasi | File |
|---|---|---|
| Password tidak plaintext | PBKDF2-SHA256, 150.000 iterasi, salt acak 128-bit; hash disimpan di `security.js`, bukan password | `assets/js/security.js` |
| MFA | TOTP RFC 6238, 6 digit, periode 30 detik, toleransi ±1 langkah | `assets/js/security.js` |
| Batas percobaan | 5 percobaan gagal (password/MFA) → kunci 2 menit, tersimpan di LocalStorage | `assets/js/security.js` |
| Sesi admin | Token acak 128-bit di `sessionStorage`, kedaluwarsa 30 menit, dicek tiap 30 detik | `assets/js/security.js`, `admin.js` |
| Logout | Menghapus sesi dan mengembalikan ke halaman login | `admin.js` |
| Guard dashboard | Setiap render/route memeriksa `isAuthenticated()`; konten tidak dirender sebelum login | `admin.js` |
| Validasi input | Produk (nama, harga bulat 500–1.000.000, deskripsi, label, gambar), kontak (nomor WA, URL https host allowlist, username IG), kredensial | `security.js` |
| XSS | Semua data dinamis di-escape sebelum masuk HTML; teks kontak memakai `textContent`; URL dibatasi ke https + host allowlist; CSP meta | `app.js`, `admin.js`, `index.html`, `admin.html` |
| Akses terpisah | Halaman pelanggan tidak memuat logika admin; dashboard hanya memuat data setelah login | struktur halaman |
| Log aktivitas | Login, MFA, logout, CRUD produk, status pesanan, kontak, backup/restore, reset; retensi 90 hari, maks. 300 entri, tanpa password/kode | `security.js`, `admin.js` |
| Backup & pemulihan | Unduh JSON produk/pesanan/kontak; validasi ulang setiap produk/kontak saat restore | `store.js`, `admin.js` |
| Privasi | Halaman `privacy.html` menjelaskan data, LocalStorage, WhatsApp, dan batasan keamanan | `privacy.html` |
| Rahasia tidak di repo | `.gitignore` mengecualikan `.env*`, kunci, log, backup, `node_modules` | `.gitignore` |
| HTTPS | Preview memakai HTTPS; produksi wajib TLS/HSTS di server/CDN | konfigurasi hosting |

## 2. Kredensial prototype

- Username: `admib`
- Password: `admin` (hanya hash-nya yang ada di kode)
- MFA: TOTP dengan secret demo `JBSWY3DPEHPK3PXP`; tombol “Tampilkan kode demo” pada login menghitung kode saat ini untuk pengujian.

Ganti kredensial dan secret sebelum produksi. Jangan gunakan akun ini untuk data nyata.

## 3. Yang belum aman (butuh backend)

1. **Verifikasi login di server.** Saat ini hash dan secret MFA ada di JavaScript; siapa pun dapat membacanya. Backend harus menyimpan hash password (Argon2id/bcrypt) dan secret MFA di database, serta memverifikasi di server.
2. **Rate limiting sebenarnya.** Penghitung percobaan di LocalStorage bisa dihapus. Butuh limiter per akun + per IP di server, plus CAPTCHA/alert.
3. **Sesi sebenarnya.** Token saat ini tidak ditandatangani dan tidak divalidasi server. Gunakan cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict`, session server-side, rotasi, dan CSRF token.
4. **Otorisasi sisi server.** Semua endpoint admin harus memeriksa peran pada setiap request, bukan hanya menyembunyikan UI.
5. **Database & SQL injection.** Belum ada database. Jika ditambahkan, gunakan prepared statements/parameterized queries, least-privilege user, dan migrasi tervalidasi.
6. **MFA anti-replay & enrollment.** TOTP demo belum punya backup code, enrollment QR, atau pencatatan langkah terakhir. Implementasikan di backend.
7. **Log terpusat & tamper-proof.** Log lokal dapat dihapus pengguna. Kirim ke server/log service dengan akses terbatas dan retensi 90 hari.
8. **Backup otomatis.** Backup saat ini manual (JSON). Produksi butuh backup database terjadwal, enkripsi, uji restore, dan penyimpanan terpisah.
9. **HTTPS/HSTS.** Tidak dapat dipaksakan dari file statis. Aktifkan TLS, redirect HTTP→HTTPS, dan HSTS di hosting.
10. **Manajemen dependensi/CVE.** Website tidak memakai library JS runtime; font dimuat dari Google Fonts. Jika menambah dependensi, kunci versi, audit (`npm audit`/Dependabot), dan tinjau CVE.

## 4. Cara menguji cepat

1. Buka `admin.html`.
2. Login salah 5× → muncul penguncian 2 menit dan hitungan mundur.
3. Login `admib` / `admin` → langkah MFA muncul.
4. Buka “Tampilkan kode demo”, masukkan kode → dashboard terbuka.
5. Refresh halaman → sesi masih aktif (sessionStorage) hingga 30 menit; tutup tab → sesi berakhir.
6. Produk: coba harga negatif/desimal, nama kosong, deskripsi pendek, URL gambar `javascript:` → ditolak dengan pesan per field.
7. Kontak: coba nomor non-digit atau link bukan https/instagram/wa.me → ditolak.
8. Keamanan → unduh backup, ubah data, pulihkan backup, lihat log aktivitas.
9. Logout → dashboard tertutup dan hash dibersihkan.

## 5. Checklist Minimum UMKM → status

| Item | Status |
|---|---|
| Autentikasi admin aman | Sebagian (hash + MFA + lockout di browser) |
| MFA | Prototype TOTP; produksi butuh backend |
| Batas percobaan | Prototype (client-side) |
| Logout & sesi | Prototype (sessionStorage, 30 menit) |
| Password di-hash | Ya (PBKDF2-SHA256 + salt) |
| HTTPS | Preview HTTPS; produksi perlu konfigurasi host |
| .env & .gitignore | `.gitignore` disiapkan; tidak ada rahasia yang di-commit |
| Validasi input | Ya (produk, kontak, kredensial, kuantitas) |
| Anti-XSS | Escaping + CSP + allowlist URL |
| Anti-SQL injection | N/A (belum ada database) |
| Kontrol akses | Pemisahan halaman + guard; produksi butuh cek server |
| Log aktivitas | Lokal, 90 hari, tanpa rahasia |
| Backup/pemulihan | Manual JSON + validasi restore |
| Kebijakan privasi | `privacy.html` |

## 6. Langkah produksi yang disarankan

- Pindahkan seluruh data ke backend + database (PostgreSQL/MySQL/Supabase) dengan prepared statements.
- Gunakan framework auth tervalidasi (mis. session server-side + Argon2id; TOTP/WebAuthn).
- Terapkan rate limit, lockout, audit log, dan alert login di server.
- Wajibkan HTTPS + HSTS, cookie aman, CSP header (bukan hanya meta), dan security headers lain.
- Simpan rahasia di environment variables (`.env` di server, bukan repo), rotasi berkala.
- Pisahkan environment development/staging/production dan data demo.
- Jadwalkan backup terenkripsi + uji restore berkala.
- Ganti kredensial demo dan secret MFA sebelum go-live.
