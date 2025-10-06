// Простая клиентская логика: имитация API с localStorage, модал для добавления элементов
(() => {
  const SAMPLE_PRODUCTS = [
    { id: 1, name: "Эспрессо", price: 120 },
    { id: 2, name: "Капучино", price: 180 },
    { id: 3, name: "Латте", price: 200 },
    { id: 4, name: "Чай", price: 90 },
    { id: 5, name: "Сэндвич", price: 350 }
  ];

  // utils
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const fmt = v => Number(v).toLocaleString('ru-RU');

  // storage keys
  const ORDERS_KEY = "demo_orders_v1";
  const AUDIT_KEY = "demo_audit_v1";

  // sample initial data
  function seed() {
    if (!localStorage.getItem(ORDERS_KEY)) {
      const orders = [
        { id: 101, table: 5, status: "active", version: 1, total: 520, items: [{name:"Капучино", qty:1, price:180}], created_at: Date.now() },
        { id: 102, table: 3, status: "active", version: 1, total: 900, items: [{name:"Сэндвич", qty:2, price:350}], created_at: Date.now() },
        { id: 103, table: 8, status: "completed", version: 1, total: 300, items: [{name:"Латте", qty:1, price:200}], created_at: Date.now() }
      ];
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
      localStorage.setItem(AUDIT_KEY, JSON.stringify([]));
    }
  }

  function loadOrders() { return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]"); }
  function saveOrders(orders){ localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); }
  function appendAudit(entry){
    const a = JSON.parse(localStorage.getItem(AUDIT_KEY)||"[]"); a.unshift(entry); localStorage.setItem(AUDIT_KEY, JSON.stringify(a));
  }

  // render functions
  const ordersList = $("#orders-list");
  const template = document.getElementById("order-row-template");

  function renderOrders(tab="active"){
    ordersList.innerHTML = "";
    const orders = loadOrders().filter(o => tab==="active" ? o.status!=="completed" : o.status==="completed");
    if (!orders.length) ordersList.innerHTML = "<div class='order-row'><div style='padding:12px'>Список пуст</div></div>";
    for (const o of orders) {
      const node = template.content.cloneNode(true);
      node.querySelector(".id").textContent = o.id;
      node.querySelector(".table").textContent = o.table;
      node.querySelector(".total").textContent = fmt(o.total);
      const statusEl = node.querySelector(".status");
      statusEl.textContent = o.status;
      statusEl.classList.add(o.status==="completed" ? "completed" : "active");
      const row = node.querySelector(".order-row");
      const btnAdd = row.querySelector(".btn-add");
      const btnComplete = row.querySelector(".btn-complete");

      btnAdd.addEventListener("click", () => openModal(o.id));
      btnComplete.addEventListener("click", () => completeOrder(o.id));
      ordersList.appendChild(node);
    }
    renderAudit();
  }

  // modal logic
  const modal = $("#modal");
  const modalTitle = $("#modal-title");
  const productQuery = $("#product-query");
  const suggestions = $("#suggestions");
  const quickProducts = $("#quick-products");
  const cartItemsEl = $("#cart-items");
  const deltaEl = $("#delta");
  const toast = $("#toast");
  const auditLogEl = $("#audit-log");
  let editingOrder = null;
  let cart = [];

  function openModal(orderId){
    const orders = loadOrders();
    const order = orders.find(o => o.id===orderId);
    editingOrder = order;
    modalTitle.textContent = `Добавить в заказ #${order.id} — стол ${order.table}`;
    cart = [];
    renderQuick();
    renderCart();
    productQuery.value = "";
    suggestions.innerHTML = "";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
  }

  function closeModal(){ modal.classList.add("hidden"); modal.setAttribute("aria-hidden","true"); editingOrder=null; cart=[]; }

  $("#modal-close").addEventListener("click", closeModal);
  $("#btn-cancel").addEventListener("click", closeModal);

  function renderQuick(){
    quickProducts.innerHTML = "";
    for (const p of SAMPLE_PRODUCTS){
      const b = document.createElement("button");
      b.className = "quick-product";
      b.textContent = `${p.name} • ${p.price} ₽`;
      b.addEventListener("click", () => { addToCart(p,1); });
      quickProducts.appendChild(b);
    }
  }

  function renderCart(){
    cartItemsEl.innerHTML = "";
    let sum = 0;
    for (let i=0;i<cart.length;i++){
      const it = cart[i];
      const div = document.createElement("div");
      div.className = "cart-item";
      div.innerHTML = `<div>${it.name} × ${it.qty} ${it.note?`<small>(${it.note})</small>`:""}</div><div>${fmt(it.qty*it.price)} ₽ <button data-i="${i}" class="small-del">✕</button></div>`;
      cartItemsEl.appendChild(div);
    }
    sum = cart.reduce((s,x)=>s+x.qty*x.price,0);
    deltaEl.textContent = fmt(sum);
    // attach delete handlers
    $$(".small-del").forEach(el=>el.addEventListener("click",(e)=>{ const i=+e.target.dataset.i; cart.splice(i,1); renderCart(); }));
  }

  function addToCart(product, qty=1){
    const existing = cart.find(c=>c.id===product.id && c.note===product.note);
    if (existing) existing.qty += qty; else cart.push({ id: product.id, name: product.name, price: product.price, qty, note: "" });
    renderCart();
  }

  productQuery.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    suggestions.innerHTML = "";
    if (!q) return;
    const found = SAMPLE_PRODUCTS.filter(p=>p.name.toLowerCase().includes(q));
    for (const f of found){
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.textContent = `${f.name} — ${f.price} ₽`;
      div.addEventListener("click", ()=> addToCart(f,1));
      suggestions.appendChild(div);
    }
  });

  // Add/Update handler: simulating optimistic locking & audit
  $("#btn-add-update").addEventListener("click", async () => {
    if (!editingOrder) return showToast("Нет выбранного заказа");
    if (editingOrder.status==="completed") {
      // show create addendum option
      if (!confirm("Заказ уже завершён. Создать доп. заказ?")) return;
      createAddendum(editingOrder, cart);
      closeModal();
      return;
    }
    if (!cart.length) return showToast("Добавьте хотя бы одну позицию");
    // Simulate fetch: check version
    const orders = loadOrders();
    const current = orders.find(o=>o.id===editingOrder.id);
    if (!current) return showToast("Заказ не найден");
    if (current.version !== editingOrder.version) {
      showToast("Заказ изменён другим пользователем. Обновите список.", true);
      closeModal();
      renderOrders(currentTab);
      return;
    }
    // perform "transaction"
    try {
      // update items & totals
      for (const it of cart){
        current.items.push({ name: it.name, qty: it.qty, price: it.price, note: it.note });
        current.total += it.qty * it.price;
      }
      current.version += 1;
      saveOrders(orders);
      appendAudit({
        order_id: current.id,
        user: "Ivan",
        action: "add_items",
        items: cart,
        total_delta: cart.reduce((s,x)=>s+x.qty*x.price,0),
        timestamp: Date.now()
      });
      showToast("Позиции добавлены — сумма заказа обновлена.");
      closeModal();
      renderOrders(currentTab);
    } catch (err) {
      console.error(err);
      showToast("Ошибка при добавлении позиций", true);
    }
  });

  // Add and send receipt (just demo - same as add)
  $("#btn-add-receipt").addEventListener("click", ()=> {
    $("#btn-add-update").click();
    showToast("Чек отправлен (демо).");
  });

  function createAddendum(original, items){
    const orders = loadOrders();
    const newOrder = {
      id: Math.floor(Math.random()*900+200)+1000,
      table: original.table,
      status: "active",
      version: 1,
      total: items.reduce((s,x)=>s+x.qty*x.price,0),
      items: items.map(i=>({name:i.name, qty:i.qty, price:i.price, note:i.note})),
      parent_order: original.id,
      created_at: Date.now()
    };
    orders.push(newOrder);
    saveOrders(orders);
    appendAudit({ order_id: newOrder.id, user:"Ivan", action: "create_addendum", items, total_delta: newOrder.total, timestamp: Date.now(), parent: original.id });
    showToast("Доп. заказ создан и добавлен.");
    renderOrders(currentTab);
  }

  // complete order
  function completeOrder(orderId){
    if (!confirm("Завершить заказ?")) return;
    const orders = loadOrders();
    const o = orders.find(x=>x.id===orderId);
    if (!o) return showToast("Заказ не найден", true);
    o.status = "completed";
    o.version = (o.version||0)+1;
    saveOrders(orders);
    appendAudit({ order_id: o.id, user:"Ivan", action:"complete", timestamp: Date.now() });
    showToast("Заказ завершён.");
    renderOrders(currentTab);
  }

  // toast
  function showToast(msg, danger=false){
    toast.textContent = msg;
    toast.style.background = danger ? "#c53030" : "#111";
    toast.classList.remove("hidden");
    setTimeout(()=> toast.classList.add("hidden"), 2500);
  }

  // audit rendering
  function renderAudit(){
    const a = JSON.parse(localStorage.getItem(AUDIT_KEY)||"[]");
    auditLogEl.innerHTML = "";
    for (const rec of a.slice(0,20)){
      const d = document.createElement("div");
      const t = new Date(rec.timestamp).toLocaleString();
      d.textContent = `${t} — Order #${rec.order_id} — ${rec.action} — ${rec.total_delta?rec.total_delta+" ₽":""}`;
      auditLogEl.appendChild(d);
    }
  }

  // tabs
  let currentTab = "active";
  $$(".tab").forEach(t => t.addEventListener("click", (e)=>{
    $$(".tab").forEach(x=>x.classList.remove("active"));
    e.target.classList.add("active");
    currentTab = e.target.dataset.tab;
    renderOrders(currentTab);
  }));

  // init
  seed();
  renderOrders();
})();