/* Moco — customer interactions: menu, product detail, cart, WhatsApp checkout. */
(function () {
  'use strict';

  const S = window.MocoStore;
  if (!S) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const els = {
    grid: $('#productGrid'),
    count: $('#cartCount'),
    drawer: $('#cartDrawer'),
    overlay: $('#overlay'),
    cartItems: $('#cartItems'),
    cartFoot: $('#cartFoot'),
    cartSummary: $('#cartSummary'),
    cartSubtotal: $('#cartSubtotal'),
    cartQty: $('#cartQty'),
    cartTotal: $('#cartTotal'),
    checkout: $('#checkoutBtn'),
    modal: $('#productModal'),
    detailImage: $('#detailImage'),
    detailTag: $('#detailTag'),
    detailName: $('#detailName'),
    detailPrice: $('#detailPrice'),
    detailDesc: $('#detailDesc'),
    detailQty: $('#detailQty'),
    detailAdd: $('#detailAdd'),
    detailStock: $('#detailStock'),
    toastStack: $('#toastStack'),
    navLinks: $('#navLinks'),
    menuToggle: $('#menuToggle')
  };

  let activeProductId = null;
  let lastFocused = null;

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  /* ---------------- Menu ---------------- */
  function renderProducts() {
    const products = S.getProducts();
    if (!els.grid) return;

    if (!products.length) {
      els.grid.innerHTML = '<p class="cart-empty" style="grid-column:1/-1">Menu sedang diperbarui. Silakan kembali lagi nanti.</p>';
      return;
    }

    els.grid.innerHTML = products.map((product) => {
      const available = product.available !== false;
      const price = S.formatRupiah(product.price);
      const image = (window.MocoSecurity && window.MocoSecurity.safeImage(product.image)) || 'assets/img/vanilla.jpg';
      return `
        <article class="product-card ${available ? '' : 'unavailable'}">
          <div class="product-media" data-product="${escapeHtml(product.id)}" role="button" tabindex="0" aria-label="Lihat detail ${escapeHtml(product.name)}">
            <img src="${escapeHtml(image)}" alt="Mochi ${escapeHtml(product.name)}" width="640" height="536" loading="lazy">
            <span class="product-tag ${product.featured ? 'featured' : ''}">${escapeHtml(product.tag || 'Moco')}</span>
            ${available ? '' : '<div class="sold-out"><span>Tidak Tersedia</span></div>'}
          </div>
          <div class="product-info">
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.desc)}</p>
            <div class="product-bottom">
              <span class="price">${price} <small>/ pcs</small></span>
              <button class="add-btn" type="button" data-add="${escapeHtml(product.id)}" ${available ? '' : 'disabled aria-disabled="true"'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                Add
              </button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  /* ---------------- Detail ---------------- */
  function openDetail(id) {
    const product = S.getProduct(id);
    if (!product) return;
    activeProductId = id;

    els.detailImage.src = (window.MocoSecurity && window.MocoSecurity.safeImage(product.image)) || 'assets/img/vanilla.jpg';
    els.detailImage.alt = `Mochi ${product.name}`;
    els.detailTag.textContent = product.tag || 'Moco';
    els.detailName.textContent = product.name;
    els.detailPrice.textContent = S.formatRupiah(product.price);
    els.detailDesc.textContent = product.desc;
    els.detailQty.value = '1';

    const available = product.available !== false;
    els.detailAdd.disabled = !available;
    els.detailAdd.textContent = available ? 'Add to Cart' : 'Tidak Tersedia';
    els.detailStock.innerHTML = available
      ? '<span class="dot"></span> Tersedia — dibuat fresh setiap hari'
      : '<span class="dot off"></span> Sedang tidak tersedia';

    lastFocused = document.activeElement;
    els.modal.classList.add('show');
    els.modal.setAttribute('aria-hidden', 'false');
    lockScroll();
    setTimeout(() => els.detailAdd.focus({ preventScroll: true }), 80);
  }

  function closeDetail() {
    if (!els.modal.classList.contains('show')) return;
    els.modal.classList.remove('show');
    els.modal.setAttribute('aria-hidden', 'true');
    activeProductId = null;
    unlockScroll();
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
  }

  function clampQty(value) {
    const number = parseInt(value, 10);
    if (!Number.isFinite(number) || number < 1) return 1;
    return Math.min(number, 99);
  }

  /* ---------------- Cart ---------------- */
  function renderCart() {
    const items = S.getCartDetails();
    const count = items.reduce((sum, item) => sum + item.qty, 0);
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

    if (els.count) els.count.textContent = String(count);
    if (els.cartSummary) els.cartSummary.textContent = count ? `${count} pcs dipilih` : 'Keranjang masih kosong';
    if (els.cartSubtotal) els.cartSubtotal.textContent = S.formatRupiah(total);
    if (els.cartQty) els.cartQty.textContent = `${count} pcs`;
    if (els.cartTotal) els.cartTotal.textContent = S.formatRupiah(total);
    if (els.checkout) els.checkout.disabled = count === 0;

    if (!els.cartItems) return;

    if (!items.length) {
      els.cartItems.innerHTML = `
        <div class="cart-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M9.5 12.5h.01M14.5 12.5h.01"/></svg>
          <b>Keranjangmu masih kosong</b>
          Yuk pilih mochi favoritmu dulu.
        </div>`;
      if (els.cartFoot) els.cartFoot.style.display = 'none';
      return;
    }

    if (els.cartFoot) els.cartFoot.style.display = '';

    els.cartItems.innerHTML = items.map((item) => `
      <div class="cart-item">
        <img src="${escapeHtml((window.MocoSecurity && window.MocoSecurity.safeImage(item.image)) || 'assets/img/vanilla.jpg')}" alt="Mochi ${escapeHtml(item.name)}" width="64" height="64" loading="lazy">
        <div>
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-price">${S.formatRupiah(item.price)} / pcs</div>
          <div class="qty-control">
            <button type="button" data-cart-dec="${escapeHtml(item.id)}" aria-label="Kurangi jumlah ${escapeHtml(item.name)}">&minus;</button>
            <span aria-live="polite">${item.qty}</span>
            <button type="button" data-cart-inc="${escapeHtml(item.id)}" aria-label="Tambah jumlah ${escapeHtml(item.name)}">+</button>
          </div>
        </div>
        <div class="cart-item-side">
          <div class="cart-item-line">${S.formatRupiah(item.lineTotal)}</div>
          <button class="remove-btn" type="button" data-cart-remove="${escapeHtml(item.id)}">Hapus</button>
        </div>
      </div>`).join('');
  }

  function bumpBadge() {
    if (!els.count) return;
    els.count.classList.remove('bump');
    void els.count.offsetWidth;
    els.count.classList.add('bump');
    setTimeout(() => els.count.classList.remove('bump'), 300);
  }

  function addProduct(id, qty) {
    const product = S.getProduct(id);
    if (!product) return;
    if (product.available === false) {
      toast('Maaf, produk ini sedang tidak tersedia.');
      return;
    }
    S.addToCart(id, qty);
    renderCart();
    bumpBadge();
    toast(`${product.name} ditambahkan ke keranjang.`);
  }

  function openCart() {
    els.drawer.classList.add('show');
    els.drawer.setAttribute('aria-hidden', 'false');
    els.overlay.classList.add('show');
    lockScroll();
    setTimeout(() => {
      const first = els.drawer.querySelector('[data-close-cart]');
      if (first) first.focus({ preventScroll: true });
    }, 120);
  }

  function closeCart() {
    if (!els.drawer.classList.contains('show')) return;
    els.drawer.classList.remove('show');
    els.drawer.setAttribute('aria-hidden', 'true');
    els.overlay.classList.remove('show');
    unlockScroll();
    $('[data-open-cart]')?.focus({ preventScroll: true });
  }

  /* ---------------- Checkout ---------------- */
  function checkout() {
    const items = S.getCartDetails();
    if (!items.length) return;

    const order = S.createOrder(items);
    if (!order) {
      toast('Keranjang kosong. Tambahkan produk dulu.');
      return;
    }

    const message = S.buildWhatsAppMessage(items, order.total, order.id);
    const url = S.whatsappUrl(message);

    S.clearCart();
    renderCart();
    closeCart();
    toast(`Pesanan ${order.id} dicatat. Lanjutkan di WhatsApp.`);

    const win = window.open(url, '_blank');
    if (win) win.opener = null;
    else window.location.href = url;
  }

  /* ---------------- Contact ---------------- */
  function renderContact() {
    const contact = S.getContact();
    const waHref = contact.waLink || `https://wa.me/${contact.waNumber}`;
    const igHref = contact.igLink || 'https://www.instagram.com/';
    const igText = contact.igUsername.startsWith('@') ? contact.igUsername : `@${contact.igUsername}`;

    const set = (id, attr, value) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute(attr, value);
    };

    set('contactWa', 'href', waHref);
    set('footerWa', 'href', waHref);
    set('footerWaText', 'href', waHref);
    set('contactIg', 'href', igHref);
    set('footerIg', 'href', igHref);
    set('footerIgText', 'href', igHref);

    const waText = document.getElementById('contactWaText');
    if (waText) waText.textContent = contact.waDisplay || contact.waNumber;
    const footerWaText = document.getElementById('footerWaText');
    if (footerWaText) footerWaText.textContent = contact.waDisplay || contact.waNumber;
    const igTextEl = document.getElementById('contactIgText');
    if (igTextEl) igTextEl.textContent = igText;
    const footerIgText = document.getElementById('footerIgText');
    if (footerIgText) footerIgText.textContent = igText;
  }

  /* ---------------- Toast ---------------- */
  function toast(message) {
    if (!els.toastStack) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg><span>${escapeHtml(message)}</span>`;
    els.toastStack.appendChild(item);

    const existing = $$('.toast', els.toastStack);
    if (existing.length > 3) existing[0].remove();

    setTimeout(() => {
      item.classList.add('out');
      setTimeout(() => item.remove(), 250);
    }, 2900);
  }

  /* ---------------- Scroll lock ---------------- */
  function lockScroll() {
    document.body.classList.add('no-scroll');
  }

  function unlockScroll() {
    if (!els.modal.classList.contains('show') && !els.drawer.classList.contains('show')) {
      document.body.classList.remove('no-scroll');
    }
  }

  /* ---------------- Events ---------------- */
  function bindEvents() {
    document.addEventListener('click', (event) => {
      const addButton = event.target.closest('[data-add]');
      if (addButton) {
        event.stopPropagation();
        addProduct(addButton.dataset.add, 1);
        return;
      }

      const productTrigger = event.target.closest('[data-product]');
      if (productTrigger) {
        openDetail(productTrigger.dataset.product);
        return;
      }

      if (event.target.closest('[data-open-cart]')) {
        openCart();
        return;
      }

      if (event.target.closest('[data-close-cart]')) {
        closeCart();
        return;
      }

      if (event.target.closest('[data-close-detail]')) {
        closeDetail();
        return;
      }

      const inc = event.target.closest('[data-cart-inc]');
      if (inc) {
        const row = S.getCart().find((item) => item.id === inc.dataset.cartInc);
        S.updateCartQty(inc.dataset.cartInc, (row ? row.qty : 0) + 1);
        renderCart();
        return;
      }

      const dec = event.target.closest('[data-cart-dec]');
      if (dec) {
        const row = S.getCart().find((item) => item.id === dec.dataset.cartDec);
        if (row && row.qty <= 1) {
          S.removeFromCart(row.id);
          toast('Produk dihapus dari keranjang.');
        } else {
          S.updateCartQty(dec.dataset.cartDec, (row ? row.qty : 1) - 1);
        }
        renderCart();
        return;
      }

      const remove = event.target.closest('[data-cart-remove]');
      if (remove) {
        S.removeFromCart(remove.dataset.cartRemove);
        renderCart();
        toast('Produk dihapus dari keranjang.');
      }
    });

    /* Detail quantity + add */
    $('#detailMinus')?.addEventListener('click', () => {
      els.detailQty.value = String(clampQty(parseInt(els.detailQty.value, 10) - 1));
    });
    $('#detailPlus')?.addEventListener('click', () => {
      els.detailQty.value = String(clampQty(parseInt(els.detailQty.value, 10) + 1));
    });
    els.detailQty?.addEventListener('change', () => {
      els.detailQty.value = String(clampQty(els.detailQty.value));
    });
    els.detailAdd?.addEventListener('click', () => {
      if (!activeProductId) return;
      const qty = clampQty(els.detailQty.value);
      addProduct(activeProductId, qty);
      closeDetail();
      openCart();
    });

    els.checkout?.addEventListener('click', checkout);

    /* Close modal on backdrop */
    els.modal?.addEventListener('click', (event) => {
      if (event.target === els.modal) closeDetail();
    });

    /* Mobile navigation */
    els.menuToggle?.addEventListener('click', () => {
      const open = els.navLinks.classList.toggle('open');
      els.menuToggle.setAttribute('aria-expanded', String(open));
    });
    els.navLinks?.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        els.navLinks.classList.remove('open');
        els.menuToggle?.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (els.modal.classList.contains('show')) closeDetail();
        else if (els.drawer.classList.contains('show')) closeCart();
      }

      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.product-media[data-product]')) {
        event.preventDefault();
        openDetail(event.target.dataset.product);
      }
    });

    /* Admin edits in another tab should show up here */
    window.addEventListener('storage', (event) => {
      if (!event.key) return;
      if (event.key === S.KEYS.products) renderProducts();
      if (event.key === S.KEYS.cart) renderCart();
      if (event.key === S.KEYS.contact) renderContact();
    });

  }

  /* ---------------- Init ---------------- */
  renderProducts();
  renderCart();
  renderContact();
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  bindEvents();
})();
