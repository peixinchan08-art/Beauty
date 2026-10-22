import {
  sb, CONFIG, initPage, esc, money, safeUrl, waLink, shortId,
  getCart, setCart, clearCart, showMsg, $
} from "./app.js";

const listEl = $("#cartList");
const summaryEl = $("#summary");
const checkout = $("#checkout");
const form = $("#checkoutForm");
const msg = $("#msg");
const done = $("#done");
const placeBtn = $("#placeBtn");

const { user, profile } = await initPage();
let cart = [...getCart()];

$("#payNote").textContent = CONFIG.PAYMENT_NOTE;
if (profile?.name) form.elements.name.value = profile.name;
placeBtn.textContent = user ? "Place order" : "Log in to place order";

// Refresh prices and stock from the database so the cart never shows stale data
async function syncWithServer() {
  if (!cart.length) return;
  const { data, error } = await sb
    .from("products")
    .select("id,title,price,stock,image_url,active,seller_id")
    .in("id", cart.map((i) => i.id));
  if (error) return; // keep the local cart if we are offline
  const byId = new Map(data.map((p) => [p.id, p]));
  cart = cart
    .filter((i) => {
      const p = byId.get(i.id);
      return p && p.active && p.stock > 0;
    })
    .map((i) => {
      const p = byId.get(i.id);
      return { ...i, title: p.title, price: p.price, stock: p.stock, image_url: p.image_url, seller_id: p.seller_id, qty: Math.min(i.qty, p.stock) };
    });
  setCart(cart);
}

function render() {
  if (!cart.length) {
    listEl.innerHTML = `<p class="empty">Your cart is empty. <a href="index.html">Find something you like</a>.</p>`;
    summaryEl.hidden = true;
    checkout.hidden = true;
    return;
  }
  listEl.innerHTML = cart
    .map((i) => {
      const img = safeUrl(i.image_url);
      return `
        <div class="line" data-id="${esc(i.id)}">
          ${img ? `<img src="${esc(img)}" alt="">` : `<span class="noimg sm" aria-hidden="true"></span>`}
          <div class="line-info">
            <a href="product.html?id=${encodeURIComponent(i.id)}">${esc(i.title)}</a>
            <span>${money(i.price)} each</span>
          </div>
          <div class="stepper">
            <button type="button" data-dec aria-label="One less">&minus;</button>
            <span aria-live="polite">${i.qty}</span>
            <button type="button" data-inc aria-label="One more">+</button>
          </div>
          <strong>${money(i.price * i.qty)}</strong>
          <button type="button" class="x" data-del aria-label="Remove ${esc(i.title)}">&times;</button>
        </div>`;
    })
    .join("");
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  summaryEl.innerHTML = `<span>Total</span><strong>${money(total)}</strong>`;
  summaryEl.hidden = false;
  checkout.hidden = false;
}

listEl.addEventListener("click", (e) => {
  const row = e.target.closest(".line");
  if (!row) return;
  const item = cart.find((i) => i.id === row.dataset.id);
  if (!item) return;
  if (e.target.closest("[data-inc]")) item.qty = Math.min(item.qty + 1, item.stock);
  else if (e.target.closest("[data-dec]")) item.qty = Math.max(item.qty - 1, 1);
  else if (e.target.closest("[data-del]")) cart = cart.filter((i) => i !== item);
  else return;
  setCart(cart);
  render();
});

async function showDone(ids) {
  checkout.hidden = true;
  summaryEl.hidden = true;
  listEl.hidden = true;
  const { data: orders } = await sb
    .from("orders")
    .select("id,total,seller:profiles!orders_seller_id_fkey(name,whatsapp)")
    .in("id", ids);
  const n = ids.length;
  done.innerHTML = `
    <h2>Order placed</h2>
    <p>${n > 1 ? `We split it into ${n} orders, one per seller.` : "Your order is with the seller."} ${esc(CONFIG.PAYMENT_NOTE)}</p>
    ${(orders || [])
      .map((o) => {
        const wa = waLink(
          o.seller?.whatsapp,
          `Hi ${o.seller?.name || ""}, I placed order #${shortId(o.id)} (${money(o.total)}) on ${CONFIG.BRAND}. How can I pay?`
        );
        return `<div class="done-order">
          <span>Order #${esc(shortId(o.id))} from <strong>${esc(o.seller?.name || "seller")}</strong>, ${money(o.total)}</span>
          ${wa ? `<a class="btn wa small" href="${esc(wa)}" target="_blank" rel="noopener">Message seller on WhatsApp</a>` : ""}
        </div>`;
      })
      .join("")}
    <p style="margin-top:18px"><a class="btn" href="orders.html">View my orders</a></p>`;
  done.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!user) {
    location.href = "login.html?next=cart.html";
    return;
  }
  placeBtn.disabled = true;
  msg.hidden = true;
  const fd = new FormData(form);
  const { data: ids, error } = await sb.rpc("place_order", {
    p_items: cart.map((i) => ({ product_id: i.id, qty: i.qty })),
    p_name: fd.get("name"),
    p_phone: fd.get("phone"),
    p_address: fd.get("address"),
    p_note: fd.get("note") || ""
  });
  if (error) {
    showMsg(msg, error.message);
    placeBtn.disabled = false;
    await syncWithServer();
    render();
    return;
  }
  cart = [];
  clearCart();
  await showDone(ids);
});

await syncWithServer();
render();
