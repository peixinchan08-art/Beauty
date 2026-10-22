import { sb, CONFIG, initPage, esc, money, safeUrl, waLink, addToCart, isUuid, $ } from "./app.js";

const root = $("#product");
const { user } = await initPage();
const id = new URLSearchParams(location.search).get("id");

function notFound() {
  root.innerHTML = `<p class="empty">We could not find this product. <a href="index.html">Back to the shop</a></p>`;
}

function render(p) {
  document.title = `${p.title} | ${CONFIG.BRAND}`;
  const img = safeUrl(p.image_url);
  const mine = user && user.id === p.seller_id;
  const soldOut = p.stock <= 0 || !p.active;
  const wa = waLink(p.seller?.whatsapp, `Hi! I'm interested in "${p.title}" on ${CONFIG.BRAND}.`);

  root.innerHTML = `
    <div class="detail">
      <div class="detail-img">${img ? `<img src="${esc(img)}" alt="${esc(p.title)}">` : `<span class="noimg" aria-hidden="true"></span>`}</div>
      <div class="detail-info">
        <p class="cat">${esc(p.category || "Beauty")}</p>
        <h1>${esc(p.title)}</h1>
        <p class="price">${money(p.price)}</p>
        <p class="seller">Sold by <strong>${esc(p.seller?.name || "a seller")}</strong></p>
        <p class="desc">${esc(p.description || "The seller has not added a description yet.")}</p>
        <p class="stock ${soldOut ? "bad" : "ok"}">${soldOut ? "Sold out" : `${p.stock} in stock`}</p>
        ${mine
          ? `<p class="msg info">This is your product. <a href="seller.html">Edit it in your dashboard</a>.</p>`
          : `<div class="buy">
               <label class="qty">Quantity
                 <input id="qty" type="number" min="1" max="${Math.max(p.stock, 1)}" value="1" ${soldOut ? "disabled" : ""}>
               </label>
               <button class="btn" id="addBtn" type="button" ${soldOut ? "disabled" : ""}>Add to cart</button>
               <button class="btn ghost" id="buyBtn" type="button" ${soldOut ? "disabled" : ""}>Buy now</button>
             </div>`}
        ${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">Ask the seller on WhatsApp</a>` : ""}
      </div>
    </div>`;

  if (mine || soldOut) return;
  const qty = () => Math.min(Math.max(parseInt($("#qty").value, 10) || 1, 1), p.stock);
  $("#addBtn").addEventListener("click", () => addToCart(p, qty()));
  $("#buyBtn").addEventListener("click", () => {
    addToCart(p, qty());
    location.href = "cart.html";
  });
}

if (!isUuid(id)) {
  notFound();
} else {
  const { data: p, error } = await sb
    .from("products")
    .select(
      "id,title,description,price,stock,image_url,category,seller_id,active,seller:profiles!products_seller_id_fkey(name,whatsapp)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !p) notFound();
  else render(p);
}
