// ===== Edit these values, then everything else works =====
export const CONFIG = {
  BRAND: "GlowMart",

  // Supabase -> Project Settings -> API
  SUPABASE_URL: "https://vjfjnxtchicsczazkngg.supabase.co"
  SUPABASE_ANON_KEY: "sb_publishable_AL75AWswzAKe_lZASZ2-Fw_f4IwvLnU"

  CURRENCY: "RM",
  COUNTRY_CODE: "60", // used to turn 0123456789 into a WhatsApp link (Malaysia = 60)
  CATEGORIES: ["Skincare", "Makeup", "Hair", "Body", "Fragrance", "Tools", "Other"],
  MAX_IMAGE_MB: 2,

  // Shown at checkout and after an order is placed
  PAYMENT_NOTE:
    "After you place the order, message the seller on WhatsApp. They will share bank transfer or e-wallet details and mark your order as paid."
};
