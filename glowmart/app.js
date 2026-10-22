import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG } from "./config.js";

export { CONFIG };

export const configured =
  !CONFIG.SUPABASE_URL.includes("YOUR-PROJECT") && !CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* ---------------- small helpers ---------------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const money = (n) => `${CONFIG.CURRENCY} ${Number(n || 0).toFixed(2)}`;
export const shortId = (id) => String(id).slice(0, 8).toUpperCase();
export const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");

// Only allow https image links (seller-provided data is never trusted)
export function safeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" ? x.href : "";
  } catch {
    return "";
  }
}

export function waLink(number, text = "") {
  let d = String(number || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = CONFIG.COUNTRY_CODE + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function showMsg(el, text, type = "error") {
  el.className = `msg ${type}`;
  el.textContent = text;
  el.hidden = false;
}

let toastTimer;
export function toast(text) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------------- cart (kept in this browser) ---------------- */
const CART_KEY = "glowmart_cart_v1";
let cartMem = null;

export function getCart() {
  if (cartMem) return cartMem;
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY));
    cartMem = Array.isArray(parsed) ? parsed : [];
  } catch {
    cartMem = [];
  }
  return cartMem;
}

export function setCart(cart) {
  cartMem = cart;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    /* private mode: the cart still works until the page closes */
  }
  updateCartBadge();
}

export const clearCart = () => setCart([]);

export function updateCartBadge() {
  const el = $("#cartCount");
  if (!el) return;
  const n = getCart().reduce((sum, i) => sum + i.qty, 0);
  el.textContent = n;
  el.hidden = n === 0;
}

export function addToCart(p, qty = 1) {
  const cart = [...getCart()];
  const i = cart.findIndex((x) => x.id === p.id);
  if (i >= 0) {
    cart[i] = { ...cart[i], qty: Math.min(cart[i].qty + qty, p.stock) };
  } else {
    cart.push({
      id: p.id,
      title: p.title,
      price: p.price,
      image_url: p.image_url,
      stock: p.stock,
      seller_id: p.seller_id,
      qty: Math.min(qty, p.stock)
    });
  }
  setCart(cart);
  toast(`Added "${p.title}" to your cart`);
}

/* ---------------- page chrome ---------------- */
function renderNav(user) {
  const nav = $("#nav");
  if (!nav) return;
  const page = location.pathname.split("/").pop() || "index.html";
  const link = (href, label) =>
    `<a href="${href}"${page === href ? ' aria-current="page"' : ""}>${label}</a>`;

  nav.innerHTML = `
    <div class="container bar">
      <a class="brand" href="index.html">${esc(CONFIG.BRAND)}</a>
      <nav class="links" aria-label="Main">
        ${link("index.html", "Shop")}
        ${link("seller.html", "Sell")}
        ${user ? link("orders.html", "Orders") : ""}
        ${link("cart.html", `Cart <span class="badge" id="cartCount" hidden>0</span>`)}
        ${user
          ? `<button class="linkbtn" id="logoutBtn" type="button">Log out</button>`
          : link("login.html", "Log in")}
      </nav>
    </div>`;

  $("#logoutBtn")?.addEventListener("click", async () => {
    await sb.auth.signOut();
    location.href = "index.html";
  });
}

function renderFooter() {
  const f = $("#footer");
  if (!f) return;
  f.innerHTML = `<div class="container">&copy; ${new Date().getFullYear()} ${esc(CONFIG.BRAND)}. Buyers and sellers deal directly; please check items on delivery.</div>`;
}

// Call once on every page. Returns the logged-in user and their profile (or nulls).
export async function initPage() {
  const { data } = await sb.auth.getSession();
  const user = data.session?.user ?? null;

  let profile = null;
  if (user) {
    const r = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    profile = r.data;
  }

  renderNav(user);
  renderFooter();
  updateCartBadge();

  if (!configured) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="notice">Setup needed: add your Supabase URL and anon key in <code>config.js</code>.</div>`
    );
  }
  return { user, profile };
}

/* ---------------- shared product tile ---------------- */
export function productCard(p) {
  const img = safeUrl(p.image_url);
  const soldOut = p.stock <= 0;
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  return `
    <article class="tile">
      <a class="tile-img" href="${href}" aria-label="${esc(p.title)}">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="noimg" aria-hidden="true"></span>`}
        ${soldOut ? `<span class="flag">Sold out</span>` : ""}
      </a>
      <h3><a href="${href}">${esc(p.title)}</a></h3>
      <p class="by">${esc(p.category || "Beauty")} from ${esc(p.seller?.name || "a seller")}</p>
      <div class="tile-foot">
        <strong>${money(p.price)}</strong>
        <button class="btn small" type="button" data-add="${esc(p.id)}" ${soldOut ? "disabled" : ""}>Add to cart</button>
      </div>
    </article>`;
}
