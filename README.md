# GlowMart: buy and sell beauty marketplace

A static website (GitHub Pages) with a Supabase backend for login, products, orders and photos.
Payments are manual to start: the buyer places an order, messages the seller on WhatsApp, pays by bank transfer or e-wallet, and the seller marks the order as paid.

## Set up in 6 steps

1. **Supabase project.** Create a free project at https://supabase.com.
2. **Database.** Open SQL Editor, paste all of `supabase.sql`, click Run.
3. **Login settings.** Authentication -> URL Configuration:
   - Site URL: your GitHub Pages address, e.g. `https://yourname.github.io/glowmart/`
   - Add the same address under Redirect URLs.
   - While testing you can turn off "Confirm email" (Authentication -> Providers -> Email).
4. **Connect the site.** Project Settings -> API. Copy the Project URL and the `anon` public key into `config.js`. Never use the `service_role` key.
5. **Try it on your computer** (the pages use ES modules, so double-clicking the file will not work):
   ```
   python3 -m http.server 8000
   ```
   then open http://localhost:8000. Add `http://localhost:8000` to Redirect URLs while testing.
6. **Publish.** Upload all files to a GitHub repo, then Settings -> Pages -> Deploy from branch `main`, folder `/ (root)`.

Rename the brand: change `BRAND` in `config.js` and replace "GlowMart" in the `<title>` of each `.html` file.

## What is included

| Page | What it does |
| --- | --- |
| `index.html` | Product grid, search, category swatches |
| `product.html` | Product detail, add to cart, WhatsApp the seller |
| `cart.html` | Cart, delivery details, place order |
| `login.html` | Log in and create account (buyer or seller) |
| `seller.html` | Add, edit, hide and delete products with photos |
| `orders.html` | Buyers track purchases; sellers manage orders received |

## How it stays safe

- Row Level Security: sellers can only change their own products; buyers and sellers only see their own orders.
- Orders are created by the `place_order` database function. It reads prices and stock from the database, so nobody can change a price from the browser. It also splits the cart into one order per seller and reduces stock.
- Cancelling an order puts the items back into stock.
- Photos are limited to JPG, PNG and WebP, 2 MB, and each seller can only write to their own folder.
- A seller's name and WhatsApp number are public by design, so buyers can reach them.

## Next steps

- **Online payments (FPX or cards).** Use a gateway such as Billplz, ToyyibPay or Stripe. Keep the secret keys in a Supabase Edge Function that creates the payment and receives the "paid" callback, then calls the same status update. Never put secret keys in these files.
- **Password reset page**, **terms and refund policy pages**, and a **custom domain** (Pages settings).
- **Platform fee or admin approval** for new sellers.
