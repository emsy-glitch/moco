/* ==========================================================================
   Moco — security utilities (PROTOTYPE / FRONTEND ONLY)
   --------------------------------------------------------------------------
   Yang benar-benar diterapkan di sini:
   - Password admin tidak disimpan sebagai teks biasa (PBKDF2-SHA256 + salt).
   - Faktor kedua berbasis TOTP (kode 6 angka, berganti tiap 30 detik).
   - Batas percobaan login + penguncian sementara (localStorage).
   - Sesi admin dengan masa berlaku dan logout yang menghapus sesi.
   - Validasi input produk/kontak/kredensial dan pembersihan teks.
   - Log aktivitas lokal (maks. 300 entri, retensi 90 hari, tanpa rahasia).

   KETERBATASAN PENTING:
   Semua kode ini berjalan di browser. Penyerang yang menguasai perangkat
   atau JavaScript halaman dapat membaca hash, melewati lockout, atau
   memalsukan sesi. MFA, rate limiting, session, dan log yang aman WAJIB
   dipindahkan ke backend untuk produksi. Lihat SECURITY.md.
   ========================================================================== */
(function (global) {
  'use strict';

  const CONFIG = {
    username: 'admib',
    // PBKDF2-SHA256, salt acak. Hash untuk password prototype "admin".
    salt: '73c4854ebe0f5b26a672c4bf00694bb5',
    iterations: 150000,
    passwordHash: '021fe389140578f6db38e8474f7f25731e353725ac527aae765b2811ca99bd7a',
    mfa: {
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      issuer: 'Moco Admin',
      account: 'admib'
    },
    limits: {
      maxAttempts: 5,
      lockMs: 2 * 60 * 1000,
      sessionMs: 30 * 60 * 1000,
      pendingMs: 5 * 60 * 1000,
      logMax: 300,
      logDays: 90
    }
  };

  const KEYS = {
    attempts: 'moco.security.attempts.v1',
    session: 'moco.security.session.v1',
    log: 'moco.security.log.v1'
  };

  let pendingMfa = null;

  const now = () => Date.now();
  const controlChars = /[\u0000-\u001f\u007f]/g;

  function sanitizeText(value, max) {
    const limit = max || 500;
    return String(value == null ? '' : value)
      .replace(controlChars, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  }

  function stripTags(value) {
    return String(value == null ? '' : value).replace(/[<>]/g, '');
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function fromHex(hex) {
    const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  function randomHex(bytes) {
    const buffer = new Uint8Array(bytes);
    global.crypto.getRandomValues(buffer);
    return toHex(buffer.buffer);
  }

  function hasCrypto() {
    return Boolean(global.crypto && global.crypto.subtle && global.crypto.getRandomValues);
  }

  function sameHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  /* ---------------- Password hashing ---------------- */
  async function hashPassword(password) {
    if (!hasCrypto()) throw new Error('Web Crypto tidak tersedia. Buka situs melalui http/https.');
    const encoder = new TextEncoder();
    const material = await global.crypto.subtle.importKey(
      'raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await global.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: fromHex(CONFIG.salt), iterations: CONFIG.iterations, hash: 'SHA-256' },
      material,
      256
    );
    return toHex(bits);
  }

  /* ---------------- TOTP (RFC 6238) ---------------- */
  function base32ToBytes(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = String(input || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const char of clean) {
      const index = alphabet.indexOf(char);
      if (index < 0) continue;
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  async function totpAt(offset) {
    if (!hasCrypto()) return null;
    const period = CONFIG.mfa.period;
    const step = Math.floor(now() / 1000 / period) + (offset || 0);
    const counter = new Uint8Array(8);
    let temp = step;
    for (let i = 7; i >= 0; i -= 1) {
      counter[i] = temp & 0xff;
      temp = Math.floor(temp / 256);
    }
    const key = await global.crypto.subtle.importKey(
      'raw', base32ToBytes(CONFIG.mfa.secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );
    const signature = new Uint8Array(await global.crypto.subtle.sign('HMAC', key, counter));
    const shift = signature[signature.length - 1] & 0x0f;
    const binary = ((signature[shift] & 0x7f) << 24) |
      ((signature[shift + 1] & 0xff) << 16) |
      ((signature[shift + 2] & 0xff) << 8) |
      (signature[shift + 3] & 0xff);
    const code = String(binary % Math.pow(10, CONFIG.mfa.digits)).padStart(CONFIG.mfa.digits, '0');
    const secondsLeft = period - (Math.floor(now() / 1000) % period);
    return { code, step, secondsLeft };
  }

  async function currentTotp() {
    return totpAt(0);
  }

  async function verifyTotp(code) {
    const value = String(code || '').replace(/\D/g, '');
    if (value.length !== CONFIG.mfa.digits) return false;
    for (const offset of [-1, 0, 1]) {
      const result = await totpAt(offset);
      if (result && result.code === value) return true;
    }
    return false;
  }

  /* ---------------- Lockout ---------------- */
  function readAttempts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEYS.attempts) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeAttempts(state) {
    try {
      localStorage.setItem(KEYS.attempts, JSON.stringify(state));
    } catch (err) { /* penyimpanan penuh / diblokir */ }
  }

  function getLockState() {
    const state = readAttempts();
    let { count = 0, lockedUntil = 0 } = state;
    if (lockedUntil && lockedUntil <= now()) {
      count = 0;
      lockedUntil = 0;
      writeAttempts({ count, lockedUntil });
    }
    return {
      locked: lockedUntil > now(),
      remainingMs: Math.max(0, lockedUntil - now()),
      lockedUntil,
      attempts: count,
      maxAttempts: CONFIG.limits.maxAttempts
    };
  }

  function clearAttempts() {
    writeAttempts({ count: 0, lockedUntil: 0 });
  }

  function registerFailure(kind) {
    const state = readAttempts();
    const count = (state.count || 0) + 1;
    const lockedUntil = count >= CONFIG.limits.maxAttempts ? now() + CONFIG.limits.lockMs : 0;
    writeAttempts({ count, lockedUntil });
    if (lockedUntil) {
      pendingMfa = null;
      log('login.locked', `Akun terkunci sementara setelah ${count} percobaan gagal (${kind}).`);
    }
    return getLockState();
  }

  /* ---------------- Validation ---------------- */
  function validateCredentials(username, password) {
    const errors = {};
    const user = sanitizeText(username, 60);
    const pass = String(password == null ? '' : password);

    if (!/^[A-Za-z0-9._-]{3,30}$/.test(user)) {
      errors.username = 'Username 3–30 karakter: huruf, angka, titik, garis bawah, atau strip.';
    }
    if (pass.length < 5 || pass.length > 128) {
      errors.password = 'Password harus 5–128 karakter.';
    }
    return { ok: Object.keys(errors).length === 0, errors, username: user };
  }

  function isHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:';
    } catch (err) {
      return false;
    }
  }

  function safeHref(value, allowedHosts) {
    const raw = String(value || '').trim();
    if (!raw || !isHttpsUrl(raw)) return '';
    try {
      const url = new URL(raw);
      return allowedHosts.includes(url.hostname) ? url.href : '';
    } catch (err) {
      return '';
    }
  }

  function safeImage(value) {
    const raw = String(value || '').trim();
    if (/^assets\/img\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i.test(raw)) return raw;
    if (/^https:\/\/[^\s"'<>]+$/i.test(raw) && raw.length <= 1200) return raw;
    if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw) && raw.length <= 1600000) return raw;
    return '';
  }

  function validateProduct(input) {
    const data = input || {};
    const errors = {};
    const name = sanitizeText(stripTags(data.name), 60);
    const price = Number(data.price);
    const desc = sanitizeText(stripTags(data.desc), 240);
    const tag = sanitizeText(stripTags(data.tag), 20);
    const image = safeImage(data.image);

    if (name.length < 2) errors.name = 'Nama produk minimal 2 karakter.';
    if (!Number.isInteger(price) || price < 500 || price > 1000000) {
      errors.price = 'Harga harus bilangan bulat antara Rp500 dan Rp1.000.000.';
    }
    if (desc.length < 5) errors.desc = 'Deskripsi minimal 5 karakter.';
    if (tag.length > 20) errors.tag = 'Label maksimal 20 karakter.';
    if (data.image && !image) errors.image = 'Gambar harus path lokal, URL https, atau upload JPG/PNG/WebP.';

    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: {
        id: data.id ? String(data.id) : '',
        name,
        price,
        desc,
        tag: tag || 'Moco',
        image,
        featured: Boolean(data.featured),
        available: data.available !== false
      }
    };
  }

  function validateContact(input) {
    const data = input || {};
    const errors = {};

    const waDisplay = sanitizeText(data.waDisplay, 24);
    const waNumber = String(data.waNumber || '').replace(/[^\d]/g, '');
    const waLinkRaw = String(data.waLink || '').trim();
    const igUsername = sanitizeText(data.igUsername, 30).replace(/^@/, '');
    const igLinkRaw = String(data.igLink || '').trim();

    if (!/^[0-9+\s()-]{8,24}$/.test(waDisplay)) {
      errors.waDisplay = 'Nomor tampilan 8–24 karakter angka/spasi/tanda +, -, ().';
    }
    if (!/^(62|0)\d{7,13}$/.test(waNumber)) {
      errors.waNumber = 'Nomor WhatsApp harus 8–15 digit dan diawali 62 atau 0.';
    }
    if (!/^[A-Za-z0-9._]{1,30}$/.test(igUsername)) {
      errors.igUsername = 'Username Instagram 1–30 karakter: huruf, angka, titik, garis bawah.';
    }

    const waLink = waLinkRaw
      ? safeHref(waLinkRaw, ['wa.me', 'api.whatsapp.com', 'www.whatsapp.com', 'web.whatsapp.com'])
      : `https://wa.me/${waNumber}`;
    if (!waLink) errors.waLink = 'Link WhatsApp harus URL https yang valid (wa.me / api.whatsapp.com).';

    const igLink = igLinkRaw
      ? safeHref(igLinkRaw, ['www.instagram.com', 'instagram.com'])
      : `https://www.instagram.com/${igUsername}/`;
    if (!igLink) errors.igLink = 'Link Instagram harus URL https instagram.com yang valid.';

    return {
      ok: Object.keys(errors).length === 0,
      errors,
      value: { waNumber, waDisplay: waDisplay || waNumber, waLink, igUsername, igLink }
    };
  }

  /* ---------------- Session ---------------- */
  function createSession() {
    const created = now();
    const session = {
      user: CONFIG.username,
      token: randomHex(16),
      createdAt: created,
      expiresAt: created + CONFIG.limits.sessionMs
    };
    try {
      sessionStorage.setItem(KEYS.session, JSON.stringify(session));
    } catch (err) { /* sessionStorage diblokir */ }
    return session;
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(KEYS.session);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.token || !session.expiresAt || session.expiresAt <= now()) {
        sessionStorage.removeItem(KEYS.session);
        return null;
      }
      return session;
    } catch (err) {
      return null;
    }
  }

  function isAuthenticated() {
    return Boolean(getSession());
  }

  function sessionInfo() {
    const session = getSession();
    if (!session) return { authenticated: false, remainingMs: 0 };
    return {
      authenticated: true,
      user: session.user,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      remainingMs: Math.max(0, session.expiresAt - now()),
      timeoutMs: CONFIG.limits.sessionMs
    };
  }

  function logout(reason) {
    try { sessionStorage.removeItem(KEYS.session); } catch (err) { /* abaikan */ }
    pendingMfa = null;
    log('logout', reason || 'Admin logout.');
  }

  /* ---------------- Activity log ---------------- */
  function readLogs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEYS.log) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function log(action, detail) {
    const cutoff = now() - CONFIG.limits.logDays * 24 * 60 * 60 * 1000;
    const session = getSession();
    const entry = {
      at: new Date().toISOString(),
      actor: session ? session.user : 'system',
      action: sanitizeText(action, 40),
      detail: sanitizeText(detail, 180)
    };
    const logs = readLogs()
      .filter((item) => item && new Date(item.at).getTime() >= cutoff)
      .slice(0, CONFIG.limits.logMax - 1);
    logs.unshift(entry);
    try {
      localStorage.setItem(KEYS.log, JSON.stringify(logs));
    } catch (err) { /* log tidak bisa disimpan */ }
    return entry;
  }

  function getLogs(limit) {
    const cutoff = now() - CONFIG.limits.logDays * 24 * 60 * 60 * 1000;
    return readLogs()
      .filter((item) => item && new Date(item.at).getTime() >= cutoff)
      .slice(0, limit || 100);
  }

  /* ---------------- Login flow ---------------- */
  async function loginStep1(username, password) {
    if (!hasCrypto()) {
      return { ok: false, reason: 'unsupported', message: 'Browser ini tidak mendukung Web Crypto. Buka melalui HTTPS.' };
    }

    const lock = getLockState();
    if (lock.locked) {
      return { ok: false, reason: 'locked', message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(lock.remainingMs / 1000)} detik.`, lock };
    }

    const validation = validateCredentials(username, password);
    if (!validation.ok) {
      return {
        ok: false,
        reason: 'invalid',
        message: validation.errors.username || validation.errors.password,
        fields: validation.errors
      };
    }

    const hash = await hashPassword(password);
    const usernameOk = validation.username === CONFIG.username;
    const passwordOk = sameHex(hash, CONFIG.passwordHash);

    if (!usernameOk || !passwordOk) {
      const state = registerFailure('password');
      log('login.failure', `Login gagal untuk username "${validation.username}".`);
      return {
        ok: false,
        reason: state.locked ? 'locked' : 'credentials',
        message: state.locked
          ? 'Terlalu banyak percobaan gagal. Akun dikunci sementara.'
          : 'Username atau password salah.',
        lock: state
      };
    }

    pendingMfa = { at: now(), user: CONFIG.username };
    log('login.step1', 'Password benar. Menunggu verifikasi MFA.');
    return { ok: true, user: CONFIG.username };
  }

  async function verifyMfa(code) {
    const lock = getLockState();
    if (lock.locked) {
      pendingMfa = null;
      return { ok: false, reason: 'locked', message: `Akun terkunci. Coba lagi dalam ${Math.ceil(lock.remainingMs / 1000)} detik.`, lock };
    }
    if (!pendingMfa || now() - pendingMfa.at > CONFIG.limits.pendingMs) {
      pendingMfa = null;
      return { ok: false, reason: 'expired', message: 'Sesi verifikasi kedaluwarsa. Masukkan password kembali.' };
    }

    const digits = String(code || '').replace(/\D/g, '');
    if (digits.length !== CONFIG.mfa.digits) {
      const state = registerFailure('mfa');
      log('mfa.failure', 'Kode MFA tidak valid (format).');
      return { ok: false, reason: 'format', message: 'Kode verifikasi harus 6 angka.', lock: state };
    }

    const valid = await verifyTotp(digits);
    if (!valid) {
      const state = registerFailure('mfa');
      log('mfa.failure', 'Kode MFA salah.');
      return {
        ok: false,
        reason: state.locked ? 'locked' : 'code',
        message: state.locked ? 'Terlalu banyak kode salah. Akun dikunci sementara.' : 'Kode verifikasi salah atau kedaluwarsa.',
        lock: state
      };
    }

    clearAttempts();
    pendingMfa = null;
    createSession();
    log('login.success', 'Login admin berhasil (password + MFA).');
    return { ok: true };
  }

  function cancelMfa() {
    pendingMfa = null;
  }

  function isMfaPending() {
    return Boolean(pendingMfa && now() - pendingMfa.at <= CONFIG.limits.pendingMs);
  }

  /* ---------------- Backup metadata ---------------- */
  function describeProtection() {
    return {
      hashing: `PBKDF2-SHA256 · ${CONFIG.iterations.toLocaleString('id-ID')} iterasi · salt acak 128-bit`,
      mfa: `TOTP ${CONFIG.mfa.digits} digit · periode ${CONFIG.mfa.period} detik`,
      lockout: `${CONFIG.limits.maxAttempts} percobaan gagal → kunci ${CONFIG.limits.lockMs / 60000} menit`,
      session: `Sesi ${CONFIG.limits.sessionMs / 60000} menit · token acak 128-bit`,
      log: `Retensi ${CONFIG.limits.logDays} hari · maks. ${CONFIG.limits.logMax} entri`,
      environment: 'Prototipe front-end (LocalStorage) — bukan pengamanan produksi'
    };
  }

  global.MocoSecurity = {
    KEYS,
    CONFIG: {
      username: CONFIG.username,
      iterations: CONFIG.iterations,
      limits: CONFIG.limits,
      mfa: { digits: CONFIG.mfa.digits, period: CONFIG.mfa.period, issuer: CONFIG.mfa.issuer, account: CONFIG.mfa.account, secret: CONFIG.mfa.secret }
    },
    hasCrypto,
    sanitizeText,
    stripTags,
    safeHref,
    safeImage,
    validateCredentials,
    validateProduct,
    validateContact,
    hashPassword,
    currentTotp,
    verifyTotp,
    getLockState,
    clearAttempts,
    loginStep1,
    verifyMfa,
    cancelMfa,
    isMfaPending,
    isAuthenticated,
    sessionInfo,
    logout,
    log,
    getLogs,
    describeProtection
  };
})(window);
