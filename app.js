/* =========================================================
   LevelUp Recargas — Panel de revendedores (prototipo)
   Todo es simulado: datos en localStorage, sin servidor.
   ========================================================= */

// ---------- Utilidades ----------
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const round = (n) => Math.round(n * 100) / 100;
const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Number(n)).toFixed(2);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (t) => new Date(t).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDay = (t) => new Date(t).toLocaleDateString("es", { weekday: "short", day: "2-digit" });
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const DAY = 864e5;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

function copy(text, msg = "Copiado ✔") {
  (navigator.clipboard?.writeText(text) ?? Promise.reject())
    .then(() => toast(msg))
    .catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(msg); } catch { toast("No se pudo copiar"); }
      ta.remove();
    });
}

function download(name, content, type = "text/csv") {
  const url = URL.createObjectURL(new Blob(["﻿" + content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Catálogo ----------
const GAMES = [
  { id: "ff", name: "Free Fire", ico: "🔥", active: true },
  { id: "codm", name: "Call of Duty Mobile", ico: "🎯", active: false },
  { id: "pubgm", name: "PUBG Mobile", ico: "🪖", active: false },
  { id: "mlbb", name: "Mobile Legends", ico: "⚔️", active: false },
];

const PACKAGES = [
  { id: "ff-100",     code: "100",     name: "100 Diamantes",   ico: "💎", cost: 0.85,  suggested: 1.20 },
  { id: "ff-310",     code: "310",     name: "310 Diamantes",   ico: "💎", cost: 2.55,  suggested: 3.50 },
  { id: "ff-520",     code: "520",     name: "520 Diamantes",   ico: "💎", cost: 4.20,  suggested: 5.80 },
  { id: "ff-1060",    code: "1060",    name: "1060 Diamantes",  ico: "💎", cost: 8.40,  suggested: 11.50 },
  { id: "ff-2180",    code: "2180",    name: "2180 Diamantes",  ico: "💎", cost: 16.90, suggested: 23.00 },
  { id: "ff-5600",    code: "5600",    name: "5600 Diamantes",  ico: "💎", cost: 42.50, suggested: 57.00 },
  { id: "ff-semanal", code: "semanal", name: "Tarjeta semanal", ico: "🎟️", cost: 1.60,  suggested: 2.30 },
  { id: "ff-mensual", code: "mensual", name: "Tarjeta mensual", ico: "📅", cost: 7.90,  suggested: 10.50 },
  { id: "ff-booyah",  code: "booyah",  name: "Pase Booyah",     ico: "🏆", cost: 3.20,  suggested: 4.50 },
];
const PKG = (id) => PACKAGES.find((p) => p.id === id);

const LEVELS = [
  { id: "basico",   name: "Básico",   min: 0,    disc: 0,    perks: ["Precios mayoristas", "Soporte por ticket"] },
  { id: "plata",    name: "Plata",    min: 200,  disc: 0.02, perks: ["-2 % en todos los paquetes", "Recarga masiva", "Soporte por WhatsApp"] },
  { id: "oro",      name: "Oro",      min: 800,  disc: 0.04, perks: ["-4 % en todos los paquetes", "Acceso a API", "Soporte prioritario"] },
  { id: "diamante", name: "Diamante", min: 2000, disc: 0.06, perks: ["-6 % en todos los paquetes", "Gestor de cuenta dedicado", "Pagos a crédito"] },
];

const METHODS = [
  { id: "transfer", name: "Transferencia bancaria", ico: "🏦", fee: 0,    note: "Sin comisión · 5-30 min" },
  { id: "mp",       name: "Mercado Pago",           ico: "💳", fee: 0.03, note: "3 % comisión · Instantáneo" },
  { id: "usdt",     name: "USDT (TRC20)",           ico: "🪙", fee: 0,    note: "Sin comisión · 1-10 min" },
  { id: "paypal",   name: "PayPal",                 ico: "🅿️", fee: 0.05, note: "5 % comisión · Instantáneo" },
];

const NICKS = ["xX_Dark_Xx", "ElPro_MX", "Kira★", "Sniper_FF", "Zeus.GG", "Luna💜", "ToxicBoy", "Rayo⚡", "NoobMaster", "ReynaFF", "Fantasma", "Bala_Perdida", "Cobra_King", "Vale★Gamer", "HeadshotOnly"];
function nickFor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NICKS[h % NICKS.length];
}
const validId = (id) => /^\d{6,12}$/.test(String(id).trim());

// ---------- Estado ----------
const KEY = "lu_reseller_v1";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function seedState() {
  const r = rng(42);
  const now = Date.now();
  const orders = [];
  const movements = [];
  for (let i = 0; i < 52; i++) {
    const daysAgo = Math.floor(r() * 10);
    let t = startOfDay() - daysAgo * DAY + Math.floor(r() * DAY);
    if (t > now) t = now - Math.floor(r() * 3 * 36e5) - 60000;
    const pkg = PACKAGES[Math.floor(Math.pow(r(), 1.6) * PACKAGES.length)];
    const pid = String(Math.floor(1e8 + r() * 89e8));
    const status = r() < 0.93 ? "completado" : "fallido";
    const cost = round(pkg.cost * 0.98);
    orders.push({ id: "", date: t, pkg: pkg.id, playerId: pid, nick: nickFor(pid), cost, price: pkg.suggested, status });
  }
  orders.sort((a, b) => b.date - a.date);
  orders.forEach((o, i) => (o.id = "R-" + (10480 + orders.length - i)));

  orders.forEach((o) => {
    movements.push({ date: o.date, concept: `Recarga ${o.id} · ${PKG(o.pkg).name}`, amount: -o.cost, status: "aplicado" });
    if (o.status === "fallido") movements.push({ date: o.date + 90000, concept: `Reembolso ${o.id}`, amount: o.cost, status: "aplicado" });
  });
  [[9, 300, "Transferencia bancaria"], [6, 150, "USDT (TRC20)"], [3, 100, "Mercado Pago"], [1, 80, "Transferencia bancaria"]].forEach(([d, amt, m]) =>
    movements.push({ date: startOfDay() - d * DAY + 9 * 36e5, concept: `Depósito · ${m}`, amount: amt, status: "aplicado" })
  );
  movements.sort((a, b) => b.date - a.date);

  const clients = orders.slice(0, 5).map((o, i) => ({
    id: "C" + (i + 1), name: ["Carlos M.", "Ana R.", "Grupo Clan Fénix", "Luis P.", "Sofía G."][i],
    playerId: o.playerId, nick: o.nick, phone: "+52 55 " + (1000 + i * 1371) + " " + (2000 + i * 913), note: i === 2 ? "Compra cada semana" : "",
  }));

  return {
    session: false,
    user: { name: "Jesús Díaz", storeName: "Recargas Jesús", email: "demo@levelup.store", phone: "+52 55 1234 5678" },
    balance: 152.4,
    nextId: 10481 + orders.length,
    orders, movements, clients,
    prices: {},
    tickets: [
      { id: "T-207", date: now - 2 * DAY, subject: "Recarga no llegó al jugador", order: orders[8]?.id ?? "", status: "respondido", msg: "El cliente dice que no le llegaron los diamantes." },
      { id: "T-198", date: now - 8 * DAY, subject: "¿Cómo subir a nivel Oro?", order: "", status: "cerrado", msg: "Quiero saber cuánto me falta." },
    ],
    notifs: [
      { id: 1, date: now - 36e5, text: "🎉 Promo: 5 % extra en paquetes de 2180 💎 este fin de semana", read: false },
      { id: 2, date: now - 2 * DAY, text: "💬 Soporte respondió tu ticket T-207", read: false },
      { id: 3, date: now - 3 * DAY, text: "✅ Depósito de $100.00 aprobado", read: true },
    ],
    api: { key: genKey(), webhook: "", ips: "" },
    settings: { notifWhatsapp: true, notifEmail: false, notifLowBalance: true, lowBalance: 20, twofa: false, sound: true },
  };
}

function genKey() {
  const hex = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "lu_live_" + hex;
}

let state = store.get(KEY) || seedState();
const save = () => store.set(KEY, state);

// Pedidos que quedaron "procesando" al recargar la página
state.orders.filter((o) => o.status === "procesando").forEach((o) => setTimeout(() => finishOrder(o.id), 1500));

// Depósitos que quedaron "en revisión" al recargar la página
state.movements.filter((m) => m.status === "revision").forEach((m) => setTimeout(() => approveDeposit(m.date), 2000));

function approveDeposit(date) {
  const mv = state.movements.find((x) => x.date === date && x.status === "revision");
  if (!mv) return;
  mv.status = "aplicado";
  state.balance = round(state.balance + mv.amount);
  notify(`✅ Depósito de ${money(mv.amount)} aprobado`);
  save(); softRefresh(); toast(`💰 +${money(mv.amount)} agregado a tu saldo`);
}

// ---------- Lógica de negocio ----------
function spend30() {
  const from = Date.now() - 30 * DAY;
  return round(state.orders.filter((o) => o.status === "completado" && o.date >= from).reduce((s, o) => s + o.cost, 0));
}
function currentLevel() {
  const s = spend30();
  return [...LEVELS].reverse().find((l) => s >= l.min);
}
function nextLevel() {
  const i = LEVELS.indexOf(currentLevel());
  return LEVELS[i + 1] || null;
}
const costOf = (pkg, lvl = currentLevel()) => round(pkg.cost * (1 - lvl.disc));
const priceOf = (pkg) => state.prices[pkg.id] ?? pkg.suggested;

function notify(text) {
  state.notifs.unshift({ id: Date.now() + Math.random(), date: Date.now(), text, read: false });
  state.notifs = state.notifs.slice(0, 30);
}

function placeOrder(pkgId, playerId, nick) {
  const pkg = PKG(pkgId);
  const cost = costOf(pkg);
  if (state.balance < cost) return null;
  state.balance = round(state.balance - cost);
  const o = { id: "R-" + state.nextId++, date: Date.now(), pkg: pkgId, playerId, nick, cost, price: priceOf(pkg), status: "procesando" };
  state.orders.unshift(o);
  state.movements.unshift({ date: o.date, concept: `Recarga ${o.id} · ${pkg.name}`, amount: -cost, status: "aplicado" });
  save();
  setTimeout(() => finishOrder(o.id), 2000 + Math.random() * 2500);
  return o;
}

function finishOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o || o.status !== "procesando") return;
  const ok = Math.random() < 0.95;
  o.status = ok ? "completado" : "fallido";
  if (ok) {
    notify(`✅ ${o.id}: ${PKG(o.pkg).name} entregados a ${o.nick}`);
  } else {
    state.balance = round(state.balance + o.cost);
    state.movements.unshift({ date: Date.now(), concept: `Reembolso ${o.id}`, amount: o.cost, status: "aplicado" });
    notify(`⚠️ ${o.id} falló. Se reembolsaron ${money(o.cost)} a tu saldo`);
  }
  checkLowBalance();
  save();
  softRefresh();
}

function checkLowBalance() {
  const s = state.settings;
  if (s.notifLowBalance && state.balance < s.lowBalance && !checkLowBalance._warned) {
    notify(`🪫 Tu saldo está por debajo de ${money(s.lowBalance)}. Recarga para no quedarte sin stock`);
    checkLowBalance._warned = true;
  }
  if (state.balance >= s.lowBalance) checkLowBalance._warned = false;
}

// ---------- Router ----------
const ROUTES = [
  { group: "Principal" },
  { id: "inicio",    name: "Inicio",           ico: "🏠", view: viewInicio },
  { id: "recargar",  name: "Nueva recarga",    ico: "⚡", view: viewRecargar },
  { id: "masiva",    name: "Recarga masiva",   ico: "📦", view: viewMasiva },
  { id: "pedidos",   name: "Pedidos",          ico: "🧾", view: viewPedidos },
  { group: "Negocio" },
  { id: "billetera", name: "Billetera",        ico: "💰", view: viewBilletera },
  { id: "precios",   name: "Mis precios",      ico: "🏷️", view: viewPrecios },
  { id: "clientes",  name: "Clientes",         ico: "👥", view: viewClientes },
  { id: "niveles",   name: "Niveles",          ico: "🏅", view: viewNiveles },
  { group: "Herramientas" },
  { id: "api",       name: "API",              ico: "🔌", view: viewApi },
  { id: "soporte",   name: "Soporte",          ico: "💬", view: viewSoporte },
  { id: "ajustes",   name: "Ajustes",          ico: "⚙️", view: viewAjustes },
];
const route = () => {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES.find((r) => r.id === id) || ROUTES[1];
};
const go = (id) => (location.hash = "#/" + id);

// estado de UI (no persistente)
const ui = {
  rc: { pkg: null, playerId: "", nick: null, verifying: false, save: false },
  orders: { q: "", status: "", range: "30" },
  bulk: { text: "", rows: null },
  wallet: { amount: 50, method: "transfer" },
};

function render() {
  if (!state.session) {
    $("#login").hidden = false;
    $("#app").hidden = true;
    return;
  }
  $("#login").hidden = true;
  $("#app").hidden = false;
  const r = route();
  $("#nav").innerHTML = ROUTES.map((x) =>
    x.group
      ? `<div class="nav-group">${x.group}</div>`
      : `<a class="nav-link ${x.id === r.id ? "active" : ""}" href="#/${x.id}"><span class="ico">${x.ico}</span>${x.name}</a>`
  ).join("");
  $("#pageTitle").textContent = r.name;
  document.title = `${r.name} · LevelUp Recargas`;
  $("#view").innerHTML = r.view();
  renderChrome();
  $("#sidebar").classList.remove("open");
  r.after?.();
}

function renderChrome() {
  $("#topBalance").textContent = "💰 " + money(state.balance);
  $("#avatar").textContent = state.user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const lvl = currentLevel();
  const nxt = nextLevel();
  $("#sideLevel").innerHTML = `
    <div class="muted small">Tu nivel</div>
    <b>🏅 ${lvl.name}</b> <span class="muted small">(-${lvl.disc * 100}%)</span>
    ${nxt ? `<div class="progress" style="margin-top:8px"><i style="width:${Math.min(100, ((spend30() - lvl.min) / (nxt.min - lvl.min)) * 100)}%"></i></div>
    <div class="muted small" style="margin-top:4px">${money(nxt.min - spend30())} para ${nxt.name}</div>` : ""}`;
  const unread = state.notifs.filter((n) => !n.read).length;
  $("#notifCount").hidden = !unread;
  $("#notifCount").textContent = unread;
  if (!$("#notifPanel").hidden) renderNotifs();
}

function renderNotifs() {
  $("#notifPanel").innerHTML = `
    <div class="notif-head"><b>Notificaciones</b><a href="#" class="link small" data-action="read-all">Marcar leídas</a></div>
    ${state.notifs.length ? state.notifs.map((n) => `<div class="notif ${n.read ? "" : "unread"}">${esc(n.text)}<small>${fmtDate(n.date)}</small></div>`).join("") : '<p class="empty">Sin notificaciones</p>'}`;
}

// Re-render sin perder lo que el usuario está escribiendo
function softRefresh() {
  renderChrome();
  const r = route();
  const typing = document.activeElement?.closest?.("#view") && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (["inicio", "pedidos", "billetera", "niveles"].includes(r.id) && (!typing || r.id === "pedidos")) {
    if (r.id === "pedidos") { $("#ordersTable") && ($("#ordersTable").innerHTML = ordersTable()); }
    else $("#view").innerHTML = r.view();
  }
  if (r.id === "recargar") updateRecharge();
}

// ---------- Componentes ----------
const badge = (s) => {
  const label = { completado: "Completado", procesando: "Procesando", fallido: "Fallido", aplicado: "Aplicado", revision: "En revisión", rechazado: "Rechazado", abierto: "Abierto", respondido: "Respondido", cerrado: "Cerrado" }[s] || s;
  return `<span class="badge b-${s}">${label}</span>`;
};
const kpi = (label, value, sub = "", hl = false) => `<div class="card kpi ${hl ? "hl" : ""}"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;

function chart7() {
  const days = [...Array(7)].map((_, i) => startOfDay() - (6 - i) * DAY);
  const data = days.map((d) => {
    const os = state.orders.filter((o) => o.status === "completado" && o.date >= d && o.date < d + DAY);
    return { d, sales: round(os.reduce((s, o) => s + o.price, 0)), profit: round(os.reduce((s, o) => s + o.price - o.cost, 0)) };
  });
  const max = Math.max(10, ...data.map((x) => x.sales));
  const W = 560, H = 220, pad = 30, bw = (W - pad) / 7;
  const bars = data.map((x, i) => {
    const h = (x.sales / max) * (H - 50);
    const ph = (x.profit / max) * (H - 50);
    const xPos = pad + i * bw + bw * 0.2;
    return `
      <rect class="bar" x="${xPos}" y="${H - 24 - h}" width="${bw * 0.6}" height="${h}" rx="5"><title>${fmtDay(x.d)} · Ventas ${money(x.sales)} · Ganancia ${money(x.profit)}</title></rect>
      <rect x="${xPos}" y="${H - 24 - ph}" width="${bw * 0.6}" height="${ph}" rx="5" fill="#2fd47a" opacity=".85" pointer-events="none"></rect>
      <text x="${xPos + bw * 0.3}" y="${H - 6}" text-anchor="middle">${fmtDay(x.d)}</text>`;
  }).join("");
  const grid = [0, 0.5, 1].map((f) => {
    const y = H - 24 - f * (H - 50);
    return `<line class="gl" x1="${pad}" x2="${W}" y1="${y}" y2="${y}"/><text x="0" y="${y + 4}">$${Math.round(max * f)}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" >${grid}${bars}</svg>
    <div class="inline small muted"><span style="color:var(--primary)">■</span> Ventas <span style="color:var(--ok);margin-left:10px">■</span> Ganancia</div>`;
}

function orderRows(list, actions = true) {
  if (!list.length) return `<tr><td colspan="9" class="empty">No hay pedidos</td></tr>`;
  return list.map((o) => `
    <tr>
      <td class="mono">${o.id}</td>
      <td>${fmtDate(o.date)}</td>
      <td>${PKG(o.pkg).ico} ${PKG(o.pkg).name}</td>
      <td><b>${esc(o.nick)}</b><div class="muted small mono">${o.playerId}</div></td>
      <td>${money(o.cost)}</td>
      <td>${money(o.price)}</td>
      <td class="${o.status === "completado" ? "ok" : "muted"}">${o.status === "completado" ? "+" + money(o.price - o.cost) : "—"}</td>
      <td>${badge(o.status)}</td>
      ${actions ? `<td><div class="inline">
        <button class="btn btn-ghost btn-sm" data-action="receipt" data-id="${o.id}" ${o.status !== "completado" ? "disabled" : ""}>Comprobante</button>
        <button class="btn btn-ghost btn-sm" data-action="repeat" data-id="${o.id}">Repetir</button>
      </div></td>` : ""}
    </tr>`).join("");
}

// =========================================================
//                        VISTAS
// =========================================================

function viewInicio() {
  const today = startOfDay();
  const todays = state.orders.filter((o) => o.date >= today && o.status === "completado");
  const sales = todays.reduce((s, o) => s + o.price, 0);
  const profit = todays.reduce((s, o) => s + o.price - o.cost, 0);
  const lvl = currentLevel(), nxt = nextLevel(), s30 = spend30();
  const pct = nxt ? Math.min(100, ((s30 - lvl.min) / (nxt.min - lvl.min)) * 100) : 100;
  const top = ["ff-100", "ff-520", "ff-1060", "ff-semanal"].map(PKG);

  return `
    <div class="kpis">
      ${kpi("Saldo disponible", money(state.balance), `<a href="#/billetera" class="link">+ Agregar saldo</a>`, true)}
      ${kpi("Ventas de hoy", money(sales), `${todays.length} recargas completadas`)}
      ${kpi("Ganancia de hoy", `<span class="ok">${money(profit)}</span>`, sales ? `Margen ${Math.round((profit / sales) * 100)} %` : "Aún sin ventas hoy")}
      ${kpi("Compras (30 días)", money(s30), `Nivel ${lvl.name}`)}
    </div>

    <div class="grid-3-1">
      <div class="card panel">
        <div class="panel-head"><h2>Ventas de los últimos 7 días</h2></div>
        ${chart7()}
      </div>
      <div class="card panel">
        <h2>🏅 Nivel ${lvl.name}</h2>
        <p class="muted small">Descuento actual: <b class="accent">-${lvl.disc * 100}%</b> en todos los paquetes</p>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <p class="small">${nxt ? `Compra <b>${money(nxt.min - s30)}</b> más en 30 días para subir a <b>${nxt.name}</b> (-${nxt.disc * 100}%)` : "¡Estás en el nivel máximo! 🎉"}</p>
        <a href="#/niveles" class="btn btn-ghost btn-sm">Ver beneficios</a>
      </div>
    </div>

    <div class="card panel">
      <div class="panel-head"><h2>⚡ Recarga rápida</h2><a href="#/recargar" class="link small">Ver todos los paquetes →</a></div>
      <div class="pkgs">
        ${top.map((p) => `
          <button class="pkg" data-action="quick" data-pkg="${p.id}">
            <span class="p-ico">${p.ico}</span><b>${p.name}</b>
            <span class="p-cost">${money(costOf(p))}</span>
            <small>Vendes a ${money(priceOf(p))}</small>
          </button>`).join("")}
      </div>
    </div>

    <div class="card panel">
      <div class="panel-head"><h2>Últimos pedidos</h2><a href="#/pedidos" class="link small">Ver todos →</a></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Pedido</th><th>Fecha</th><th>Paquete</th><th>Jugador</th><th>Costo</th><th>Venta</th><th>Ganancia</th><th>Estado</th></tr></thead>
        <tbody>${orderRows(state.orders.slice(0, 6), false)}</tbody>
      </table></div>
    </div>`;
}

// ---------- Nueva recarga ----------
function viewRecargar() {
  const rc = ui.rc;
  const clientOpts = state.clients.map((c) => `<option value="${c.id}">${esc(c.name)} · ${c.playerId}</option>`).join("");
  return `
    <div class="grid-1-2">
      <div class="card panel">
        <h2>1. Juego</h2>
        <div class="games">
          ${GAMES.map((g) => `<button class="game ${g.active ? "active" : ""}" ${g.active ? "" : "disabled"}><span class="g-ico">${g.ico}</span>${g.name}${g.active ? "" : " <em>Pronto</em>"}</button>`).join("")}
        </div>

        <h2>2. Paquete</h2>
        <div class="pkgs" id="pkgGrid">
          ${PACKAGES.map((p) => `
            <button class="pkg ${rc.pkg === p.id ? "sel" : ""}" data-action="pick-pkg" data-pkg="${p.id}">
              <span class="p-ico">${p.ico}</span><b>${p.name}</b>
              <span class="p-cost">${money(costOf(p))}</span>
              <small>Ganas ${money(priceOf(p) - costOf(p))}</small>
            </button>`).join("")}
        </div>

        <h2>3. Jugador</h2>
        <div class="form">
          ${state.clients.length ? `<label>Cliente guardado (opcional)
            <select data-action="pick-client"><option value="">— Elegir cliente —</option>${clientOpts}</select></label>` : ""}
          <label>ID de jugador de Free Fire
            <div class="inline">
              <input id="rcId" inputmode="numeric" placeholder="Ej: 123456789" value="${esc(rc.playerId)}" maxlength="12">
              <button class="btn btn-ghost" data-action="verify-id">Verificar</button>
            </div>
          </label>
          <div class="nick-box" id="nickBox"></div>
          <label class="inline small" style="color:var(--text)"><input type="checkbox" id="rcSave" ${rc.save ? "checked" : ""}> Guardar como cliente</label>
        </div>
      </div>

      <div class="card panel" style="position:sticky;top:86px">
        <h2>Resumen</h2>
        <div id="rcSummary" class="summary"></div>
        <div class="note">💡 Verifica siempre el ID: las recargas a un ID equivocado <b>no se pueden revertir</b>.</div>
      </div>
    </div>`;
}
ROUTES.find((r) => r.id === "recargar").after = updateRecharge;

function updateRecharge() {
  const rc = ui.rc;
  const nb = $("#nickBox");
  if (!nb) return;
  nb.innerHTML = rc.verifying ? '<span class="muted">⏳ Verificando…</span>'
    : rc.nick ? `<span class="ok">✔ Jugador encontrado: <b>${esc(rc.nick)}</b></span>`
    : rc.playerId && !validId(rc.playerId) ? '<span class="bad">El ID debe tener entre 6 y 12 dígitos</span>'
    : '<span class="muted small">Pulsa "Verificar" para confirmar el nombre del jugador</span>';

  const p = rc.pkg && PKG(rc.pkg);
  const cost = p ? costOf(p) : 0;
  const enough = state.balance >= cost;
  const ready = p && rc.nick && enough;
  $("#rcSummary").innerHTML = `
    <div class="sum-line"><span class="muted">Juego</span><span>🔥 Free Fire</span></div>
    <div class="sum-line"><span class="muted">Paquete</span><span>${p ? p.ico + " " + p.name : "—"}</span></div>
    <div class="sum-line"><span class="muted">Jugador</span><span>${rc.nick ? esc(rc.nick) + ` <span class="muted mono">(${rc.playerId})</span>` : "—"}</span></div>
    <div class="sum-line"><span class="muted">Precio de venta</span><span>${p ? money(priceOf(p)) : "—"}</span></div>
    <div class="sum-line"><span class="muted">Tu ganancia</span><span class="ok">${p ? "+" + money(priceOf(p) - cost) : "—"}</span></div>
    <div class="sum-line total"><span>Se descuenta de tu saldo</span><span>${p ? money(cost) : "—"}</span></div>
    <div class="sum-line small"><span class="muted">Saldo después</span><span class="${enough ? "" : "bad"}">${money(state.balance - cost)}</span></div>
    ${p && !enough ? `<div class="note warn">Saldo insuficiente. <a href="#/billetera" class="link">Agregar saldo</a></div>` : ""}
    <button class="btn btn-primary full" data-action="confirm-recharge" ${ready ? "" : "disabled"}>⚡ Confirmar recarga</button>`;
}

// ---------- Recarga masiva ----------
function viewMasiva() {
  const rows = ui.bulk.rows;
  const valid = rows?.filter((r) => r.ok) ?? [];
  const total = round(valid.reduce((s, r) => s + costOf(PKG(r.pkg)), 0));
  return `
    <div class="grid-1-2">
      <div class="card panel">
        <h2>Pega tus pedidos</h2>
        <p class="muted small">Un pedido por línea con el formato <span class="mono">ID_JUGADOR, PAQUETE</span>. Paquetes válidos:
          ${PACKAGES.map((p) => `<span class="mono accent">${p.code}</span>`).join(", ")}</p>
        <textarea id="bulkText" placeholder="123456789, 520&#10;987654321, 100&#10;555666777, semanal">${esc(ui.bulk.text)}</textarea>
        <div class="inline">
          <button class="btn btn-ghost" data-action="bulk-validate">Validar pedidos</button>
          <button class="btn btn-ghost" data-action="bulk-example">Pegar ejemplo</button>
        </div>
      </div>
      <div class="card panel">
        <h2>Resumen</h2>
        <div class="summary">
          <div class="sum-line"><span class="muted">Pedidos válidos</span><b>${valid.length}</b></div>
          <div class="sum-line"><span class="muted">Con errores</span><b class="${rows && rows.length - valid.length ? "bad" : ""}">${rows ? rows.length - valid.length : 0}</b></div>
          <div class="sum-line total"><span>Total a descontar</span><span>${money(total)}</span></div>
          <div class="sum-line small"><span class="muted">Tu saldo</span><span class="${state.balance >= total ? "" : "bad"}">${money(state.balance)}</span></div>
        </div>
        <button class="btn btn-primary full" data-action="bulk-run" ${valid.length && state.balance >= total ? "" : "disabled"}>📦 Procesar ${valid.length} recargas</button>
        <div class="note">Los pedidos se procesan en orden. Si un pedido falla, el saldo se reembolsa automáticamente.</div>
      </div>
    </div>
    ${rows ? `<div class="card panel"><h2>Vista previa</h2><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Línea</th><th>Jugador</th><th>Paquete</th><th>Costo</th><th>Estado</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>
        <td>${i + 1}</td><td class="mono">${esc(r.raw)}</td>
        <td>${r.ok ? `<b>${esc(r.nick)}</b> <span class="muted mono">${r.playerId}</span>` : "—"}</td>
        <td>${r.pkg ? PKG(r.pkg).name : "—"}</td>
        <td>${r.pkg ? money(costOf(PKG(r.pkg))) : "—"}</td>
        <td>${r.ok ? '<span class="ok">✔ Válido</span>' : `<span class="bad">✕ ${r.err}</span>`}</td>
      </tr>`).join("")}</tbody></table></div></div>` : ""}`;
}

function parseBulk(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200).map((raw) => {
    const [id, code] = raw.split(/[,;\t ]+/);
    const pkg = PACKAGES.find((p) => p.code === String(code || "").toLowerCase());
    if (!validId(id)) return { raw, ok: false, err: "ID inválido" };
    if (!pkg) return { raw, ok: false, err: "Paquete no existe", playerId: id };
    return { raw, ok: true, playerId: id, nick: nickFor(id), pkg: pkg.id };
  });
}

// ---------- Pedidos ----------
function filteredOrders() {
  const { q, status, range } = ui.orders;
  const from = range === "all" ? 0 : range === "today" ? startOfDay() : Date.now() - Number(range) * DAY;
  const qq = q.trim().toLowerCase();
  return state.orders.filter((o) =>
    o.date >= from && (!status || o.status === status) &&
    (!qq || [o.id, o.playerId, o.nick, PKG(o.pkg).name].join(" ").toLowerCase().includes(qq))
  );
}
function ordersTable() {
  const list = filteredOrders();
  const done = list.filter((o) => o.status === "completado");
  const sales = done.reduce((s, o) => s + o.price, 0), profit = done.reduce((s, o) => s + o.price - o.cost, 0);
  return `
    <p class="muted small">${list.length} pedidos · Ventas <b style="color:var(--text)">${money(sales)}</b> · Ganancia <b class="ok">${money(profit)}</b></p>
    <div class="table-wrap"><table>
      <thead><tr><th>Pedido</th><th>Fecha</th><th>Paquete</th><th>Jugador</th><th>Costo</th><th>Venta</th><th>Ganancia</th><th>Estado</th><th></th></tr></thead>
      <tbody>${orderRows(list.slice(0, 100))}</tbody>
    </table></div>`;
}
function viewPedidos() {
  const f = ui.orders;
  return `
    <div class="card panel">
      <div class="filters">
        <input type="search" data-filter="q" placeholder="Buscar por pedido, ID de jugador o nombre…" value="${esc(f.q)}">
        <select data-filter="status">
          <option value="">Todos los estados</option>
          ${["completado", "procesando", "fallido"].map((s) => `<option value="${s}" ${f.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
        </select>
        <select data-filter="range">
          ${[["today", "Hoy"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["all", "Todo"]].map(([v, l]) => `<option value="${v}" ${f.range === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
        <button class="btn btn-ghost" data-action="export-orders">⬇ Exportar CSV</button>
      </div>
      <div id="ordersTable">${ordersTable()}</div>
    </div>`;
}

// ---------- Billetera ----------
function viewBilletera() {
  const w = ui.wallet;
  const m = METHODS.find((x) => x.id === w.method);
  const fee = round(w.amount * m.fee);
  const pending = state.movements.filter((x) => x.status === "revision");
  return `
    <div class="grid-1-2">
      <div class="card panel">
        <h2>Agregar saldo</h2>
        <form class="form" data-form="deposit">
          <label>Monto (USD)
            <input type="number" name="amount" min="10" step="1" value="${w.amount}" data-wallet="amount" required>
          </label>
          <div class="chips">${[20, 50, 100, 250, 500].map((v) => `<button type="button" class="chip ${w.amount == v ? "active" : ""}" data-action="amount" data-v="${v}">$${v}</button>`).join("")}</div>
          <div class="methods">
            ${METHODS.map((x) => `<label class="method"><input type="radio" name="method" value="${x.id}" ${x.id === w.method ? "checked" : ""} data-wallet="method">
              <span>${x.ico}</span><span>${x.name}<small>${x.note}</small></span></label>`).join("")}
          </div>
          <div class="note" id="payInfo">${payInfo(m)}</div>
          <label>Número de referencia / hash de la transacción<input name="ref" required placeholder="Ej: 0045879631"></label>
          <label>Comprobante (imagen o PDF)<input type="file" name="proof" accept="image/*,.pdf"></label>
          <div class="summary" id="depSummary">${depSummary(w.amount, fee)}</div>
          <button class="btn btn-primary" type="submit">Enviar solicitud de depósito</button>
        </form>
      </div>

      <div style="display:grid;gap:20px">
        <div class="card panel">
          <span class="muted">Saldo disponible</span>
          <div class="big-num">${money(state.balance)}</div>
          ${pending.length ? `<p class="small" style="color:var(--warn)">⏳ ${pending.length} depósito(s) en revisión por ${money(pending.reduce((s, x) => s + x.amount, 0))}</p>` : ""}
        </div>
        <div class="card panel">
          <h2>Movimientos</h2>
          <div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Estado</th></tr></thead>
            <tbody>${state.movements.slice(0, 25).map((x) => `<tr>
              <td>${fmtDate(x.date)}</td><td>${esc(x.concept)}</td>
              <td class="${x.amount > 0 ? "ok" : ""}">${x.amount > 0 ? "+" : ""}${money(x.amount)}</td>
              <td>${badge(x.status)}</td></tr>`).join("")}</tbody>
          </table></div>
        </div>
      </div>
    </div>`;
}
const payInfo = (m) => ({
  transfer: "🏦 <b>Banco Ejemplo</b> · Cuenta: 0123 4567 8901 2345 · Titular: LevelUp Store SA",
  mp: "💳 Envía a <b>pagos@levelup.store</b> desde tu app de Mercado Pago",
  usdt: '🪙 Dirección TRC20: <span class="mono">TXyZ…demo…9kLm</span> · Solo red TRON',
  paypal: "🅿️ Envía como <b>Amigos y familiares</b> a pagos@levelup.store",
}[m.id]);
const depSummary = (amount, fee) => `
  <div class="sum-line"><span class="muted">Monto</span><span>${money(amount || 0)}</span></div>
  <div class="sum-line"><span class="muted">Comisión del método</span><span>${money(fee)}</span></div>
  <div class="sum-line total"><span>Recibirás en saldo</span><span class="ok">${money((amount || 0) - fee)}</span></div>`;

function updateWallet() {
  const m = METHODS.find((x) => x.id === ui.wallet.method);
  $("#payInfo").innerHTML = payInfo(m);
  $("#depSummary").innerHTML = depSummary(ui.wallet.amount, round(ui.wallet.amount * m.fee));
  $$(".chip[data-v]").forEach((c) => c.classList.toggle("active", Number(c.dataset.v) === ui.wallet.amount));
}

// ---------- Mis precios ----------
function viewPrecios() {
  const lvl = currentLevel();
  return `
    <div class="card panel">
      <div class="panel-head">
        <div><h2>Lista de precios</h2><p class="muted small">Tu costo con nivel <b>${lvl.name}</b> y el precio al que vendes a tus clientes. Edita la columna "Tu precio".</p></div>
        <div class="inline">
          <button class="btn btn-ghost btn-sm" data-action="reset-prices">Restablecer sugeridos</button>
          <button class="btn btn-primary btn-sm" data-action="copy-prices">📲 Copiar para WhatsApp</button>
        </div>
      </div>
      <div class="inline small" style="flex-wrap:wrap">
        <span class="muted">Aplicar margen sobre tu costo:</span>
        ${[20, 30, 40, 50].map((v) => `<button class="chip" data-action="margin" data-v="${v}">+${v}%</button>`).join("")}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Paquete</th><th>Tu costo</th><th>Sugerido</th><th>Tu precio</th><th>Ganancia</th><th>Margen</th></tr></thead>
        <tbody>${PACKAGES.map((p) => priceRow(p)).join("")}</tbody>
      </table></div>
    </div>`;
}
function priceRow(p) {
  const c = costOf(p), v = priceOf(p), g = v - c;
  return `<tr data-row="${p.id}">
    <td>${p.ico} <b>${p.name}</b></td>
    <td>${money(c)}</td>
    <td class="muted">${money(p.suggested)}</td>
    <td><input type="number" step="0.01" min="0" value="${v.toFixed(2)}" data-price="${p.id}"></td>
    <td class="${g >= 0 ? "ok" : "bad"}" data-gain>${money(g)}</td>
    <td data-margin>${c ? Math.round((g / c) * 100) : 0} %</td>
  </tr>`;
}

// ---------- Clientes ----------
function viewClientes() {
  const stats = (c) => {
    const os = state.orders.filter((o) => o.playerId === c.playerId && o.status === "completado");
    return { n: os.length, total: os.reduce((s, o) => s + o.price, 0), last: os[0]?.date };
  };
  return `
    <div class="grid-1-2">
      <div class="card panel">
        <h2>Mis clientes</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Cliente</th><th>ID jugador</th><th>WhatsApp</th><th>Recargas</th><th>Total</th><th></th></tr></thead>
          <tbody>${state.clients.length ? state.clients.map((c) => { const s = stats(c); return `<tr>
            <td><b>${esc(c.name)}</b>${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ""}</td>
            <td><span class="mono">${c.playerId}</span><div class="muted small">${esc(c.nick)}</div></td>
            <td>${c.phone ? `<a class="link" target="_blank" rel="noopener" href="https://wa.me/${c.phone.replace(/\D/g, "")}">${esc(c.phone)}</a>` : "—"}</td>
            <td>${s.n}</td><td>${money(s.total)}</td>
            <td><div class="inline">
              <button class="btn btn-primary btn-sm" data-action="recharge-client" data-id="${c.id}">⚡ Recargar</button>
              <button class="btn btn-danger btn-sm" data-action="del-client" data-id="${c.id}">✕</button>
            </div></td></tr>`; }).join("") : `<tr><td colspan="6" class="empty">Aún no tienes clientes guardados</td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="card panel">
        <h2>Agregar cliente</h2>
        <form class="form" data-form="client">
          <label>Nombre<input name="name" required maxlength="40"></label>
          <label>ID de jugador<input name="playerId" required inputmode="numeric" pattern="\\d{6,12}" title="Entre 6 y 12 dígitos"></label>
          <label>WhatsApp<input name="phone" placeholder="+52 55 1234 5678"></label>
          <label>Nota<input name="note" maxlength="60" placeholder="Ej: paga por transferencia"></label>
          <button class="btn btn-primary" type="submit">Guardar cliente</button>
        </form>
      </div>
    </div>`;
}

// ---------- Niveles ----------
function viewNiveles() {
  const lvl = currentLevel(), nxt = nextLevel(), s30 = spend30();
  return `
    <div class="card panel">
      <h2>Tu progreso</h2>
      <p class="muted">Has comprado <b style="color:var(--text)">${money(s30)}</b> en los últimos 30 días.
        ${nxt ? `Te faltan <b class="accent">${money(nxt.min - s30)}</b> para subir a <b>${nxt.name}</b>.` : "Estás en el nivel máximo."}</p>
      <div class="progress"><i style="width:${nxt ? Math.min(100, ((s30 - lvl.min) / (nxt.min - lvl.min)) * 100) : 100}%"></i></div>
    </div>
    <div class="tiers">
      ${LEVELS.map((l) => `
        <div class="card tier ${l.id === lvl.id ? "current" : ""}">
          ${l.id === lvl.id ? '<span class="badge b-completado tag">Tu nivel</span>' : ""}
          <h3>${l.name}</h3>
          <div class="disc">${l.disc ? "-" + l.disc * 100 + "%" : "Base"}</div>
          <p class="muted small">${l.min ? `Desde ${money(l.min)} / 30 días` : "Al registrarte"}</p>
          <ul>${l.perks.map((p) => `<li>${p}</li>`).join("")}</ul>
        </div>`).join("")}
    </div>
    <div class="card panel">
      <h2>Costo por nivel</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Paquete</th>${LEVELS.map((l) => `<th>${l.name}</th>`).join("")}</tr></thead>
        <tbody>${PACKAGES.map((p) => `<tr><td>${p.ico} ${p.name}</td>${LEVELS.map((l) => `<td class="${l.id === lvl.id ? "accent" : ""}">${money(costOf(p, l))}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
    </div>`;
}

// ---------- API ----------
function viewApi() {
  const lvl = currentLevel();
  const locked = LEVELS.indexOf(lvl) < 2;
  const k = state.api.key;
  return `
    ${locked ? `<div class="note warn">🔒 La API está disponible desde el nivel <b>Oro</b>. Puedes ver la documentación, pero la clave se activará cuando subas de nivel.</div>` : ""}
    <div class="grid-2">
      <div class="card panel">
        <h2>Clave de API</h2>
        <p class="muted small">Conecta tu propia web o bot de WhatsApp/Telegram para hacer recargas automáticas.</p>
        <div class="inline">
          <input class="mono" id="apiKey" readonly value="${k.slice(0, 12)}${"•".repeat(20)}">
          <button class="btn btn-ghost btn-sm" data-action="show-key">👁</button>
          <button class="btn btn-ghost btn-sm" data-action="copy-key">Copiar</button>
        </div>
        <button class="btn btn-danger btn-sm" data-action="regen-key" style="justify-self:start">Regenerar clave</button>
        <form class="form" data-form="api">
          <label>Webhook (te avisamos cuando un pedido cambia de estado)<input name="webhook" type="url" placeholder="https://tutienda.com/webhook" value="${esc(state.api.webhook)}"></label>
          <label>IPs permitidas (separadas por coma)<input name="ips" placeholder="203.0.113.10, 198.51.100.4" value="${esc(state.api.ips)}"></label>
          <button class="btn btn-primary" type="submit" style="justify-self:start">Guardar</button>
        </form>
      </div>
      <div class="card panel">
        <h2>Endpoints</h2>
        <div>
          <div class="endpoint"><span class="method-tag m-get">GET</span><span class="mono">/v1/balance</span><span class="muted small">Saldo disponible</span></div>
          <div class="endpoint"><span class="method-tag m-get">GET</span><span class="mono">/v1/products</span><span class="muted small">Paquetes y tu costo</span></div>
          <div class="endpoint"><span class="method-tag m-get">GET</span><span class="mono">/v1/players/{id}</span><span class="muted small">Verificar ID de jugador</span></div>
          <div class="endpoint"><span class="method-tag m-post">POST</span><span class="mono">/v1/orders</span><span class="muted small">Crear recarga</span></div>
          <div class="endpoint"><span class="method-tag m-get">GET</span><span class="mono">/v1/orders/{id}</span><span class="muted small">Estado de un pedido</span></div>
        </div>
        <h3>Ejemplo</h3>
<pre>curl -X POST https://api.levelup.store/v1/orders \\
  -H "Authorization: Bearer ${k.slice(0, 12)}…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "product": "ff-520",
    "player_id": "123456789",
    "reference": "mi-pedido-001"
  }'

# Respuesta
{
  "id": "R-10532",
  "status": "procesando",
  "cost": 4.12,
  "nick": "ElPro_MX"
}</pre>
      </div>
    </div>`;
}

// ---------- Soporte ----------
function viewSoporte() {
  return `
    <div class="grid-2">
      <div class="card panel">
        <h2>Nuevo ticket</h2>
        <form class="form" data-form="ticket">
          <label>Motivo
            <select name="subject" required>
              <option>Recarga no llegó al jugador</option>
              <option>Problema con un depósito</option>
              <option>Error en el ID de jugador</option>
              <option>Consulta sobre niveles o precios</option>
              <option>Problema con la API</option>
              <option>Otro</option>
            </select>
          </label>
          <label>Pedido relacionado (opcional)
            <select name="order"><option value="">— Ninguno —</option>${state.orders.slice(0, 30).map((o) => `<option>${o.id}</option>`).join("")}</select>
          </label>
          <label>Mensaje<textarea name="msg" required style="min-height:110px;font-family:inherit" placeholder="Cuéntanos qué pasó…"></textarea></label>
          <button class="btn btn-primary" type="submit">Enviar ticket</button>
        </form>
      </div>
      <div style="display:grid;gap:20px;align-content:start">
        <div class="card panel">
          <h2>Contacto directo</h2>
          <div class="card contact"><span class="c-ico">💬</span><div><b>WhatsApp</b><div class="muted small">+52 55 0000 0000 · Respuesta en ~10 min</div></div></div>
          <div class="card contact"><span class="c-ico">✈️</span><div><b>Telegram</b><div class="muted small">@levelup_soporte</div></div></div>
          <div class="card contact"><span class="c-ico">🕐</span><div><b>Horario</b><div class="muted small">Lunes a domingo · 8:00 a 24:00</div></div></div>
        </div>
        <div class="card panel">
          <h2>Mis tickets</h2>
          <div class="table-wrap"><table>
            <thead><tr><th>Ticket</th><th>Asunto</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>${state.tickets.map((t) => `<tr><td class="mono">${t.id}</td><td>${esc(t.subject)}${t.order ? ` <span class="muted small">(${t.order})</span>` : ""}</td><td>${fmtDate(t.date)}</td><td>${badge(t.status)}</td></tr>`).join("")}</tbody>
          </table></div>
        </div>
      </div>
    </div>
    <div class="card panel">
      <h2>Preguntas frecuentes</h2>
      ${[
        ["¿Cuánto tarda una recarga?", "Normalmente entre 5 segundos y 2 minutos. Si pasa de 15 minutos, abre un ticket con el número de pedido."],
        ["¿Qué pasa si una recarga falla?", "El saldo se reembolsa automáticamente a tu billetera y recibes una notificación."],
        ["¿Puedo cancelar una recarga a un ID equivocado?", "No. Una vez entregados, los diamantes no se pueden recuperar. Verifica siempre el nombre del jugador antes de confirmar."],
        ["¿Cómo subo de nivel?", "Tu nivel se calcula con lo que compraste en los últimos 30 días. Se actualiza automáticamente."],
      ].map(([q, a]) => `<details class="card" style="padding:14px 16px"><summary style="cursor:pointer;font-weight:600">${q}</summary><p class="muted" style="margin-top:8px">${a}</p></details>`).join("")}
    </div>`;
}

// ---------- Ajustes ----------
function viewAjustes() {
  const u = state.user, s = state.settings;
  const tg = (k, label, desc) => `<label class="toggle-row"><span>${label}<div class="muted small">${desc}</div></span>
    <span class="switch"><input type="checkbox" data-setting="${k}" ${s[k] ? "checked" : ""}><span></span></span></label>`;
  return `
    <div class="grid-2">
      <div class="card panel">
        <h2>Perfil y tienda</h2>
        <form class="form" data-form="profile">
          <label>Nombre<input name="name" value="${esc(u.name)}" required></label>
          <label>Nombre de tu tienda <span class="muted">(aparece en comprobantes y listas de precios)</span><input name="storeName" value="${esc(u.storeName)}" required></label>
          <div class="row">
            <label>Correo<input name="email" type="email" value="${esc(u.email)}" required></label>
            <label>WhatsApp<input name="phone" value="${esc(u.phone)}"></label>
          </div>
          <button class="btn btn-primary" type="submit" style="justify-self:start">Guardar cambios</button>
        </form>
      </div>
      <div class="card panel">
        <h2>Notificaciones</h2>
        <div>
          ${tg("notifWhatsapp", "Avisos por WhatsApp", "Pedidos completados y fallidos")}
          ${tg("notifEmail", "Avisos por correo", "Resumen diario de ventas")}
          ${tg("notifLowBalance", "Alerta de saldo bajo", `Cuando tu saldo baje de ${money(s.lowBalance)}`)}
          ${tg("sound", "Sonido", "Al completarse una recarga")}
        </div>
        <label class="small muted" style="display:grid;gap:6px">Monto de alerta de saldo bajo
          <input type="number" min="0" step="1" value="${s.lowBalance}" data-setting="lowBalance"></label>
      </div>
      <div class="card panel">
        <h2>Seguridad</h2>
        ${tg("twofa", "Verificación en dos pasos (2FA)", "Pide un código al iniciar sesión y al retirar saldo")}
        <form class="form" data-form="password">
          <label>Contraseña actual<input type="password" name="cur" required></label>
          <div class="row">
            <label>Nueva contraseña<input type="password" name="n1" minlength="8" required></label>
            <label>Repetir<input type="password" name="n2" minlength="8" required></label>
          </div>
          <button class="btn btn-ghost" type="submit" style="justify-self:start">Cambiar contraseña</button>
        </form>
      </div>
      <div class="card panel">
        <h2>Sesión</h2>
        <p class="muted small">Este es un prototipo: los datos se guardan solo en este navegador.</p>
        <div class="inline" style="flex-wrap:wrap">
          <button class="btn btn-ghost" data-action="logout">Cerrar sesión</button>
          <button class="btn btn-danger" data-action="reset-demo">Restablecer datos de demostración</button>
        </div>
      </div>
    </div>`;
}

// =========================================================
//                       MODALES
// =========================================================
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
function closeModal() { $("#modal").hidden = true; }

function receiptText(o) {
  return `✅ *Recarga completada*
🏪 ${state.user.storeName}
🧾 Pedido: ${o.id}
🎮 Free Fire
👤 Jugador: ${o.nick} (ID ${o.playerId})
${PKG(o.pkg).ico} Paquete: ${PKG(o.pkg).name}
💵 Precio: ${money(o.price)}
📅 ${fmtDate(o.date)}
¡Gracias por tu compra! 🔥`;
}

function priceListText() {
  return `🔥 *${state.user.storeName}* — Recargas Free Fire 🔥

${PACKAGES.map((p) => `${p.ico} ${p.name} — *${money(priceOf(p))}*`).join("\n")}

⚡ Entrega inmediata
📲 Envíame tu *ID de jugador* para recargar
${state.user.phone ? "📞 " + state.user.phone : ""}`.trim();
}

// =========================================================
//                       EVENTOS
// =========================================================
const actions = {
  "toggle-menu": () => $("#sidebar").classList.toggle("open"),
  "toggle-notifs": () => { const p = $("#notifPanel"); p.hidden = !p.hidden; if (!p.hidden) renderNotifs(); },
  "read-all": () => { state.notifs.forEach((n) => (n.read = true)); save(); renderChrome(); renderNotifs(); },
  "close-modal": closeModal,
  "request-account": () => openModal(`
    <h3>Solicitar acceso</h3>
    <p class="muted small" style="margin-bottom:14px">Revisamos las solicitudes en menos de 24 h.</p>
    <form class="form" data-form="request">
      <label>Nombre<input required></label>
      <label>WhatsApp<input required></label>
      <label>¿Cuántas recargas vendes al mes?<select><option>Menos de 50</option><option>50 – 200</option><option>200 – 1000</option><option>Más de 1000</option></select></label>
      <button class="btn btn-primary">Enviar solicitud</button>
    </form>`),

  quick: (el) => { ui.rc.pkg = el.dataset.pkg; go("recargar"); },
  "pick-pkg": (el) => {
    ui.rc.pkg = el.dataset.pkg;
    $$("#pkgGrid .pkg").forEach((b) => b.classList.toggle("sel", b.dataset.pkg === ui.rc.pkg));
    updateRecharge();
  },
  "verify-id": () => {
    const id = $("#rcId").value.trim();
    ui.rc.playerId = id; ui.rc.nick = null;
    if (!validId(id)) { updateRecharge(); return; }
    ui.rc.verifying = true; updateRecharge();
    setTimeout(() => {
      if (ui.rc.playerId !== id) return;
      ui.rc.verifying = false; ui.rc.nick = nickFor(id); updateRecharge();
    }, 700);
  },
  "confirm-recharge": () => {
    const rc = ui.rc;
    const o = placeOrder(rc.pkg, rc.playerId, rc.nick);
    if (!o) { toast("Saldo insuficiente"); return; }
    if ($("#rcSave")?.checked && !state.clients.some((c) => c.playerId === rc.playerId)) {
      state.clients.unshift({ id: "C" + Date.now(), name: rc.nick, playerId: rc.playerId, nick: rc.nick, phone: "", note: "" });
      save();
    }
    toast(`⚡ Pedido ${o.id} enviado. Procesando…`);
    ui.rc = { pkg: rc.pkg, playerId: "", nick: null, verifying: false, save: false };
    render();
  },

  "bulk-example": () => { ui.bulk.text = "123456789, 520\n987654321, 100\n555666777, semanal\n12345, 310\n444555666, 999"; ui.bulk.rows = parseBulk(ui.bulk.text); render(); },
  "bulk-validate": () => { ui.bulk.text = $("#bulkText").value; ui.bulk.rows = parseBulk(ui.bulk.text); render(); },
  "bulk-run": () => {
    const valid = (ui.bulk.rows || []).filter((r) => r.ok);
    let n = 0;
    for (const r of valid) { if (placeOrder(r.pkg, r.playerId, r.nick)) n++; else break; }
    toast(`📦 ${n} recargas enviadas${n < valid.length ? ` (${valid.length - n} sin saldo)` : ""}`);
    ui.bulk = { text: "", rows: null };
    go("pedidos");
  },

  receipt: (el) => {
    const o = state.orders.find((x) => x.id === el.dataset.id);
    openModal(`
      <h3>Comprobante</h3>
      <div class="receipt">
        <div class="sum-line"><span class="muted">Pedido</span><span class="mono">${o.id}</span></div>
        <div class="sum-line"><span class="muted">Jugador</span><span>${esc(o.nick)} · <span class="mono">${o.playerId}</span></span></div>
        <div class="sum-line"><span class="muted">Paquete</span><span>${PKG(o.pkg).ico} ${PKG(o.pkg).name}</span></div>
        <div class="sum-line"><span class="muted">Precio</span><span>${money(o.price)}</span></div>
        <div class="sum-line"><span class="muted">Fecha</span><span>${fmtDate(o.date)}</span></div>
        <div class="sum-line"><span class="muted">Estado</span>${badge(o.status)}</div>
      </div>
      <pre style="white-space:pre-wrap">${esc(receiptText(o))}</pre>
      <button class="btn btn-primary full" style="margin-top:12px" data-action="copy-receipt" data-id="${o.id}">📲 Copiar para WhatsApp</button>`);
  },
  "copy-receipt": (el) => copy(receiptText(state.orders.find((x) => x.id === el.dataset.id)), "Comprobante copiado ✔"),
  repeat: (el) => {
    const o = state.orders.find((x) => x.id === el.dataset.id);
    ui.rc = { pkg: o.pkg, playerId: o.playerId, nick: o.nick, verifying: false, save: false };
    go("recargar");
  },
  "export-orders": () => {
    const rows = [["Pedido", "Fecha", "Paquete", "ID jugador", "Nick", "Costo", "Venta", "Ganancia", "Estado"]]
      .concat(filteredOrders().map((o) => [o.id, new Date(o.date).toISOString(), PKG(o.pkg).name, o.playerId, o.nick, o.cost, o.price, o.status === "completado" ? round(o.price - o.cost) : 0, o.status]));
    download(`pedidos-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));
    toast("CSV descargado ✔");
  },

  amount: (el) => { ui.wallet.amount = Number(el.dataset.v); $('[data-wallet="amount"]').value = ui.wallet.amount; updateWallet(); },

  "reset-prices": () => { state.prices = {}; save(); render(); toast("Precios sugeridos restablecidos"); },
  margin: (el) => {
    const m = Number(el.dataset.v) / 100;
    PACKAGES.forEach((p) => (state.prices[p.id] = Math.ceil(costOf(p) * (1 + m) * 10) / 10));
    save(); render(); toast(`Margen de ${el.dataset.v}% aplicado`);
  },
  "copy-prices": () => copy(priceListText(), "Lista de precios copiada ✔ Pégala en WhatsApp"),

  "recharge-client": (el) => {
    const c = state.clients.find((x) => x.id === el.dataset.id);
    ui.rc = { pkg: ui.rc.pkg, playerId: c.playerId, nick: c.nick || nickFor(c.playerId), verifying: false, save: false };
    go("recargar");
  },
  "del-client": (el) => {
    if (!confirm("¿Eliminar este cliente?")) return;
    state.clients = state.clients.filter((x) => x.id !== el.dataset.id); save(); render();
  },
  "pick-client": () => {},

  "show-key": () => { const i = $("#apiKey"); i.value = i.value.includes("•") ? state.api.key : state.api.key.slice(0, 12) + "•".repeat(20); },
  "copy-key": () => copy(state.api.key, "Clave copiada ✔"),
  "regen-key": () => {
    if (!confirm("La clave actual dejará de funcionar. ¿Continuar?")) return;
    state.api.key = genKey(); save(); render(); toast("Nueva clave generada");
  },

  logout: () => { state.session = false; save(); render(); },
  "reset-demo": () => {
    if (!confirm("Se borrarán todos los datos de este navegador. ¿Continuar?")) return;
    state = seedState(); state.session = true; save(); go("inicio"); render(); toast("Datos restablecidos");
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el) {
    const fn = actions[el.dataset.action];
    if (fn && el.tagName !== "SELECT") { e.preventDefault(); fn(el); }
  }
  if (e.target.id === "modal") closeModal();
  if (e.target.id === "sideOverlay") $("#sidebar").classList.remove("open");
  if (!e.target.closest(".notif-wrap")) $("#notifPanel").hidden = true;
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "rcId") { ui.rc.playerId = t.value.replace(/\D/g, ""); t.value = ui.rc.playerId; ui.rc.nick = null; updateRecharge(); }
  if (t.id === "rcSave") ui.rc.save = t.checked;
  if (t.id === "bulkText") ui.bulk.text = t.value;
  if (t.dataset.filter) { ui.orders[t.dataset.filter] = t.value; $("#ordersTable").innerHTML = ordersTable(); }
  if (t.dataset.wallet) {
    if (t.dataset.wallet === "amount") ui.wallet.amount = Number(t.value) || 0;
    if (t.dataset.wallet === "method") ui.wallet.method = t.value;
    updateWallet();
  }
  if (t.dataset.price) {
    const p = PKG(t.dataset.price);
    const v = Number(t.value);
    if (!isNaN(v) && t.value !== "") { state.prices[p.id] = round(v); save(); }
    const row = t.closest("tr"), c = costOf(p), g = priceOf(p) - c;
    $("[data-gain]", row).textContent = money(g);
    $("[data-gain]", row).className = g >= 0 ? "ok" : "bad";
    $("[data-margin]", row).textContent = (c ? Math.round((g / c) * 100) : 0) + " %";
  }
  if (t.dataset.setting) {
    state.settings[t.dataset.setting] = t.type === "checkbox" ? t.checked : Number(t.value) || 0;
    save();
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.action === "pick-client" && t.value) {
    const c = state.clients.find((x) => x.id === t.value);
    ui.rc.playerId = c.playerId; ui.rc.nick = c.nick || nickFor(c.playerId);
    $("#rcId").value = c.playerId;
    updateRecharge();
  }
});

const forms = {
  login: () => { state.session = true; save(); if (!location.hash) go("inicio"); render(); toast(`¡Hola, ${state.user.name.split(" ")[0]}! 👋`); },
  request: () => { closeModal(); toast("Solicitud enviada ✔ Te contactaremos por WhatsApp"); },
  deposit: (f) => {
    const amount = Number(f.get("amount"));
    if (amount < 10) { toast("El depósito mínimo es $10"); return; }
    const m = METHODS.find((x) => x.id === f.get("method"));
    const net = round(amount - amount * m.fee);
    const mv = { date: Date.now(), concept: `Depósito · ${m.name} (ref. ${f.get("ref")})`, amount: net, status: "revision" };
    state.movements.unshift(mv);
    save(); render();
    toast("Solicitud enviada ✔ Estamos revisando tu pago");
    // Simula la aprobación del administrador
    setTimeout(() => approveDeposit(mv.date), 4000);
  },
  client: (f, form) => {
    const playerId = f.get("playerId").trim();
    if (state.clients.some((c) => c.playerId === playerId)) { toast("Ese ID ya está guardado"); return; }
    state.clients.unshift({ id: "C" + Date.now(), name: f.get("name").trim(), playerId, nick: nickFor(playerId), phone: f.get("phone").trim(), note: f.get("note").trim() });
    save(); render(); toast("Cliente guardado ✔");
  },
  api: (f) => { state.api.webhook = f.get("webhook"); state.api.ips = f.get("ips"); save(); toast("Configuración de API guardada ✔"); },
  ticket: (f) => {
    const id = "T-" + (210 + state.tickets.length);
    state.tickets.unshift({ id, date: Date.now(), subject: f.get("subject"), order: f.get("order"), msg: f.get("msg"), status: "abierto" });
    save(); render(); toast(`Ticket ${id} creado ✔ Te responderemos pronto`);
  },
  profile: (f) => {
    Object.assign(state.user, { name: f.get("name").trim(), storeName: f.get("storeName").trim(), email: f.get("email").trim(), phone: f.get("phone").trim() });
    save(); renderChrome(); toast("Perfil actualizado ✔");
  },
  password: (f, form) => {
    if (f.get("n1") !== f.get("n2")) { toast("Las contraseñas no coinciden"); return; }
    form.reset(); toast("Contraseña actualizada ✔");
  },
};

document.addEventListener("submit", (e) => {
  const form = e.target;
  const fn = forms[form.dataset.form];
  if (fn) { e.preventDefault(); fn(new FormData(form), form); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeModal(); $("#notifPanel").hidden = true; $("#sidebar").classList.remove("open"); }
  if (e.key === "Enter" && e.target.id === "rcId") { e.preventDefault(); actions["verify-id"](); }
});

window.addEventListener("hashchange", render);
render();
