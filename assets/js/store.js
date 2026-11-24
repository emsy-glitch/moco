/* Moco — shared data store (prototype, LocalStorage).
   Semua modul (customer & admin) membaca/menulis lewat store ini supaya
   perubahan di dashboard langsung terlihat di halaman pelanggan. */
(function (global) {
  'use strict';

  const KEYS = {
    products: 'moco.products.v1',
    cart: 'moco.cart.v1',
    orders: 'moco.orders.v1',
    contact: 'moco.contact.v1'
  };

  const STATUS = ['Menunggu Konfirmasi', 'Diproses', 'Selesai', 'Dibatalkan'];

  const DEFAULT_PRODUCTS = [
    {
      id: 'mango-cream',
      name: 'Mango Cream',
      price: 10000,
      tag: 'Best Seller',
      featured: true,
      available: true,
      image: 'assets/img/mango-cream.jpg',
      desc: 'Mochi lembut dengan isian mangga segar dan krim susu yang ringan. Manisnya pas, segar di setiap gigitan.'
    },
    {
      id: 'strawberry-cream',
      name: 'Strawberry Cream',
      price: 10000,
      tag: 'Favorit',
      featured: true,
      available: true,
      image: 'assets/img/strawberry-cream.jpg',
      desc: 'Krim lembut dengan rasa strawberry asli, dibungkus mochi kenyal yang lumer di mulut.'
    },
    {
      id: 'matcha',
      name: 'Matcha',
      price: 10000,
      tag: 'Signature',
      featured: false,
      available: true,
      image: 'assets/img/matcha.jpg',
      desc: 'Cita rasa teh hijau khas Jepang dengan sedikit pahit manis yang elegan, berpadu krim lembut.'
    },
    {
      id: 'vanilla',
      name: 'Vanilla',
      price: 10000,
      tag: 'Classic',
      featured: false,
      available: true,
      image: 'assets/img/vanilla.jpg',
      desc: 'Isian krim vanilla dengan aroma harum dan tekstur halus. Pilihan klasik yang selalu aman.'
    },
    {
      id: 'red-bean',
      name: 'Red Bean',
      price: 10000,
      tag: 'Tradisional',
      featured: false,
      available: true,
      image: 'assets/img/red-bean.jpg',
      desc: 'Pasta kacang merah manis yang dimasak perlahan, dibalut mochi lembut bergaya Jepang.'
    }
  ];

  const DEFAULT_CONTACT = {
    waNumber: '6281283115852',
    waDisplay: '0812 8311 5852',
    waLink: 'https://wa.me/6281283115852',
    igUsername: 'muhammad.syauqal',
    igLink: 'https://www.instagram.com/muhammad.syauqal/'
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return clone(fallback);
      const parsed = JSON.parse(raw);
      return parsed == null ? clone(fallback) : parsed;
    } catch (err) {
      console.warn('Moco: data tidak bisa dibaca untuk', key, err);
      return clone(fallback);
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Moco: data gagal disimpan untuk', key, err);
      return false;
    }
  }

  /* ---------- Produk ---------- */
  function getProducts() {
    const list = read(KEYS.products, DEFAULT_PRODUCTS);
    return Array.isArray(list) ? list : clone(DEFAULT_PRODUCTS);
  }

  function saveProducts(list) {
    write(KEYS.products, list);
  }

  function getProduct(id) {
    return getProducts().find((p) => p.id === id) || null;
  }

  function upsertProduct(product) {
    const list = getProducts();
    const index = list.findIndex((p) => p.id === product.id);
    if (index >= 0) list[index] = product;
    else list.push(product);
    saveProducts(list);
  }

  function deleteProduct(id) {
    saveProducts(getProducts().filter((p) => p.id !== id));
    setCart(getCart().filter((row) => row.id !== id));
  }

  /* ---------- Keranjang ---------- */
  function getCart() {
    const cart = read(KEYS.cart, []);
    return Array.isArray(cart) ? cart.filter((row) => row && row.id && row.qty > 0) : [];
  }

  function setCart(cart) {
    write(KEYS.cart, cart);
  }

  function addToCart(id, qty) {
    const amount = Math.max(1, parseInt(qty, 10) || 1);
    const cart = getCart();
    const row = cart.find((item) => item.id === id);
    if (row) row.qty += amount;
    else cart.push({ id, qty: amount });
    setCart(cart);
    return cart;
  }

  function updateCartQty(id, qty) {
    const amount = parseInt(qty, 10);
    let cart = getCart();
    if (!Number.isFinite(amount) || amount <= 0) {
      cart = cart.filter((item) => item.id !== id);
    } else {
      const row = cart.find((item) => item.id === id);
      if (row) row.qty = amount;
    }
    setCart(cart);
    return cart;
  }

  function removeFromCart(id) {
    setCart(getCart().filter((item) => item.id !== id));
  }

  function clearCart() {
    setCart([]);
  }

  /* Gabungkan keranjang dengan data produk terkini. Produk yang sudah
     dihapus admin otomatis dilewati. */
  function getCartDetails() {
    const products = getProducts();
    return getCart()
      .map((row) => {
        const product = products.find((p) => p.id === row.id);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          image: product.image,
          available: product.available !== false,
          qty: row.qty,
          lineTotal: (Number(product.price) || 0) * row.qty
        };
      })
      .filter(Boolean);
  }

  function cartCount() {
    return getCartDetails().reduce((sum, item) => sum + item.qty, 0);
  }

  function cartTotal() {
    return getCartDetails().reduce((sum, item) => sum + item.lineTotal, 0);
  }

  /* ---------- Pesanan ---------- */
  function getOrders() {
    const orders = read(KEYS.orders, []);
    return Array.isArray(orders) ? orders : [];
  }

  function saveOrders(orders) {
    write(KEYS.orders, orders);
  }

  function makeOrderId() {
    const now = new Date();
    const stamp = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('');
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    return `MCO-${stamp}-${suffix}`;
  }

  function createOrder(items) {
    const list = Array.isArray(items) ? items : getCartDetails();
    if (!list.length) return null;
    const order = {
      id: makeOrderId(),
      date: new Date().toISOString(),
      items: list.map((item) => ({
        productId: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty
      })),
      total: list.reduce((sum, item) => sum + item.price * item.qty, 0),
      status: STATUS[0],
      source: 'WhatsApp'
    };
    const orders = getOrders();
    orders.unshift(order);
    saveOrders(orders);
    return order;
  }

  function updateOrderStatus(id, status) {
    if (!STATUS.includes(status)) return false;
    const orders = getOrders();
    const order = orders.find((item) => item.id === id);
    if (!order) return false;
    order.status = status;
    saveOrders(orders);
    return true;
  }

  function deleteOrder(id) {
    saveOrders(getOrders().filter((order) => order.id !== id));
  }

  function orderItemCount(order) {
    return (order.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }

  /* ---------- Kontak ---------- */
  function getContact() {
    const saved = read(KEYS.contact, DEFAULT_CONTACT);
    const merged = Object.assign({}, DEFAULT_CONTACT, saved || {});
    const security = global.MocoSecurity;

    const digits = String(merged.waNumber || '').replace(/\D/g, '') || '6281283115852';
    const igUsername = String(merged.igUsername || '').replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '') || 'muhammad.syauqal';
    const waLink = security
      ? (security.safeHref(merged.waLink, ['wa.me', 'api.whatsapp.com', 'www.whatsapp.com', 'web.whatsapp.com']) || `https://wa.me/${digits}`)
      : `https://wa.me/${digits}`;
    const igLink = security
      ? (security.safeHref(merged.igLink, ['www.instagram.com', 'instagram.com']) || `https://www.instagram.com/${igUsername}/`)
      : `https://www.instagram.com/${igUsername}/`;

    return {
      waNumber: digits,
      waDisplay: String(merged.waDisplay || digits).slice(0, 24),
      waLink,
      igUsername,
      igLink
    };
  }

  function saveContact(contact) {
    write(KEYS.contact, Object.assign({}, getContact(), contact));
  }

  /* ---------- Backup & pemulihan ---------- */
  function exportData() {
    return {
      app: 'moco',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        products: getProducts(),
        orders: getOrders(),
        contact: getContact()
      }
    };
  }

  function importData(payload) {
    const security = global.MocoSecurity;
    if (!security) return { ok: false, message: 'Modul keamanan tidak tersedia.' };
    if (!payload || payload.app !== 'moco' || !payload.data) {
      return { ok: false, message: 'File bukan backup Moco yang valid.' };
    }

    const rawProducts = Array.isArray(payload.data.products) ? payload.data.products : [];
    const rawOrders = Array.isArray(payload.data.orders) ? payload.data.orders : [];
    if (rawProducts.length > 100) return { ok: false, message: 'Backup berisi terlalu banyak produk (maks. 100).' };
    if (rawOrders.length > 2000) return { ok: false, message: 'Backup berisi terlalu banyak pesanan (maks. 2.000).' };

    const products = [];
    const usedIds = new Set();
    for (const raw of rawProducts) {
      const checked = security.validateProduct(raw || {});
      if (!checked.ok) {
        return {
          ok: false,
          message: `Produk “${security.sanitizeText(raw && raw.name, 40) || 'tanpa nama'}” tidak valid: ${Object.values(checked.errors)[0]}`
        };
      }
      let id = String((raw && raw.id) || checked.value.name)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'produk';
      while (usedIds.has(id)) id = `${id}-2`;
      usedIds.add(id);
      products.push(Object.assign({}, checked.value, { id }));
    }

    const orders = [];
    for (const raw of rawOrders) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30);
      const date = new Date(raw.date);
      const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 50).map((item) => ({
        productId: security.sanitizeText(item && item.productId, 60),
        name: security.sanitizeText(item && item.name, 60),
        price: Number(item && item.price),
        qty: Number(item && item.qty)
      })).filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0 && Number.isInteger(item.qty) && item.qty > 0);
      const total = Number(raw.total);
      if (!id || Number.isNaN(date.getTime()) || !items.length || !Number.isFinite(total) || total < 0) continue;
      orders.push({
        id,
        date: date.toISOString(),
        items,
        total: Math.round(total),
        status: STATUS.includes(raw.status) ? raw.status : STATUS[0],
        source: 'Restore'
      });
    }

    const checkedContact = security.validateContact(payload.data.contact || {});
    saveProducts(products);
    saveOrders(orders);
    saveContact(checkedContact.ok ? checkedContact.value : getContact());

    return { ok: true, products: products.length, orders: orders.length };
  }

  /* ---------- Statistik ---------- */
  function getStats() {
    const products = getProducts();
    const orders = getOrders();
    const valid = orders.filter((order) => order.status !== 'Dibatalkan');
    return {
      products: products.length,
      orders: orders.length,
      itemsSold: valid.reduce((sum, order) => sum + orderItemCount(order), 0),
      revenue: valid.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      pending: orders.filter((order) => order.status === 'Menunggu Konfirmasi').length,
      available: products.filter((p) => p.available !== false).length
    };
  }

  /* ---------- Format ---------- */
  function formatRupiah(value) {
    const number = Number(value) || 0;
    return 'Rp' + number.toLocaleString('id-ID');
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    }) + ' · ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  /* Pesan WhatsApp mengikuti format yang diminta. */
  function buildWhatsAppMessage(items, total, orderId) {
    const lines = ['Halo Moco, saya ingin memesan:', ''];
    (items || []).forEach((item) => {
      lines.push(`${item.name} x${item.qty} = ${formatRupiah(item.price * item.qty)}`);
    });
    lines.push('', `Total: ${formatRupiah(total != null ? total : items.reduce((s, i) => s + i.price * i.qty, 0))}`);
    if (orderId) lines.push(`ID Pesanan: ${orderId}`);
    lines.push('', 'Mohon informasi selanjutnya. Terima kasih.');
    return lines.join('\n');
  }

  function whatsappUrl(message) {
    const contact = getContact();
    const base = contact.waLink || `https://wa.me/${contact.waNumber}`;
    return `${base}?text=${encodeURIComponent(message)}`;
  }

  function resetDemoData() {
    [KEYS.products, KEYS.cart, KEYS.orders, KEYS.contact].forEach((key) => {
      try { localStorage.removeItem(key); } catch (err) { /* abaikan */ }
    });
  }

  global.MocoStore = {
    KEYS,
    STATUS,
    DEFAULT_PRODUCTS,
    DEFAULT_CONTACT,
    getProducts, saveProducts, getProduct, upsertProduct, deleteProduct,
    getCart, setCart, addToCart, updateCartQty, removeFromCart, clearCart,
    getCartDetails, cartCount, cartTotal,
    getOrders, saveOrders, createOrder, updateOrderStatus, deleteOrder, orderItemCount,
    getContact, saveContact,
    exportData, importData,
    getStats,
    formatRupiah, formatDate, buildWhatsAppMessage, whatsappUrl, resetDemoData
  };
})(window);
