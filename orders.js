import { sb, CONFIG, initPage, esc, money, waLink, shortId, showMsg, toast, $, $$ } from "./app.js";

const { user, profile } = await initPage();

const listEl = $("#list");
const msg = $("#msg");
const tabsEl = $("#tabs");
const isSeller = profile?.role === "seller";

const STATUS = {
  pending: "Waiting for payment",
  paid: "Paid",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled"
};

let tab = "buy";
let orders = [];

function actionsFor(o, mode) {
  const a = [];
  if (mode === "sell") {
    if (o.status === "pending") a.push(["paid", "Mark as paid"], ["cancelled", "Cancel order"]);
    else if (o.status === "paid") a.push(["shipped", "Mark as shipped"], ["cancelled", "Cancel order"]);
    else if (o.status === "shipped") a.push(["completed", "Mark as completed"]);
  } else if (o.status === "pending") {
    a.push(["cancelled", "Cancel order"]);
  } else if (o.status === "shipped") {
    a.push(["completed", "I received it"]);
  }
  return a
    .map(([s, label]) => `<button type="button" class="btn small ${s === "cancelled" ? "danger" : ""}" data-status="${s}">${label}</button>`)
    .join("");
}

function card(o, mode) {
  const items = (o.order_items || [])
    .map((i) => `<li><span>${esc(i.title)} x ${i.qty}</span><span>${money(i.price * i.qty)}</span></li>`)
    .join("");
  const when = new Date(o.created_at).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });

  let contact = "";
  let who = "";
  if (mode === "buy") {
    who = `Seller: ${esc(o.seller?.name || "seller")}`;
    const wa = waLink(o.seller?.whatsapp, `Hi, about my order #${shortId(o.id)} on ${CONFIG.BRAND}.`);
    if (wa) contact = `<a class="btn wa small" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp seller</a>`;
  } else {
    who = `Buyer: ${esc(o.ship_name)}`;
    const wa = waLink(o.ship_phone, `Hi ${o.ship_name}, about your order #${shortId(o.id)} on ${CONFIG.BRAND}.`);
    if (wa) contact = `<a class="btn wa small" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp buyer</a>`;
  }

  return `
    <article class="order" data-id="${esc(o.id)}">
      <div class="order-head">
        <strong>Order #${esc(shortId(o.id))}</strong>
        <span class="status ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span>
      </div>
      <span class="hint">${esc(when)}. ${who}</span>
      <ul>${items}</ul>
      <div class="order-head"><strong>Total</strong><strong>${money(o.total)}</strong></div>
      <p class="meta">Deliver to: ${esc(o.ship_name)}, ${esc(o.ship_phone)}
${esc(o.ship_address)}${o.note ? `\nNote: ${esc(o.note)}` : ""}</p>
      <div class="order-actions">${actionsFor(o, mode)} ${contact}</div>
    </article>`;
}

async function load() {
  listEl.innerHTML = `<p class="empty">Loading...</p>`;
  msg.hidden = true;
  const col = tab === "buy" ? "buyer_id" : "seller_id";
  const { data, error } = await sb
    .from("orders")
    .select("*, seller:profiles!orders_seller_id_fkey(name,whatsapp), order_items(id,title,price,qty)")
    .eq(col, user.id)
    .order("created_at", { ascending: false });
  if (error) {
    listEl.innerHTML = "";
    showMsg(msg, error.message);
    return;
  }
  orders = data;
  listEl.innerHTML = orders.length
    ? orders.map((o) => card(o, tab)).join("")
    : `<p class="empty">${tab === "buy" ? 'No purchases yet. <a href="index.html">Start shopping</a>.' : "No orders received yet."}</p>`;
}

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  tab = btn.dataset.tab;
  $$("[data-tab]", tabsEl).forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
  load();
});

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-status]");
  const el = e.target.closest(".order");
  if (!btn || !el) return;
  const status = btn.dataset.status;
  if (status === "cancelled" && !confirm("Cancel this order? The items go back into stock.")) return;
  btn.disabled = true;
  const { error } = await sb.rpc("update_order_status", { p_order: el.dataset.id, p_status: status });
  if (error) {
    showMsg(msg, error.message);
    btn.disabled = false;
    return;
  }
  toast("Order updated");
  load();
});

if (!user) {
  location.replace("login.html?next=orders.html");
} else {
  if (isSeller) $("[data-tab='sell']").hidden = false;
  if (isSeller && new URLSearchParams(location.search).get("tab") === "sales") {
    tab = "sell";
    $$("[data-tab]", tabsEl).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === "sell")));
  }
  load();
}
