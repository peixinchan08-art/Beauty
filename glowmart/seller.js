import { sb, CONFIG, initPage, esc, money, safeUrl, showMsg, toast, $, $$ } from "./app.js";

const root = $("#seller");
const { user, profile } = await initPage();

const BUCKET = "product-images";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// "https://xyz.supabase.co/storage/v1/object/public/product-images/<uid>/<file>" -> "<uid>/<file>"
function storagePath(url) {
  const m = String(url || "").match(/\/product-images\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function renderBecomeSeller() {
  root.innerHTML = `
    <section class="panel narrow" style="margin-top:28px">
      <h1>Open your shop</h1>
      <p>It takes a minute. Buyers will message you on WhatsApp, so add your number.</p>
      <form id="sellerForm" class="form">
        <label>Shop or display name
          <input name="name" required maxlength="100" value="${esc(profile?.name || "")}">
        </label>
        <label>WhatsApp number
          <input name="whatsapp" required inputmode="tel" maxlength="20" placeholder="0123456789" value="${esc(profile?.whatsapp || "")}">
        </label>
        <button class="btn" type="submit">Become a seller</button>
        <p id="msg" class="msg" hidden></p>
      </form>
    </section>`;

  $("#sellerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await sb.from("profiles").upsert({
      id: user.id,
      name: fd.get("name").trim(),
      whatsapp: fd.get("whatsapp").trim(),
      role: "seller"
    });
    if (error) showMsg($("#msg"), error.message);
    else location.reload();
  });
}

function renderDashboard() {
  root.innerHTML = `
    <div class="dash-head">
      <h1>Your shop</h1>
      <a class="btn ghost small" href="orders.html?tab=sales">See orders received</a>
    </div>

    <section class="panel">
      <h2 id="formTitle">Add a product</h2>
      <form id="productForm" class="form grid2">
        <label>Product name
          <input name="title" required maxlength="120">
        </label>
        <label>Category
          <select name="category">${CONFIG.CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
        </label>
        <label>Price (${esc(CONFIG.CURRENCY)})
          <input name="price" type="number" min="0" max="100000" step="0.01" required>
        </label>
        <label>Stock
          <input name="stock" type="number" min="0" step="1" required value="1">
        </label>
        <label class="span2">Description
          <textarea name="description" rows="4" maxlength="2000" placeholder="Size, skin type, ingredients, condition"></textarea>
        </label>
        <label class="span2">Photo (JPG, PNG or WebP, up to ${CONFIG.MAX_IMAGE_MB} MB)
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp">
        </label>
        <label class="check span2">
          <input name="active" type="checkbox" checked> Show this product in the shop
        </label>
        <div class="span2 actions">
          <button class="btn" id="saveBtn" type="submit">Save product</button>
          <button class="btn ghost" id="cancelBtn" type="button" hidden>Cancel changes</button>
        </div>
        <p id="msg" class="msg span2" hidden></p>
      </form>
    </section>

    <section>
      <h2>Your products</h2>
      <div id="myProducts"></div>
    </section>`;

  const form = $("#productForm");
  const msg = $("#msg");
  const saveBtn = $("#saveBtn");
  const cancelBtn = $("#cancelBtn");
  const list = $("#myProducts");

  let items = [];
  let editingId = null;
  let editingImage = null;

  function resetForm() {
    form.reset();
    editingId = null;
    editingImage = null;
    $("#formTitle").textContent = "Add a product";
    cancelBtn.hidden = true;
  }

  function row(p) {
    const img = safeUrl(p.image_url);
    return `
      <div class="myrow" data-id="${esc(p.id)}">
        ${img ? `<img src="${esc(img)}" alt="">` : `<span class="noimg sm" aria-hidden="true"></span>`}
        <div class="grow">
          <strong>${esc(p.title)}</strong>
          <span>${money(p.price)}, ${p.stock} in stock, ${p.active ? "visible" : "hidden"}</span>
        </div>
        <div class="row-actions">
          <button class="btn small ghost" type="button" data-edit>Edit</button>
          <button class="btn small ghost" type="button" data-toggle>${p.active ? "Hide" : "Show"}</button>
          <button class="btn small danger" type="button" data-del>Delete</button>
        </div>
      </div>`;
  }

  async function load() {
    const { data, error } = await sb
      .from("products")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      showMsg(msg, error.message);
      return;
    }
    items = data;
    list.innerHTML = items.length
      ? items.map(row).join("")
      : `<p class="empty">No products yet. Add your first one above.</p>`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    msg.hidden = true;
    try {
      const fd = new FormData(form);
      const file = fd.get("image");
      let image_url = editingImage;
      let uploaded = false;

      if (file && file.size > 0) {
        const ext = EXT[file.type];
        if (!ext) throw new Error("The photo must be a JPG, PNG or WebP file.");
        if (file.size > CONFIG.MAX_IMAGE_MB * 1024 * 1024) {
          throw new Error(`The photo must be smaller than ${CONFIG.MAX_IMAGE_MB} MB.`);
        }
        const path = `${user.id}/${Date.now()}.${ext}`;
        const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
        if (up.error) throw up.error;
        image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        uploaded = true;
      }

      const row = {
        title: fd.get("title").trim(),
        category: fd.get("category"),
        price: Number(fd.get("price")),
        stock: parseInt(fd.get("stock"), 10),
        description: fd.get("description").trim(),
        image_url,
        active: fd.get("active") === "on"
      };

      const wasEditing = Boolean(editingId);
      const oldPath = storagePath(editingImage);
      const res = wasEditing
        ? await sb.from("products").update(row).eq("id", editingId).eq("seller_id", user.id)
        : await sb.from("products").insert({ ...row, seller_id: user.id });
      if (res.error) throw res.error;

      if (uploaded && oldPath) sb.storage.from(BUCKET).remove([oldPath]);
      toast(wasEditing ? "Product saved" : "Product added");
      resetForm();
      await load();
    } catch (err) {
      showMsg(msg, err.message || "Could not save. Please try again.");
    } finally {
      saveBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", resetForm);

  list.addEventListener("click", async (e) => {
    const rowEl = e.target.closest(".myrow");
    if (!rowEl) return;
    const p = items.find((x) => x.id === rowEl.dataset.id);
    if (!p) return;

    if (e.target.closest("[data-edit]")) {
      const f = form.elements;
      f.title.value = p.title;
      f.category.value = p.category;
      f.price.value = p.price;
      f.stock.value = p.stock;
      f.description.value = p.description || "";
      f.active.checked = p.active;
      f.image.value = "";
      editingId = p.id;
      editingImage = p.image_url;
      $("#formTitle").textContent = "Edit product (leave the photo empty to keep the current one)";
      cancelBtn.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (e.target.closest("[data-toggle]")) {
      const { error } = await sb.from("products").update({ active: !p.active }).eq("id", p.id).eq("seller_id", user.id);
      if (error) showMsg(msg, error.message);
      else await load();
    } else if (e.target.closest("[data-del]")) {
      if (!confirm(`Delete "${p.title}"? Past orders keep their record.`)) return;
      const { error } = await sb.from("products").delete().eq("id", p.id).eq("seller_id", user.id);
      if (error) {
        showMsg(msg, error.message);
        return;
      }
      const path = storagePath(p.image_url);
      if (path) sb.storage.from(BUCKET).remove([path]);
      if (editingId === p.id) resetForm();
      toast("Product deleted");
      await load();
    }
  });

  load();
}

if (!user) {
  location.replace("login.html?next=seller.html");
} else if (!profile || profile.role !== "seller") {
  renderBecomeSeller();
} else {
  renderDashboard();
}
