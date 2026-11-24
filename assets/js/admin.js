/* Moco Admin — dashboard logic with prototype security controls */
(function () {
  'use strict';

  const S = window.MocoStore;
  const SEC = window.MocoSecurity;
  if (!S || !SEC) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STATUS_CLASS = {
    'Menunggu Konfirmasi': 'warn',
    'Diproses': 'info',
    'Selesai': 'ok',
    'Dibatalkan': 'danger'
  };

  const TITLES = {
    dashboard: ['Ringkasan Toko', 'Pantau performa dan pesanan Moco.'],
    produk: ['Manajemen Produk', 'Atur menu, harga, foto, dan ketersediaan.'],
    pesanan: ['Manajemen Pesanan', 'Lihat dan perbarui status pesanan pelanggan.'],
    kontak: ['Informasi Kontak', 'Perbarui kanal WhatsApp dan Instagram.'],
    keamanan: ['Keamanan & Data', 'Status kontrol, log aktivitas, dan backup.']
  };

  const LOG_LABELS = {
    'login.success': 'Login berhasil',
    'login.failure': 'Login gagal',
    'login.step1': 'Password terverifikasi',
    'login.locked': 'Akun dikunci',
    'mfa.failure': 'Verifikasi MFA gagal',
    'logout': 'Logout',
    'session.expired': 'Sesi berakhir',
    'product.create': 'Produk ditambahkan',
    'product.update': 'Produk diperbarui',
    'product.status': 'Status produk diubah',
    'product.delete': 'Produk dihapus',
    'order.status': 'Status pesanan diubah',
    'contact.update': 'Kontak diperbarui',
    'backup.export': 'Backup diunduh',
    'backup.import': 'Backup dipulihkan',
    'data.reset': 'Data demo direset'
  };

  const els = {
    loginView: $('#loginView'),
    app: $('#adminApp'),
    loginForm: $('#loginForm'),
    loginUser: $('#loginUser'),
    loginPass: $('#loginPass'),
    loginSubmit: $('#loginSubmit'),
    loginError: $('#loginError'),
    loginErrorText: $('#loginErrorText'),
    lockBanner: $('#lockBanner'),
    lockText: $('#lockText'),
    mfaForm: $('#mfaForm'),
    mfaCode: $('#mfaCode'),
    mfaSubmit: $('#mfaSubmit'),
    mfaUser: $('#mfaUser'),
    mfaBack: $('#mfaBack'),
    mfaDemo: $('#mfaDemo'),
    demoCode: $('#demoCode'),
    demoTimer: $('#demoTimer'),
    logout: $('#logoutBtn'),
    sidebar: $('#sidebar'),
    sideToggle: $('#sideToggle'),
    sideOverlay: $('#sideOverlay'),
    pageTitle: $('#pageTitle'),
    pageSubtitle: $('#pageSubtitle'),
    statGrid: $('#statGrid'),
    recentOrders: $('#recentOrders'),
    productSummary: $('#productSummary'),
    recentActivity: $('#recentActivity'),
    productsBody: $('#productsBody'),
    productSearch: $('#productSearch'),
    ordersBody: $('#ordersBody'),
    orderSearch: $('#orderSearch'),
    orderFilters: $('#orderFilters'),
    productModal: $('#productModal'),
    productForm: $('#productForm'),
    productModalTitle: $('#productModalTitle'),
    pfId: $('#pfId'),
    pfName: $('#pfName'),
    pfPrice: $('#pfPrice'),
    pfDesc: $('#pfDesc'),
    pfImage: $('#pfImage'),
    pfUpload: $('#pfUpload'),
    pfTag: $('#pfTag'),
    pfAvailable: $('#pfAvailable'),
    pfFeatured: $('#pfFeatured'),
    pfPreview: $('#pfPreview'),
    pfPreviewWrap: $('#pfPreviewWrap'),
    addProduct: $('#addProductBtn'),
    contactForm: $('#contactForm'),
    cfWaDisplay: $('#cfWaDisplay'),
    cfWaNumber: $('#cfWaNumber'),
    cfWaLink: $('#cfWaLink'),
    cfIgUsername: $('#cfIgUsername'),
    cfIgLink: $('#cfIgLink'),
    securityStatus: $('#securityStatus'),
    activityLog: $('#activityLog'),
    backupBtn: $('#backupBtn'),
    restoreInput: $('#restoreInput'),
    exportLogBtn: $('#exportLogBtn'),
    resetDataBtn: $('#resetDataBtn'),
    confirmModal: $('#confirmModal'),
    confirmTitle: $('#confirmTitle'),
    confirmText: $('#confirmText'),
    confirmOk: $('#confirmOk'),
    confirmCancel: $('#confirmCancel'),
    toastStack: $('#toastStack')
  };

  let currentView = 'dashboard';
  let orderFilter = 'all';
  let draftImage = '';
  let pendingConfirm = null;
  let lastFocused = null;
  let demoInterval = null;
  let lockInterval = null;
  let sessionInterval = null;

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const badge = (status) => `<span class="badge ${STATUS_CLASS[status] || 'neutral'}">${escapeHtml(status)}</span>`;

  /* ================= Login UI ================= */
  function setError(message) {
    if (!message) {
      els.loginError.classList.remove('show');
      return;
    }
    els.loginErrorText.textContent = message;
    els.loginError.classList.add('show');
  }

  function stopIntervals() {
    if (demoInterval) clearInterval(demoInterval);
    if (lockInterval) clearInterval(lockInterval);
    demoInterval = null;
    lockInterval = null;
  }

  function showStepOne(message) {
    els.loginForm.hidden = false;
    els.mfaForm.hidden = true;
    els.mfaCode.value = '';
    SEC.cancelMfa();
    stopIntervals();
    setError(message || '');
    setTimeout(() => els.loginUser.focus({ preventScroll: true }), 60);
  }

  function showStepTwo() {
    els.loginForm.hidden = true;
    els.mfaForm.hidden = false;
    els.mfaUser.textContent = SEC.CONFIG.username;
    setError('');
    els.mfaCode.value = '';
    setTimeout(() => els.mfaCode.focus({ preventScroll: true }), 60);
    startDemoTimer();
  }

  async function refreshDemoCode() {
    if (!els.demoCode) return;
    try {
      const result = await SEC.currentTotp();
      if (!result) {
        els.demoCode.textContent = 'n/a';
        els.demoTimer.textContent = 'Web Crypto tidak tersedia';
        return;
      }
      els.demoCode.textContent = result.code.replace(/(\d{3})(\d{3})/, '$1 $2');
      els.demoTimer.textContent = `berlaku ${result.secondsLeft}s`;
    } catch (err) {
      els.demoCode.textContent = 'n/a';
    }
  }

  function startDemoTimer() {
    if (demoInterval) clearInterval(demoInterval);
    refreshDemoCode();
    demoInterval = setInterval(refreshDemoCode, 1000);
  }

  function renderLockState() {
    const lock = SEC.getLockState();
    if (!lock.locked) {
      els.lockBanner.hidden = true;
      if (lockInterval) clearInterval(lockInterval);
      lockInterval = null;
      els.loginSubmit.disabled = false;
      els.mfaSubmit.disabled = false;
      return lock;
    }

    els.lockBanner.hidden = false;
    els.loginSubmit.disabled = true;
    els.mfaSubmit.disabled = true;
    const update = () => {
      const state = SEC.getLockState();
      if (!state.locked) {
        els.lockBanner.hidden = true;
        els.loginSubmit.disabled = false;
        els.mfaSubmit.disabled = false;
        if (lockInterval) clearInterval(lockInterval);
        lockInterval = null;
        return;
      }
      els.lockText.textContent = `Coba lagi dalam ${Math.ceil(state.remainingMs / 1000)} detik.`;
      els.loginUser.disabled = true;
      els.loginPass.disabled = true;
    };
    update();
    els.loginUser.disabled = true;
    els.loginPass.disabled = true;
    if (lockInterval) clearInterval(lockInterval);
    lockInterval = setInterval(() => {
      const state = SEC.getLockState();
      update();
      if (!state.locked) {
        els.loginUser.disabled = false;
        els.loginPass.disabled = false;
        clearInterval(lockInterval);
        lockInterval = null;
      }
    }, 1000);
    return lock;
  }

  function showLogin(message) {
    els.app.hidden = true;
    els.loginView.hidden = false;
    els.loginForm.hidden = false;
    els.mfaForm.hidden = true;
    els.loginPass.value = '';
    els.mfaCode.value = '';
    SEC.cancelMfa();
    stopIntervals();
    setError(message || '');
    const lock = renderLockState();
    if (lock.locked) {
      setError(`Akun dikunci sementara karena percobaan login gagal. Tunggu ${Math.ceil(lock.remainingMs / 1000)} detik.`);
    }
    setTimeout(() => {
      if (!SEC.getLockState().locked) els.loginUser.focus({ preventScroll: true });
    }, 80);
  }

  function enterApp() {
    els.loginView.hidden = true;
    els.app.hidden = false;
    els.loginError.classList.remove('show');
    stopIntervals();
    route();
  }

  function bindLogin() {
    els.loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const lock = SEC.getLockState();
      if (lock.locked) {
        renderLockState();
        setError('Akun sedang dikunci sementara. Coba lagi setelah hitungan selesai.');
        return;
      }

      const username = els.loginUser.value.trim();
      const password = els.loginPass.value;

      const validation = SEC.validateCredentials(username, password);
      if (!validation.ok) {
        setError(validation.errors.username || validation.errors.password);
        return;
      }

      els.loginSubmit.disabled = true;
      els.loginSubmit.textContent = 'Memeriksa…';
      try {
        const result = await SEC.loginStep1(username, password);
        if (result.ok) {
          setError('');
          els.loginPass.value = '';
          showStepTwo();
        } else {
          setError(result.message || 'Login gagal.');
          els.loginPass.value = '';
          if (result.lock) renderLockState();
        }
      } catch (err) {
        setError('Verifikasi tidak dapat dijalankan. Pastikan situs dibuka lewat HTTPS.');
      } finally {
        els.loginSubmit.disabled = SEC.getLockState().locked;
        els.loginSubmit.textContent = 'Lanjut ke verifikasi';
      }
    });

    els.mfaForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const code = els.mfaCode.value.replace(/\D/g, '');
      if (code.length !== 6) {
        setError('Kode verifikasi harus 6 angka.');
        els.mfaCode.focus();
        return;
      }

      els.mfaSubmit.disabled = true;
      els.mfaSubmit.textContent = 'Memverifikasi…';
      try {
        const result = await SEC.verifyMfa(code);
        if (result.ok) {
          els.mfaCode.value = '';
          enterApp();
          toast('Login berhasil. Sesi aktif selama 30 menit.');
        } else {
          setError(result.message || 'Kode verifikasi salah.');
          els.mfaCode.value = '';
          if (result.reason === 'expired') showStepOne('Sesi verifikasi kedaluwarsa. Masukkan password kembali.');
          if (result.lock) renderLockState();
          if (result.lock && result.lock.locked) {
            els.loginForm.hidden = false;
            els.mfaForm.hidden = true;
            els.loginUser.disabled = true;
            els.loginPass.disabled = true;
          }
        }
      } catch (err) {
        setError('Verifikasi MFA gagal dijalankan di browser ini.');
      } finally {
        els.mfaSubmit.disabled = SEC.getLockState().locked;
        els.mfaSubmit.textContent = 'Verifikasi & masuk';
      }
    });

    els.mfaBack.addEventListener('click', () => {
      showStepOne('Verifikasi dibatalkan.');
      els.loginPass.focus();
    });

    els.mfaDemo.addEventListener('toggle', () => {
      if (els.mfaDemo.open) refreshDemoCode();
    });

    els.logout.addEventListener('click', () => {
      SEC.logout('Admin logout dari dashboard.');
      closeSidebar();
      if (location.hash) history.replaceState(null, '', location.pathname);
      showLogin('Kamu telah logout.');
    });
  }

  function startSessionWatch() {
    if (sessionInterval) clearInterval(sessionInterval);
    sessionInterval = setInterval(() => {
      if (els.app.hidden) return;
      if (!SEC.isAuthenticated()) {
        showLogin('Sesi admin berakhir. Silakan login kembali.');
        toast('Sesi berakhir. Silakan login kembali.');
        return;
      }
      if (currentView === 'keamanan') renderSecurity();
    }, 30000);
  }

  /* ================= Routing / access control ================= */
  function route() {
    if (!SEC.isAuthenticated()) {
      showLogin('Silakan login untuk membuka dashboard.');
      return;
    }

    let view = location.hash.replace('#', '') || 'dashboard';
    if (!TITLES[view]) view = 'dashboard';
    currentView = view;

    $$('.view').forEach((section) => {
      section.hidden = section.dataset.view !== view;
    });
    $$('.side-nav a').forEach((link) => {
      link.classList.toggle('active', link.dataset.nav === view);
    });

    els.pageTitle.textContent = TITLES[view][0];
    els.pageSubtitle.textContent = TITLES[view][1];
    const tableHint = document.getElementById('tableHint');
    if (tableHint) tableHint.hidden = !['dashboard', 'produk', 'pesanan'].includes(view);

    if (view === 'dashboard') renderDashboard();
    if (view === 'produk') renderProducts();
    if (view === 'pesanan') renderOrders();
    if (view === 'kontak') renderContactForm();
    if (view === 'keamanan') renderSecurity();

    closeSidebar();
    window.scrollTo({ top: 0 });
  }

  /* ================= Sidebar ================= */
  function openSidebar() {
    els.sidebar.classList.add('open');
    els.sideOverlay.classList.add('show');
  }

  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sideOverlay.classList.remove('show');
  }

  function bindSidebar() {
    els.sideToggle.addEventListener('click', openSidebar);
    els.sideOverlay.addEventListener('click', closeSidebar);
    $$('.side-nav a').forEach((link) => link.addEventListener('click', closeSidebar));
  }

  /* ================= Activity ================= */
  function actionLabel(action) {
    return LOG_LABELS[action] || action;
  }

  function renderActivityList(target, limit) {
    if (!target) return;
    const logs = SEC.getLogs(limit);
    if (!logs.length) {
      target.innerHTML = '<li class="log-empty">Belum ada aktivitas tercatat.</li>';
      return;
    }
    target.innerHTML = logs.map((entry) => `
      <li>
        <span class="log-dot" aria-hidden="true"></span>
        <div class="log-body">
          <b>${escapeHtml(actionLabel(entry.action))}</b>
          <span>${escapeHtml(entry.detail || '')}</span>
        </div>
        <time datetime="${escapeHtml(entry.at)}">${escapeHtml(S.formatDate(entry.at))}</time>
      </li>`).join('');
  }

  /* ================= Dashboard ================= */
  function renderDashboard() {
    const stats = S.getStats();
    els.statGrid.innerHTML = `
      <div class="stat-card">
        <span class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z"/><path d="M3 12l9 4.5 9-4.5"/></svg>
        </span>
        <div class="stat-label">Total Produk</div>
        <div class="stat-value">${stats.products}</div>
        <div class="stat-sub">${stats.available} tersedia</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12l1 18H5L6 3Z"/><path d="M9 8h6M9 12h6"/></svg>
        </span>
        <div class="stat-label">Total Pesanan</div>
        <div class="stat-value">${stats.orders}</div>
        <div class="stat-sub">${stats.pending} menunggu konfirmasi</div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7 9 18l-5-5"/></svg>
        </span>
        <div class="stat-label">Item Terjual</div>
        <div class="stat-value">${stats.itemsSold}</div>
        <div class="stat-sub">dari pesanan aktif</div>
      </div>
      <div class="stat-card accent">
        <span class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 9.5h8M8 14h5"/></svg>
        </span>
        <div class="stat-label">Nilai Pesanan</div>
        <div class="stat-value stat-money">${S.formatRupiah(stats.revenue)}</div>
        <div class="stat-sub">tanpa pesanan dibatalkan</div>
      </div>`;

    const orders = S.getOrders().slice(0, 5);
    els.recentOrders.innerHTML = orders.length
      ? orders.map((order) => `
        <tr>
          <td class="mono">${escapeHtml(order.id)}</td>
          <td class="muted">${escapeHtml(S.formatDate(order.date))}</td>
          <td class="num">${S.formatRupiah(order.total)}</td>
          <td>${badge(order.status)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="table-empty">Belum ada pesanan masuk.</td></tr>';

    const products = S.getProducts();
    els.productSummary.innerHTML = products.length
      ? products.map((product) => `
        <tr>
          <td>
            <div class="product-cell">
              <img src="${escapeHtml(SEC.safeImage(product.image) || 'assets/img/vanilla.jpg')}" alt="" width="44" height="44" loading="lazy">
              <div><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.tag || 'Moco')}</small></div>
            </div>
          </td>
          <td class="num">${S.formatRupiah(product.price)}</td>
          <td>${product.available === false ? '<span class="badge danger">Tidak Tersedia</span>' : '<span class="badge ok">Tersedia</span>'}</td>
        </tr>`).join('')
      : '<tr><td colspan="3" class="table-empty">Belum ada produk.</td></tr>';

    renderActivityList(els.recentActivity, 6);
  }

  /* ================= Fields & validation ================= */
  function clearFieldErrors(scope) {
    $$('.field.invalid', scope).forEach((field) => field.classList.remove('invalid'));
    $$('.field-error', scope).forEach((node) => node.remove());
  }

  function showFieldErrors(scope, errors, map) {
    clearFieldErrors(scope);
    let first = null;
    Object.entries(errors).forEach(([key, message]) => {
      const input = scope.querySelector(map[key] || '#' + key);
      if (!input) return;
      const field = input.closest('.field');
      if (field) {
        field.classList.add('invalid');
        const note = document.createElement('small');
        note.className = 'field-error';
        note.textContent = message;
        field.appendChild(note);
      }
      if (!first) first = input;
    });
    if (first) first.focus();
    return Object.keys(errors).length === 0;
  }

  /* ================= Products ================= */
  function renderProducts() {
    const query = (els.productSearch.value || '').trim().toLowerCase();
    const products = S.getProducts().filter((product) => {
      if (!query) return true;
      return product.name.toLowerCase().includes(query) ||
        String(product.tag || '').toLowerCase().includes(query) ||
        String(product.desc || '').toLowerCase().includes(query);
    });

    els.productsBody.innerHTML = products.length
      ? products.map((product) => {
        const available = product.available !== false;
        const image = SEC.safeImage(product.image) || 'assets/img/vanilla.jpg';
        return `
          <tr>
            <td>
              <div class="product-cell">
                <img src="${escapeHtml(image)}" alt="" width="44" height="44" loading="lazy">
                <div>
                  <b>${escapeHtml(product.name)}</b>
                  <small>${escapeHtml(product.desc)}</small>
                </div>
              </div>
            </td>
            <td class="num">${S.formatRupiah(product.price)}<span class="cell-sub">per pcs</span></td>
            <td>${product.featured ? '<span class="badge warn">Unggulan</span>' : `<span class="badge neutral">${escapeHtml(product.tag || 'Reguler')}</span>`}</td>
            <td>
              <label class="toggle">
                <input type="checkbox" data-toggle-available="${escapeHtml(product.id)}" ${available ? 'checked' : ''} aria-label="Ketersediaan ${escapeHtml(product.name)}">
                <span class="toggle-track"></span>
                ${available ? 'Tersedia' : 'Tidak tersedia'}
              </label>
            </td>
            <td>
              <div class="row-actions">
                <button class="mini-btn" type="button" data-edit-product="${escapeHtml(product.id)}" aria-label="Edit ${escapeHtml(product.name)}" title="Edit">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="mini-btn danger" type="button" data-delete-product="${escapeHtml(product.id)}" aria-label="Hapus ${escapeHtml(product.name)}" title="Hapus">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>
                </button>
              </div>
            </td>
          </tr>`;
      }).join('')
      : '<tr><td colspan="5" class="table-empty">Tidak ada produk yang cocok.</td></tr>';
  }

  function setPreview(src) {
    draftImage = src || '';
    if (src) {
      els.pfPreview.src = src;
      els.pfPreviewWrap.classList.add('has-image');
    } else {
      els.pfPreview.removeAttribute('src');
      els.pfPreviewWrap.classList.remove('has-image');
    }
  }

  function openProductModal(id) {
    lastFocused = document.activeElement;
    const editing = id ? S.getProduct(id) : null;

    els.productForm.reset();
    clearFieldErrors(els.productForm);
    els.productModalTitle.textContent = editing ? 'Edit Produk' : 'Tambah Produk';
    els.pfId.value = editing ? editing.id : '';
    els.pfName.value = editing ? editing.name : '';
    els.pfPrice.value = editing ? editing.price : 10000;
    els.pfDesc.value = editing ? editing.desc : '';
    els.pfTag.value = editing ? (editing.tag || '') : '';
    els.pfAvailable.checked = editing ? editing.available !== false : true;
    els.pfFeatured.checked = editing ? Boolean(editing.featured) : false;

    const image = editing ? editing.image : '';
    setPreview(image);
    els.pfImage.value = image && !image.startsWith('data:') ? image : '';

    els.productModal.classList.add('show');
    els.productModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => els.pfName.focus({ preventScroll: true }), 90);
  }

  function closeProductModal() {
    els.productModal.classList.remove('show');
    els.productModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus({ preventScroll: true });
  }

  function slugify(value) {
    const base = String(value || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'produk';
  }

  function uniqueProductId(name, ignoreId) {
    const products = S.getProducts();
    const base = slugify(name);
    let id = base;
    let index = 2;
    while (products.some((product) => product.id === id && product.id !== ignoreId)) {
      id = `${base}-${index}`;
      index += 1;
    }
    return id;
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File tidak bisa dibaca.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Gambar tidak valid.'));
        image.onload = () => {
          const max = 900;
          const ratio = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * ratio);
          canvas.height = Math.round(image.height * ratio);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function bindProductForm() {
    els.addProduct?.addEventListener('click', () => openProductModal(null));
    els.productSearch?.addEventListener('input', renderProducts);

    els.pfImage?.addEventListener('input', () => {
      const value = els.pfImage.value.trim();
      if (value) setPreview(value);
      else setPreview('');
    });

    els.pfUpload?.addEventListener('change', async () => {
      const file = els.pfUpload.files && els.pfUpload.files[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        toast('Format gambar harus JPG, PNG, atau WebP.');
        els.pfUpload.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast('Ukuran gambar maksimal 5 MB.');
        els.pfUpload.value = '';
        return;
      }
      try {
        const dataUrl = await resizeImage(file);
        setPreview(dataUrl);
        els.pfImage.value = '';
        toast('Gambar siap disimpan.');
      } catch (err) {
        toast('Gagal memuat gambar. Coba file lain.');
      }
    });

    els.productForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      clearFieldErrors(els.productForm);

      const id = els.pfId.value;
      const existing = id ? S.getProduct(id) : null;
      const checked = SEC.validateProduct({
        id: existing ? existing.id : '',
        name: els.pfName.value,
        price: els.pfPrice.value,
        desc: els.pfDesc.value,
        tag: els.pfTag.value,
        image: draftImage,
        featured: els.pfFeatured.checked,
        available: els.pfAvailable.checked
      });

      if (!checked.ok) {
        showFieldErrors(els.productForm, checked.errors, {
          name: '#pfName', price: '#pfPrice', desc: '#pfDesc', image: '#pfImage', tag: '#pfTag'
        });
        toast('Periksa kembali data produk.');
        return;
      }

      const value = checked.value;
      const image = value.image || (existing ? existing.image : (S.getProducts()[0] || {}).image) || 'assets/img/vanilla.jpg';

      const product = {
        id: existing ? existing.id : uniqueProductId(value.name),
        name: value.name,
        price: value.price,
        desc: value.desc,
        image,
        tag: value.tag,
        featured: value.featured,
        available: value.available
      };

      S.upsertProduct(product);
      SEC.log(existing ? 'product.update' : 'product.create', `${product.name} (${S.formatRupiah(product.price)}).`);
      closeProductModal();
      renderProducts();
      toast(existing ? `${product.name} berhasil diperbarui.` : `${product.name} ditambahkan ke menu.`);
      if (currentView === 'dashboard') renderDashboard();
    });
  }

  function bindProductTable() {
    els.productsBody.addEventListener('change', (event) => {
      const toggle = event.target.closest('[data-toggle-available]');
      if (!toggle) return;
      const product = S.getProduct(toggle.dataset.toggleAvailable);
      if (!product) return;
      product.available = toggle.checked;
      S.upsertProduct(product);
      SEC.log('product.status', `${product.name} → ${product.available ? 'Tersedia' : 'Tidak tersedia'}.`);
      renderProducts();
      toast(`${product.name} ${product.available ? 'tersedia' : 'ditandai tidak tersedia'}.`);
      if (currentView === 'dashboard') renderDashboard();
    });

    els.productsBody.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-product]');
      if (edit) {
        openProductModal(edit.dataset.editProduct);
        return;
      }

      const remove = event.target.closest('[data-delete-product]');
      if (remove) {
        const product = S.getProduct(remove.dataset.deleteProduct);
        if (!product) return;
        openConfirm({
          title: 'Hapus produk?',
          text: `“${product.name}” akan dihapus dari menu pelanggan.`,
          confirmLabel: 'Hapus Produk',
          onConfirm: () => {
            S.deleteProduct(product.id);
            SEC.log('product.delete', `${product.name} dihapus.`);
            renderProducts();
            toast(`${product.name} dihapus.`);
            if (currentView === 'dashboard') renderDashboard();
          }
        });
      }
    });

    $$('[data-close-product]').forEach((button) => button.addEventListener('click', closeProductModal));
    els.productModal?.addEventListener('click', (event) => {
      if (event.target === els.productModal) closeProductModal();
    });
  }

  /* ================= Orders ================= */
  function matchesOrder(order, query) {
    if (!query) return true;
    const haystack = [
      order.id,
      order.status,
      S.formatDate(order.date),
      ...(order.items || []).map((item) => item.name)
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function renderOrders() {
    const query = (els.orderSearch.value || '').trim().toLowerCase();
    const orders = S.getOrders().filter((order) => {
      if (orderFilter !== 'all' && order.status !== orderFilter) return false;
      return matchesOrder(order, query);
    });

    els.ordersBody.innerHTML = orders.length
      ? orders.map((order) => {
        const qty = S.orderItemCount(order);
        const items = (order.items || []).map((item) =>
          `<span><b>${escapeHtml(item.name)}</b> &times; ${item.qty}</span>`).join('');
        const options = S.STATUS.map((status) =>
          `<option value="${status}" ${status === order.status ? 'selected' : ''}>${status}</option>`).join('');
        return `
          <tr>
            <td class="mono">${escapeHtml(order.id)}<span class="cell-sub">${escapeHtml(order.source || 'Website')}</span></td>
            <td class="muted">${escapeHtml(S.formatDate(order.date))}</td>
            <td><div class="order-products">${items || '<span>-</span>'}</div></td>
            <td class="num">${qty}</td>
            <td class="num">${S.formatRupiah(order.total)}</td>
            <td>
              <select class="status-select" data-order-status="${escapeHtml(order.id)}" aria-label="Status pesanan ${escapeHtml(order.id)}">
                ${options}
              </select>
            </td>
          </tr>`;
      }).join('')
      : '<tr><td colspan="6" class="table-empty">Belum ada pesanan yang cocok.</td></tr>';
  }

  function bindOrders() {
    els.orderSearch?.addEventListener('input', renderOrders);

    els.orderFilters?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-status]');
      if (!button) return;
      orderFilter = button.dataset.status;
      $$('.filter-btn', els.orderFilters).forEach((item) => item.classList.toggle('active', item === button));
      renderOrders();
    });

    els.ordersBody.addEventListener('change', (event) => {
      const select = event.target.closest('[data-order-status]');
      if (!select) return;
      if (!S.STATUS.includes(select.value)) {
        renderOrders();
        return;
      }
      if (S.updateOrderStatus(select.dataset.orderStatus, select.value)) {
        SEC.log('order.status', `${select.dataset.orderStatus} → ${select.value}.`);
        toast(`Status pesanan ${select.dataset.orderStatus} diperbarui.`);
        if (currentView === 'dashboard') renderDashboard();
      }
    });
  }

  /* ================= Contact ================= */
  function fillContactPreview() {
    const wa = els.cfWaDisplay.value.trim() || els.cfWaNumber.value.trim();
    const ig = els.cfIgUsername.value.trim();
    $('#previewWa').textContent = wa || '—';
    $('#previewIg').textContent = ig ? (ig.startsWith('@') ? ig : `@${ig}`) : '—';
  }

  function renderContactForm() {
    const contact = S.getContact();
    els.cfWaDisplay.value = contact.waDisplay || '';
    els.cfWaNumber.value = contact.waNumber || '';
    els.cfWaLink.value = contact.waLink || '';
    els.cfIgUsername.value = contact.igUsername || '';
    els.cfIgLink.value = contact.igLink || '';
    clearFieldErrors(els.contactForm);
    fillContactPreview();
  }

  function bindContact() {
    els.contactForm?.addEventListener('input', fillContactPreview);

    els.contactForm?.addEventListener('reset', () => {
      setTimeout(() => {
        renderContactForm();
        toast('Form dikembalikan ke data tersimpan.');
      }, 0);
    });

    els.contactForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      clearFieldErrors(els.contactForm);

      const checked = SEC.validateContact({
        waDisplay: els.cfWaDisplay.value,
        waNumber: els.cfWaNumber.value,
        waLink: els.cfWaLink.value,
        igUsername: els.cfIgUsername.value,
        igLink: els.cfIgLink.value
      });

      if (!checked.ok) {
        showFieldErrors(els.contactForm, checked.errors, {
          waDisplay: '#cfWaDisplay', waNumber: '#cfWaNumber', waLink: '#cfWaLink',
          igUsername: '#cfIgUsername', igLink: '#cfIgLink'
        });
        toast('Periksa kembali informasi kontak.');
        return;
      }

      S.saveContact(checked.value);
      SEC.log('contact.update', `WhatsApp ${checked.value.waDisplay}, Instagram @${checked.value.igUsername}.`);
      renderContactForm();
      toast('Informasi kontak berhasil disimpan.');
    });
  }

  /* ================= Security & backup ================= */
  function renderSecurity() {
    const protection = SEC.describeProtection();
    const session = SEC.sessionInfo();
    const lock = SEC.getLockState();
    const minutes = Math.ceil(session.remainingMs / 60000);

    els.securityStatus.innerHTML = `
      <ul class="security-list">
        <li><span class="sec-check">✓</span><div><b>Password ter-hash</b><span>${escapeHtml(protection.hashing)}</span></div><span class="badge ok">Aktif</span></li>
        <li><span class="sec-check">✓</span><div><b>Verifikasi dua langkah</b><span>${escapeHtml(protection.mfa)}</span></div><span class="badge ok">Aktif</span></li>
        <li><span class="sec-check">✓</span><div><b>Batas percobaan login</b><span>${escapeHtml(protection.lockout)} · sisa ${lock.attempts}/${lock.maxAttempts}</span></div><span class="badge ok">Aktif</span></li>
        <li><span class="sec-check">✓</span><div><b>Sesi admin</b><span>${session.authenticated ? `Aktif · sisa ${minutes} menit` : 'Tidak aktif'}</span></div><span class="badge ok">Aktif</span></li>
        <li><span class="sec-check">✓</span><div><b>Validasi &amp; escaping</b><span>Input divalidasi; output di-escape sebelum dirender.</span></div><span class="badge ok">Aktif</span></li>
        <li><span class="sec-check">✓</span><div><b>Log aktivitas</b><span>${escapeHtml(protection.log)}</span></div><span class="badge ok">Lokal</span></li>
        <li><span class="sec-warn">!</span><div><b>Pemeriksaan akses backend</b><span>Belum ada backend; kontrol masih dapat dilewati lewat DevTools.</span></div><span class="badge danger">Perlu backend</span></li>
        <li><span class="sec-warn">!</span><div><b>HTTPS produksi</b><span>Preview memakai HTTPS; produksi wajib TLS/HSTS di server.</span></div><span class="badge warn">Konfigurasi host</span></li>
      </ul>
      <p class="security-env">${escapeHtml(protection.environment)}</p>`;

    renderActivityList(els.activityLog, 100);
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function backupFilename() {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    return `moco-backup-${stamp}.json`;
  }

  function bindSecurity() {
    els.backupBtn?.addEventListener('click', () => {
      const payload = S.exportData();
      downloadFile(backupFilename(), JSON.stringify(payload, null, 2));
      SEC.log('backup.export', `${payload.data.products.length} produk, ${payload.data.orders.length} pesanan.`);
      if (currentView === 'dashboard') renderDashboard();
      toast('Backup berhasil diunduh.');
    });

    els.exportLogBtn?.addEventListener('click', () => {
      downloadFile(`moco-activity-log-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({
        app: 'moco',
        exportedAt: new Date().toISOString(),
        retentionDays: SEC.CONFIG.limits.logDays,
        entries: SEC.getLogs(300)
      }, null, 2));
      toast('Log aktivitas diunduh.');
    });

    els.restoreInput?.addEventListener('change', () => {
      const file = els.restoreInput.files && els.restoreInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast('File backup maksimal 2 MB.');
        els.restoreInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => toast('File tidak dapat dibaca.');
      reader.onload = () => {
        let payload;
        try {
          payload = JSON.parse(String(reader.result || ''));
        } catch (err) {
          toast('File backup bukan JSON yang valid.');
          els.restoreInput.value = '';
          return;
        }
        if (!payload || payload.app !== 'moco' || !payload.data) {
          toast('File bukan backup Moco.');
          els.restoreInput.value = '';
          return;
        }
        const productCount = Array.isArray(payload.data.products) ? payload.data.products.length : 0;
        const orderCount = Array.isArray(payload.data.orders) ? payload.data.orders.length : 0;
        openConfirm({
          title: 'Pulihkan backup?',
          text: `Data saat ini akan diganti dengan ${productCount} produk dan ${orderCount} pesanan dari file backup.`,
          confirmLabel: 'Pulihkan',
          onConfirm: () => {
            const result = S.importData(payload);
            if (!result.ok) {
              toast(result.message || 'Backup gagal dipulihkan.');
              return;
            }
            SEC.log('backup.import', `${result.products} produk, ${result.orders} pesanan dipulihkan.`);
            renderProducts();
            renderOrders();
            renderContactForm();
            renderSecurity();
            toast('Backup berhasil dipulihkan.');
          }
        });
        els.restoreInput.value = '';
      };
      reader.readAsText(file);
    });

    els.resetDataBtn?.addEventListener('click', () => {
      openConfirm({
        title: 'Reset seluruh data demo?',
        text: 'Produk, pesanan, kontak, keranjang, dan log akan dihapus dari browser ini.',
        confirmLabel: 'Reset Data',
        onConfirm: () => {
          S.resetDemoData();
          try { localStorage.removeItem(SEC.KEYS.log); } catch (err) { /* abaikan */ }
          SEC.clearAttempts();
          SEC.log('data.reset', 'Seluruh data demo dihapus dari browser.');
          renderProducts();
          renderOrders();
          renderContactForm();
          renderSecurity();
          toast('Data demo telah direset.');
        }
      });
    });
  }

  /* ================= Confirm dialog ================= */
  function openConfirm(options) {
    pendingConfirm = options.onConfirm;
    els.confirmTitle.textContent = options.title || 'Konfirmasi';
    els.confirmText.textContent = options.text || '';
    els.confirmOk.textContent = options.confirmLabel || 'Hapus';
    els.confirmModal.classList.add('show');
    els.confirmModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => els.confirmCancel.focus({ preventScroll: true }), 80);
  }

  function closeConfirm() {
    els.confirmModal.classList.remove('show');
    els.confirmModal.setAttribute('aria-hidden', 'true');
    if (!els.productModal.classList.contains('show')) document.body.style.overflow = '';
    pendingConfirm = null;
  }

  function bindConfirm() {
    els.confirmCancel.addEventListener('click', closeConfirm);
    els.confirmOk.addEventListener('click', () => {
      const action = pendingConfirm;
      closeConfirm();
      if (typeof action === 'function') action();
    });
    els.confirmModal.addEventListener('click', (event) => {
      if (event.target === els.confirmModal) closeConfirm();
    });
  }

  /* ================= Toast ================= */
  function toast(message) {
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg><span>${escapeHtml(message)}</span>`;
    els.toastStack.appendChild(item);
    const all = $$('.toast', els.toastStack);
    if (all.length > 3) all[0].remove();
    setTimeout(() => {
      item.classList.add('out');
      setTimeout(() => item.remove(), 240);
    }, 2800);
  }

  /* ================= Init ================= */
  function bindGlobal() {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (els.confirmModal.classList.contains('show')) closeConfirm();
      else if (els.productModal.classList.contains('show')) closeProductModal();
      else closeSidebar();
    });

    window.addEventListener('hashchange', route);

    window.addEventListener('storage', (event) => {
      if (!SEC.isAuthenticated() || !event.key) return;
      if (event.key === S.KEYS.products || event.key === S.KEYS.orders || event.key === S.KEYS.contact) {
        route();
      }
      if (event.key === SEC.KEYS.log && currentView === 'keamanan') renderSecurity();
    });
  }

  bindLogin();
  bindSidebar();
  bindProductForm();
  bindProductTable();
  bindOrders();
  bindContact();
  bindSecurity();
  bindConfirm();
  bindGlobal();
  startSessionWatch();

  if (SEC.isAuthenticated()) enterApp();
  else showLogin();
})();
