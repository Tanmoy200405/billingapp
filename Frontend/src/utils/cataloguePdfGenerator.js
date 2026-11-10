import { Platform } from "react-native";

export const CATALOGUE_STYLES = [
  {
    id: "modern_minimal",
    name: "Modern Minimalist",
    description: "Clean grid, crisp typography & subtle slate borders",
    color: "#2563EB",
    badge: "Popular",
  },
  {
    id: "elegant_bistro",
    name: "Elegant Bistro",
    description: "Warm gold & rich charcoal tones with serif typography",
    color: "#B45309",
    badge: "Cafe & Fine Dine",
  },
  {
    id: "royal_dark",
    name: "Royal Dark Luxury",
    description: "Sleek dark theme with gold & emerald price highlights",
    color: "#0F172A",
    badge: "VIP Lounge",
  },
  {
    id: "fresh_organic",
    name: "Fresh & Organic",
    description: "Botanical green accents for healthy & fresh menus",
    color: "#059669",
    badge: "Natural & Fresh",
  },
  {
    id: "vibrant_fastfood",
    name: "Vibrant Fast Food",
    description: "High-energy red & golden yellow with bold price tags",
    color: "#DC2626",
    badge: "Quick Bites",
  },
  {
    id: "compact_zudio",
    name: "Compact Grid",
    description: "High-density multi-column layout for large menus",
    color: "#475569",
    badge: "High Density",
  },
  {
    id: "magazine_editorial",
    name: "Magazine Editorial",
    description: "Spacious layout with category hero cards",
    color: "#7C3AED",
    badge: "Showcase",
  },
  {
    id: "classic_restaurant",
    name: "Classic Restaurant",
    description: "Traditional ornate royal borders & heritage styling",
    color: "#991B1B",
    badge: "Heritage",
  },
  {
    id: "sweet_bakery",
    name: "Sweet Bakery & Desserts",
    description: "Pastel rose & cream palette for bakeries & cafes",
    color: "#DB2777",
    badge: "Pastry & Cafe",
  },
  {
    id: "supermarket_retail",
    name: "Supermarket Flyer",
    description: "Commercial retail flyer style with price-drop badges",
    color: "#0284C7",
    badge: "Retail & Grocery",
  },
  {
    id: "neo_brutalist",
    name: "Neo Brutalist Pop",
    description: "Bold black borders, retro shadow & high contrast",
    color: "#000000",
    badge: "Trendy & Modern",
  },
  {
    id: "wholesale_corporate",
    name: "Corporate Price List",
    description: "Formal wholesale table with HSN, Tax rate & Stock",
    color: "#1E293B",
    badge: "Formal B2B",
  },
];

export function getStyleThemeCss(styleId) {
  switch (styleId) {
    case "elegant_bistro":
      return `
        body { font-family: 'Georgia', serif; background: #FFFDF9; color: #292524; }
        .hero { background: #1C1917; color: #F5E6C8; border-bottom: 3px solid #D97706; }
        .hero-title { color: #FBBF24; letter-spacing: 2px; }
        .cat-title { color: #92400E; border-bottom: 2px solid #FDE68A; }
        .item-card { background: #FFFFFF; border: 1px solid #F5E6C8; border-radius: 8px; }
        .item-price { color: #B45309; font-weight: 800; }
        .footer { background: #1C1917; color: #F5E6C8; }
      `;
    case "royal_dark":
      return `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0F19; color: #F1F5F9; }
        .hero { background: #111827; border-bottom: 2px solid #3B82F6; }
        .hero-title { color: #FFFFFF; letter-spacing: 1px; }
        .cat-title { color: #60A5FA; border-bottom: 1px solid #1E293B; }
        .item-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; }
        .item-name { color: #FFFFFF; }
        .item-desc { color: #94A3B8; }
        .item-price { color: #34D399; font-weight: 800; background: #064E3B; padding: 4px 10px; border-radius: 20px; }
        .footer { background: #111827; color: #94A3B8; }
      `;
    case "fresh_organic":
      return `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F0FDF4; color: #14532D; }
        .hero { background: #166534; color: #FFFFFF; border-bottom: 4px solid #86EFAC; }
        .hero-title { color: #FFFFFF; }
        .cat-title { color: #15803D; border-bottom: 2px dashed #86EFAC; }
        .item-card { background: #FFFFFF; border: 1.5px solid #BBF7D0; border-radius: 14px; }
        .item-price { color: #16A34A; font-weight: 900; }
        .footer { background: #166534; color: #DCFCE7; }
      `;
    case "vibrant_fastfood":
      return `
        body { font-family: 'Impact', 'Arial Black', sans-serif; background: #FFFBEB; color: #1F2937; }
        .hero { background: #DC2626; color: #FEF08A; border-bottom: 5px solid #F59E0B; }
        .hero-title { color: #FEF08A; text-shadow: 2px 2px #7F1D1D; letter-spacing: 1px; }
        .cat-title { color: #DC2626; border-bottom: 3px solid #DC2626; text-transform: uppercase; }
        .item-card { background: #FFFFFF; border: 2px solid #FDE047; box-shadow: 0 4px 6px rgba(220,38,38,0.08); border-radius: 12px; }
        .item-price { color: #DC2626; font-size: 16px; font-weight: 900; background: #FEF08A; padding: 3px 8px; border-radius: 8px; }
        .footer { background: #DC2626; color: #FEF08A; }
      `;
    case "compact_zudio":
      return `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #FFFFFF; color: #0F172A; }
        .hero { background: #0F172A; color: #FFFFFF; padding: 16px 20px; }
        .hero-title { font-size: 18px; letter-spacing: 2px; }
        .items-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .cat-title { font-size: 13px; font-weight: 800; background: #F1F5F9; padding: 6px 10px; border-left: 4px solid #0F172A; margin: 12px 0 6px; }
        .item-card { background: #FAFAFA; border: 1px solid #E2E8F0; padding: 6px 10px; border-radius: 6px; }
        .item-price { color: #059669; font-weight: 800; font-size: 13px; }
        .footer { background: #F8FAFC; color: #64748B; border-top: 1px solid #E2E8F0; }
      `;
    case "magazine_editorial":
      return `
        body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #FBFBFC; color: #18181B; }
        .hero { background: #6D28D9; color: #EDE9FE; border-bottom: 4px solid #A78BFA; }
        .cat-title { color: #5B21B6; font-weight: 800; font-size: 18px; letter-spacing: 0.5px; border-bottom: 2px solid #DDD6FE; }
        .item-card { background: #FFFFFF; border: 1px solid #E4E4E7; border-radius: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.03); }
        .item-price { color: #7C3AED; font-weight: 900; font-size: 15px; }
        .footer { background: #4C1D95; color: #DDD6FE; }
      `;
    case "classic_restaurant":
      return `
        body { font-family: 'Times New Roman', serif; background: #FFF9F5; color: #431407; }
        .hero { background: #78350F; color: #FEF3C7; border: 2px solid #B45309; margin: 10px; border-radius: 8px; }
        .cat-title { color: #9A3412; text-align: center; font-size: 18px; font-weight: 800; letter-spacing: 2px; border-bottom: 2px double #FDBA74; }
        .item-card { background: #FFFFFF; border: 1px solid #FED7AA; border-radius: 6px; }
        .item-price { color: #C2410C; font-weight: 800; }
        .footer { background: #78350F; color: #FEF3C7; margin: 10px; border-radius: 8px; }
      `;
    case "sweet_bakery":
      return `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #FDF2F8; color: #831843; }
        .hero { background: #DB2777; color: #FFFFFF; border-bottom: 4px solid #FBCFE8; }
        .cat-title { color: #BE185D; border-bottom: 2px solid #F472B6; }
        .item-card { background: #FFFFFF; border: 1.5px solid #FCE7F3; border-radius: 16px; }
        .item-price { color: #DB2777; font-weight: 900; background: #FDF2F8; padding: 3px 8px; border-radius: 12px; }
        .footer { background: #9D174D; color: #FDF2F8; }
      `;
    case "supermarket_retail":
      return `
        body { font-family: Arial, sans-serif; background: #F0F9FF; color: #0C4A6E; }
        .hero { background: #0284C7; color: #FFFFFF; border-bottom: 4px solid #38BDF8; }
        .cat-title { color: #0369A1; background: #E0F2FE; padding: 6px 12px; border-radius: 6px; }
        .item-card { background: #FFFFFF; border: 1.5px solid #BAE6FD; border-radius: 8px; }
        .item-price { color: #0284C7; font-weight: 900; font-size: 15px; }
        .footer { background: #0369A1; color: #E0F2FE; }
      `;
    case "neo_brutalist":
      return `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #FEF08A; color: #000000; }
        .hero { background: #000000; color: #FEF08A; border: 3px solid #000000; margin: 12px; box-shadow: 4px 4px 0px #000000; }
        .cat-title { color: #000000; font-size: 16px; font-weight: 900; text-transform: uppercase; background: #FFFFFF; border: 2.5px solid #000000; padding: 4px 10px; box-shadow: 3px 3px 0px #000000; }
        .item-card { background: #FFFFFF; border: 2.5px solid #000000; box-shadow: 3px 3px 0px #000000; border-radius: 4px; }
        .item-price { color: #000000; font-weight: 900; background: #A7F3D0; border: 1.5px solid #000000; padding: 2px 8px; }
        .footer { background: #000000; color: #FFFFFF; margin: 12px; border: 3px solid #000000; }
      `;
    case "wholesale_corporate":
      return `
        body { font-family: Arial, sans-serif; background: #FFFFFF; color: #1E293B; }
        .hero { background: #1E293B; color: #FFFFFF; border-bottom: 3px solid #64748B; }
        .cat-title { color: #1E293B; font-size: 14px; font-weight: 800; border-bottom: 2px solid #CBD5E1; }
        .item-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; }
        .item-price { color: #0F172A; font-weight: 800; }
        .footer { background: #1E293B; color: #94A3B8; }
      `;
    default:
      return `
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #0F172A; }
        .hero { background: linear-gradient(135deg, #1E40AF 0%, #2563EB 100%); color: #FFFFFF; }
        .cat-title { color: #1E40AF; border-bottom: 2px solid #DBEAFE; }
        .item-card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); }
        .item-price { color: #2563EB; font-weight: 800; font-size: 15px; }
        .footer { background: #1E293B; color: #94A3B8; }
      `;
  }
}

export function generateCatalogueHtml(items = [], storeInfo = {}, styleId = "modern_minimal") {
  const {
    businessName = "Our Store",
    phone = "",
    address = "",
    email = "",
    gstin = "",
    logo = "",
  } = storeInfo;

  const categoriesMap = new Map();
  for (const it of items) {
    const cat = it.category && it.category.trim() ? it.category.trim() : "General";
    if (!categoriesMap.has(cat)) {
      categoriesMap.set(cat, []);
    }
    categoriesMap.get(cat).push(it);
  }

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const orderUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(`Hello ${businessName}! I would like to place an order from your catalogue.`)}`;

  let categoriesHtml = "";
  for (const [catName, catItems] of categoriesMap.entries()) {
    const itemsHtml = catItems
      .map(
        (it) => `
        <div class="item-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1; padding-right:10px;">
              <div class="item-name" style="font-size:13.5px; font-weight:700;">${it.name}</div>
              ${
                it.barcode
                  ? `<div class="item-desc" style="font-size:10.5px; opacity:0.7; margin-top:2px;">Code: ${it.barcode}</div>`
                  : ""
              }
              ${
                it.unit && it.unit !== "PCS"
                  ? `<span style="font-size:10px; opacity:0.8; font-weight:600;">per ${it.unit}</span>`
                  : ""
              }
            </div>
            <div class="item-price">
              Rs. ${Number(it.sellingPrice || it.price || 0).toFixed(0)}
            </div>
          </div>
        </div>
      `
      )
      .join("");

    categoriesHtml += `
      <div style="margin-bottom: 22px;">
        <div class="cat-title" style="padding-bottom:6px; margin-bottom:12px; font-size:15px; font-weight:800; text-transform:uppercase;">
          ${catName} (${catItems.length})
        </div>
        <div class="items-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px;">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${businessName} - Product Catalogue</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          margin: 0;
          padding: 0;
          font-size: 13px;
          line-height: 1.4;
        }
        .hero {
          padding: 26px 20px 20px;
          text-align: center;
        }
        .hero-title {
          font-size: 24px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .hero-meta {
          font-size: 12px;
          margin-top: 6px;
          opacity: 0.9;
        }
        .content {
          max-width: 900px;
          margin: 0 auto;
          padding: 24px 20px;
        }
        .item-card {
          padding: 12px 14px;
        }
        .footer {
          text-align: center;
          padding: 24px 20px;
          margin-top: 30px;
          font-size: 12px;
        }
        .order-btn {
          display: inline-block;
          background: #25D366;
          color: #FFFFFF;
          text-decoration: none;
          font-weight: 800;
          font-size: 13px;
          padding: 10px 20px;
          border-radius: 24px;
          margin-top: 10px;
        }
        @media print {
          @page { margin: 8mm 8mm; size: auto; }
          body { background: #FFFFFF; }
          .order-btn { display: none; }
        }
        ${getStyleThemeCss(styleId)}
      </style>
    </head>
    <body>
      <div class="hero">
        ${logo ? `<img src="${logo}" style="width:64px; height:64px; border-radius:50%; object-fit:contain; margin-bottom:8px;" />` : ""}
        <div class="hero-title">${businessName}</div>
        <div class="hero-meta">
          ${phone ? `📞 Order on WhatsApp: +${phone}` : ""}
          ${email ? ` | ✉ ${email}` : ""}
          ${gstin ? ` | GSTIN: ${gstin}` : ""}
        </div>
        ${address ? `<div class="hero-meta" style="font-size:11px; opacity:0.8; margin-top:3px;">📍 ${address}</div>` : ""}
      </div>

      <div class="content">
        ${categoriesHtml || `<div style="text-align:center; padding:40px; color:#94A3B8;">No items in catalogue</div>`}
      </div>

      <div class="footer">
        <div style="font-weight:700; margin-bottom:4px;">Ready to place an order? Contact us directly!</div>
        <div style="font-size:11.5px; opacity:0.8;">Call or message on WhatsApp: +${phone}</div>
        <a class="order-btn" href="${orderUrl}">
          📱 Tap to Order on WhatsApp
        </a>
      </div>
    </body>
    </html>
  `;
}

export async function shareCataloguePdf(items, storeInfo = {}, styleId = "modern_minimal", fileName = null) {
  const safeName = fileName || `Catalogue_${(storeInfo.businessName || "Store").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  const html = generateCatalogueHtml(items, storeInfo, styleId);

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        setTimeout(() => {
          try { win.print(); } catch {}
        }, 800);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName.replace(/\.pdf$/, "")}.html`;
        a.click();
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  try {
    const Print = await import("expo-print");
    const Sharing = await import("expo-sharing");
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Share ${storeInfo.businessName || "Store"} Catalogue`,
        UTI: "com.adobe.pdf",
      });
    }
    return { success: true, uri };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
