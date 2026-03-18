// Simple MTO cart + countdown handler
(function(){
  const CART_KEY = 'mto_cart_v1';
  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => Array.from(r.querySelectorAll(s));

  function loadCart(){
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '{"items":[]}'); } catch { return { items: [] }; }
  }
  function saveCart(cart){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function cartCount(cart){ return (cart.items||[]).reduce((a,b)=>a + Number(b.qty||0), 0); }
  function cartTotal(cart){ return (cart.items||[]).reduce((a,b)=>a + Number(b.price||0) * Number(b.qty||0), 0); }
  function addItem(item){
    const cart = loadCart();
    const key = `${item.id}-${item.size}`;
    const found = (cart.items||[]).find(it => `${it.id}-${it.size}` === key);
    if (found) { found.qty += item.qty || 1; }
    else { cart.items.push({ ...item, qty: item.qty || 1 }); }
    saveCart(cart);
    updateCounts();
    renderAddAreas();
  }
  function removeItem(key){
    const cart = loadCart();
    cart.items = (cart.items||[]).filter(it => `${it.id}-${it.size}` !== key);
    saveCart(cart);
  }
  function setQty(key, qty){
    const cart = loadCart();
    const it = (cart.items||[]).find(i => `${i.id}-${i.size}` === key);
    if (it){ it.qty = Math.max(0, qty|0); if (it.qty===0) cart.items = cart.items.filter(x => x!==it); }
    saveCart(cart);
  }

  function updateCounts(){
    const cart = loadCart();
    const count = cartCount(cart);
    const badge = q('#mtoCartCount'); if (badge) badge.textContent = String(count);
    // per-product count: sum across sizes
    qa('.mto-count').forEach(span => {
      const id = span.getAttribute('data-id');
      const n = (cart.items||[]).filter(i => i.id === id).reduce((a,b)=>a+b.qty,0);
      span.textContent = String(n);
    });
  }

  // Wire add buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.mto-add');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const title = btn.getAttribute('data-title');
    const size = btn.getAttribute('data-size');
    const price = Number(btn.getAttribute('data-price')||0);
    const image = btn.getAttribute('data-image') || '';
    addItem({ id, title, size, price, image, qty: 1 });
    // show inline counter for this size
    showCounterFor(btn);
  });

  // Filters
  document.addEventListener('click', (e) => {
    const f = e.target.closest('.mto-filter');
    if (!f) return;
    const cat = f.getAttribute('data-cat');
    qa('#mtoGrid [data-id]').forEach(card => {
      const c = card.getAttribute('data-cat');
      card.style.display = (!cat || cat==='All' || c===cat) ? '' : 'none';
    });
    // re-sync button/counter visibility for visible cards
    renderAddAreas();
  });

  // Countdown
  function startCountdown(){
    const el = q('#mtoCountdown') || q('#cartDeadline');
    const str = window.__MTO_DEADLINE__;
    if (!el || !str) return;
    const deadline = new Date(str).getTime();
    const deadlineTextEl = q('#mtoDeadlineText');
    const fmt = (n)=> n < 10 ? '0'+n : ''+n;
    const tick = () => {
      const now = Date.now();
      let d = Math.max(0, deadline - now);
      const hours = Math.floor(d / 3_600_000); d -= hours*3_600_000;
      const mins = Math.floor(d / 60_000); d -= mins*60_000;
      const secs = Math.floor(d / 1000);
      const text = `${fmt(hours)}:${fmt(mins)}:${fmt(secs)}`;
      if (el.id === 'cartDeadline') el.textContent = new Date(str).toLocaleString();
      else el.textContent = text;
      if (deadlineTextEl) deadlineTextEl.textContent = new Date(str).toLocaleString();
    };
    tick();
    setInterval(tick, 1000);
  }

  // Cart page rendering
  function renderCart(){
    const wrap = q('#cartItems'); if (!wrap) return;
    const empty = q('#cartEmpty');
    const cart = loadCart();
    if (!cart.items || cart.items.length===0) {
      wrap.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      const tot = q('#cartTotal'); if (tot) tot.textContent = '₹0';
      return;
    }
    if (empty) empty.classList.add('hidden');
    wrap.innerHTML = cart.items.map(it => {
      const key = `${it.id}-${it.size}`;
      const img = it.image || '/assets/img/og.jpg';
      return `
        <div class="py-3 flex flex-wrap md:flex-nowrap items-center justify-between gap-4" data-key="${key}">
          <div class="flex items-center gap-3 min-w-0">
            <img src="${img}" alt="${it.title}" class="w-16 h-16 rounded object-cover border border-slate-200" />
            <div class="min-w-0">
              <div class="font-medium truncate">${it.title} <span class="opacity-70">(${it.size}g)</span></div>
              <div class="text-sm opacity-80">₹${it.price}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button class="qty-dec px-2 py-1 bg-white/10 rounded">-</button>
            <input class="qty-input w-14 text-center bg-black/20 border border-white/10 rounded" value="${it.qty}" />
            <button class="qty-inc px-2 py-1 bg-white/10 rounded">+</button>
            <button class="rm px-2 py-1 bg-red-500/80 text-white rounded">Remove</button>
          </div>
        </div>`;
    }).join('');
    const tot = q('#cartTotal'); if (tot) tot.textContent = `₹${cartTotal(cart)}`;
  }

  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-key]');
    if (!row) return;
    const key = row.getAttribute('data-key');
    if (e.target.closest('.qty-inc')) { const cart = loadCart(); const it = cart.items.find(i => `${i.id}-${i.size}`===key); if (it){ it.qty++; saveCart(cart); renderCart(); updateCounts(); } }
    if (e.target.closest('.qty-dec')) { const cart = loadCart(); const it = cart.items.find(i => `${i.id}-${i.size}`===key); if (it){ it.qty = Math.max(0, it.qty-1); if (it.qty===0) cart.items = cart.items.filter(i => i!==it); saveCart(cart); renderCart(); updateCounts(); } }
    if (e.target.closest('.rm')) { removeItem(key); renderCart(); updateCounts(); }
  });

  document.addEventListener('input', (e) => {
    const inp = e.target.closest('.qty-input');
    if (!inp) return;
    const row = e.target.closest('[data-key]');
    const key = row.getAttribute('data-key');
    const qty = Math.max(0, parseInt(inp.value || '0', 10));
    setQty(key, qty); renderCart(); updateCounts();
  });

  // Checkout rendering + submit
  function renderCheckout(){
    const list = q('#checkoutItems'); if (!list) return;
    const cart = loadCart();
    list.innerHTML = (cart.items||[]).map(i => `<div class="py-2 flex items-center justify-between"><div>${i.title} <span class="opacity-70">(${i.size}g)</span></div><div>×${i.qty}</div><div>₹${i.qty * i.price}</div></div>`).join('');
    const tot = q('#checkoutTotal'); if (tot) tot.textContent = `₹${cartTotal(cart)}`;
  }

  function submitCheckout(){
    const form = q('#mtoCheckoutForm'); if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cart = loadCart();
      if (!cart.items || cart.items.length===0) { alert('Your cart is empty'); return; }
      const fd = new FormData(form);
      const customer = {
        name: fd.get('name')?.toString() || '',
        phone: fd.get('phone')?.toString() || '',
        email: fd.get('email')?.toString() || '',
        community: fd.get('community')?.toString() || '',
        address: fd.get('address')?.toString() || ''
      };
      const notes = fd.get('notes')?.toString() || '';
      const payload = { customer, items: cart.items, total: cartTotal(cart), notes };
      const msg = q('#mtoFormMsg'); if (msg) { msg.textContent = 'Placing order...'; msg.className='ml-3 text-sm opacity-80'; }
      try {
        const res = await fetch('/mto/order', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(payload) });
        const json = await res.json();
        if (json.ok) { localStorage.removeItem(CART_KEY); window.location.href = `/mto/confirmation/${json.orderId}`; }
        else { if (msg) { msg.textContent = json.error || 'Failed'; msg.className='ml-3 text-sm text-red-400'; } }
      } catch (err) {
        if (msg) { msg.textContent = 'Network error'; msg.className='ml-3 text-sm text-red-400'; }
      }
    });
  }

  // Init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    updateCounts();
    startCountdown();
    renderCart();
    renderCheckout();
    submitCheckout();
    renderAddAreas();
  });

  // -------- Inline Add->Counter on catalog cards --------
  function keyFromBtn(btn){
    return `${btn.getAttribute('data-id')}-${btn.getAttribute('data-size')}`;
  }
  function qtyForKey(key){
    const cart = loadCart();
    const it = (cart.items||[]).find(i => `${i.id}-${i.size}` === key);
    return it ? (it.qty|0) : 0;
  }
  function ensureCounter(btn){
    const key = keyFromBtn(btn);
    let wrap = btn.nextElementSibling;
    if (!wrap || !wrap.classList || !wrap.classList.contains('mto-counter') || wrap.getAttribute('data-key') !== key){
      wrap = document.createElement('div');
      wrap.className = 'mto-counter inline-block';
      wrap.setAttribute('data-key', key);
      const size = btn.getAttribute('data-size') || '';
      const price = btn.getAttribute('data-price') || '';
      wrap.innerHTML = `
        <div class="inline-flex items-center gap-2">
          <button class="mto-qty-dec btn btn-ghost" type="button">-</button>
          <input class="mto-qty-input w-14 text-center bg-white border border-slate-300 rounded" value="0" />
          <button class="mto-qty-inc btn btn-ghost" type="button">+</button>
        </div>
        <div class="mto-counter-info text-xs text-slate-600 mt-1">${size}g — ₹${price}</div>
      `;
      btn.parentNode.insertBefore(wrap, btn.nextSibling);
    }
    return wrap;
  }
  function showCounterFor(btn){
    const key = keyFromBtn(btn);
    const qty = qtyForKey(key);
    const counter = ensureCounter(btn);
    const input = counter.querySelector('.mto-qty-input');
    const info = counter.querySelector('.mto-counter-info');
    if (info) {
      const size = btn.getAttribute('data-size') || '';
      const price = btn.getAttribute('data-price') || '';
      info.textContent = `${size}g — ₹${price}`;
    }
    input.value = String(qty);
    btn.style.display = 'none';
    counter.style.display = '';
  }
  function showButtonFor(btn){
    const key = keyFromBtn(btn);
    // find sibling counter
    const counter = btn.nextElementSibling;
    if (counter && counter.classList && counter.classList.contains('mto-counter') && counter.getAttribute('data-key') === key){
      counter.style.display = 'none';
    }
    btn.style.display = '';
  }
  function renderAddAreas(){
    qa('.mto-add').forEach(btn => {
      const key = keyFromBtn(btn);
      const qty = qtyForKey(key);
      if (qty > 0) showCounterFor(btn); else showButtonFor(btn);
    });
  }

  // Delegate inline counter interactions on catalog cards
  document.addEventListener('click', (e) => {
    const inc = e.target.closest('.mto-qty-inc');
    const dec = e.target.closest('.mto-qty-dec');
    if (!inc && !dec) return;
    const wrap = (inc || dec).closest('.mto-counter');
    const key = wrap.getAttribute('data-key');
    const btn = wrap.previousElementSibling; // the original .mto-add
    const cart = loadCart();
    const it = (cart.items||[]).find(i => `${i.id}-${i.size}` === key);
    let qty = it ? it.qty : 0;
    if (inc) qty += 1; else qty = Math.max(0, qty - 1);
    setQty(key, qty);
    updateCounts();
    if (qty === 0) { showButtonFor(btn); }
    else { const input = wrap.querySelector('.mto-qty-input'); if (input) input.value = String(qty); }
  });

  document.addEventListener('input', (e) => {
    const inp = e.target.closest('.mto-qty-input');
    if (!inp) return;
    const wrap = inp.closest('.mto-counter');
    const key = wrap.getAttribute('data-key');
    const qty = Math.max(0, parseInt(inp.value || '0', 10));
    setQty(key, qty);
    updateCounts();
    if (qty === 0) {
      const btn = wrap.previousElementSibling;
      showButtonFor(btn);
    }
  });
})();
