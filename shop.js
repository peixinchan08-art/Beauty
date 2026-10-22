import { sb, CONFIG, initPage, esc, productCard, addToCart, $, $$ } from "./app.js";

await initPage();

const grid = $("#grid");
const search = $("#search");
const count = $("#count");
const swatches = $("#swatches");

let products = [];
let category = "";

swatches.innerHTML =
  `<button class="swatch all" type="button" data-cat="" aria-pressed="true">All<small>Everything</small></button>` +
  CONFIG.CATEGORIES.map(
    (c) => `<button class="swatch" type="button" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`
  ).join("");

function render() {
  const q = search.value.trim().toLowerCase();
  const list = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!q || `${p.title} ${p.description || ""} ${p.category || ""}`.toLowerCase().includes(q))
  );
  grid.innerHTML = list.length
    ? list.map(productCard).join("")
    : `<p class="empty">Nothing matches yet. Try another word or category.</p>`;
  count.textContent = `${list.length} ${list.length === 1 ? "product" : "products"}`;
}

swatches.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cat]");
  if (!btn) return;
  category = btn.dataset.cat;
  $$(".swatch", swatches).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  render();
});

search.addEventListener("input", render);

grid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const p = products.find((x) => x.id === btn.dataset.add);
  if (p) addToCart(p, 1);
});

const { data, error } = await sb
  .from("products")
  .select(
    "id,title,description,price,stock,image_url,category,seller_id,created_at,seller:profiles!products_seller_id_fkey(name)"
  )
  .eq("active", true)
  .order("created_at", { ascending: false })
  .limit(200);

if (error) {
  grid.innerHTML = `<p class="empty">Could not load products. Check your Supabase settings in config.js.</p>`;
} else {
  products = data;
  render();
}
