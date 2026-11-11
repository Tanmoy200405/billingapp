import { Platform, Linking } from "react-native";
import { getApiBaseUrl, getAuthToken, loadStoredToken } from "../config/api";

export const INVOICE_STYLES = [
  {
    id: "modern_zudio",
    name: "Clean Thermal POS",
    description: "Crisp centered logo, clean metadata & high-contrast thermal layout",
    badge: "Recommended",
  },
  {
    id: "classic_thermal",
    name: "Classic Monospace POS",
    description: "Traditional monospace font, dashed dividers & kitchen KOT",
    badge: "High Speed",
  },
  {
    id: "elegant_cafe",
    name: "Elegant Bistro & Cafe",
    description: "Serif typography, double line dividers & luxury dining look",
    badge: "Dine-In & Cafe",
  },
  {
    id: "gst_detailed",
    name: "GST Tax Invoice (Official)",
    description: "Itemized tax rates, HSN column & signature stamp block",
    badge: "GST Official",
  },
  {
    id: "minimal_compact",
    name: "Minimalist Compact",
    description: "Tight margins, maximum item density, paper saver",
    badge: "Eco Saver",
  },
  {
    id: "dark_voucher",
    name: "Contemporary Voucher",
    description: "Dark header banner, high-impact totals & modern contrast",
    badge: "Stylish",
  },
];

export async function shareBackendPdf(invoice, fileName = null) {
  const invoiceId = invoice?._id;
  if (!invoiceId) return { success: false, error: "Invoice ID missing" };

  let token = getAuthToken();
  if (!token) {
    try {
      token = await loadStoredToken();
    } catch {}
  }

  const baseUrl = getApiBaseUrl();
  const rawPdfUrl = `${baseUrl}/invoices/${invoiceId}/pdf`;
  const pdfUrl = token ? `${rawPdfUrl}?token=${encodeURIComponent(token)}` : rawPdfUrl;
  const safeFileName = fileName || `Invoice_${invoice.invoiceNumber || invoiceId}.pdf`;

  if (Platform.OS === "web") {
    try {
      const response = await fetch(pdfUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = safeFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      return { success: true };
    } catch (err) {
      console.warn("[PDF] Web download fallback:", err.message);
      try {
        if (typeof window !== "undefined" && window.open) {
          window.open(pdfUrl, "_blank");
        } else {
          Linking.openURL(pdfUrl);
        }
      } catch {}
      return { success: true };
    }
  }

  try {
    const FileSystem = await import("expo-file-system/legacy");
    const Sharing = await import("expo-sharing");

    const destUri = `${FileSystem.documentDirectory}${safeFileName}`;

    const downloadResult = await FileSystem.downloadAsync(pdfUrl, destUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (downloadResult.status !== 200) {
      throw new Error(`Server returned HTTP ${downloadResult.status}`);
    }

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: "application/pdf",
        dialogTitle: `Share Bill #${invoice.invoiceNumber || ""}`,
        UTI: "com.adobe.pdf",
      });
    } else {
      const publicUrl = `${baseUrl.replace(/\/api$/, "")}/api/invoices/public/${invoiceId}/pdf`;
      Linking.openURL(publicUrl);
    }
    return { success: true, uri: downloadResult.uri };
  } catch (err) {
    console.error("[PDF] Native share error:", err.message);
    try {
      const publicUrl = `${getApiBaseUrl().replace(/\/api$/, "")}/api/invoices/public/${invoiceId}/pdf`;
      Linking.openURL(publicUrl);
      return { success: true };
    } catch {
      return { success: false, error: err.message };
    }
  }
}

function formatReceiptDate(dateStr) {
  try {
    const d = dateStr ? new Date(dateStr) : new Date();
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
      .format(d)
      .replace(",", "")
      .toUpperCase();
  } catch {
    const d = dateStr ? new Date(dateStr) : new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear()).slice(-2);
    let hours = d.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  }
}

function getReceiptStyles(receiptWidth, fontBase, isNarrow, invoiceStyle = "modern_zudio") {
  let styleSpecificCss = "";

  if (invoiceStyle === "elegant_cafe") {
    styleSpecificCss = `
      body { font-family: 'Georgia', serif; }
      .receipt { border: 1.5px solid #D1D5DB; }
      .divider { border-top: 1px double #9CA3AF; }
      .copy-badge { font-family: 'Georgia', serif; letter-spacing: 2px; border-color: #4B5563; }
      .store-name { font-family: 'Georgia', serif; letter-spacing: 2px; }
      .grand-total td { font-family: 'Georgia', serif; border-top: 2px solid #374151; }
    `;
  } else if (invoiceStyle === "modern_zudio") {
    styleSpecificCss = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
      .receipt { border: 1px solid #E2E8F0; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
      .copy-badge { background: transparent; color: #475569; border: 1px solid #CBD5E1; border-radius: 4px; padding: 1px 6px; font-size: 9px; }
      .store-name { letter-spacing: 0.4px; color: #0F172A; }
      .divider { border-top: 1px dashed #94A3B8; }
      .grand-total td { border-top: 1.5px solid #0F172A; border-bottom: 1.5px solid #0F172A; color: #0F172A; padding: 5px 0 !important; }
      .savings-pill { color: #059669; padding: 4px 0; text-align: center; font-weight: 700; margin: 4px 0; font-size: 10.5px; }
    `;
  } else if (invoiceStyle === "gst_detailed") {
    styleSpecificCss = `
      body { font-family: Arial, sans-serif; }
      .receipt { border: 1.5px solid #000; }
      .divider { border-top: 1px solid #000; }
      .items-table { border: 1px solid #000; }
      .items-table th { background: #E2E8F0; border-bottom: 1px solid #000; border-right: 1px solid #CBD5E1; }
      .items-table td { border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; padding: 3px !important; }
      .grand-total td { border-top: 2px solid #000; background: #F1F5F9; }
      .sign-box { border-top: 1px solid #000; margin-top: 16px; padding-top: 25px; text-align: right; font-size: 10px; font-weight: 700; }
    `;
  } else if (invoiceStyle === "minimal_compact") {
    styleSpecificCss = `
      .receipt { padding: 6px 4px !important; }
      .store-name { font-size: 13px !important; margin: 2px 0 !important; }
      .meta { font-size: 10px !important; margin: 1px 0 !important; }
      .divider { margin: 3px 0 !important; }
      .items-table td { padding: 1px 2px !important; font-size: 10.5px !important; }
      .grand-total td { font-size: 13px !important; padding-top: 2px !important; }
      .footer { margin-top: 4px !important; font-size: 10px !important; }
    `;
  } else if (invoiceStyle === "dark_voucher") {
    styleSpecificCss = `
      .receipt { border: 2px solid #000000; }
      .header { background: #000000; color: #FFFFFF; padding: 8px 4px; margin: -10px -10px 8px -10px; }
      .header .store-name { color: #FFFFFF !important; }
      .header div { color: #E2E8F0; }
      .copy-badge { background: #FFFFFF; color: #000000; font-weight: 900; }
      .grand-total td { background: #000000; color: #FFFFFF; padding: 4px !important; }
    `;
  }

  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontBase};
      background: #f5f5f5;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px 0;
    }
    .receipt {
      width: ${receiptWidth};
      background: #fff;
      padding: ${isNarrow ? "12px 10px" : "20px 18px"};
      box-shadow: 0 2px 12px rgba(0,0,0,.15);
      margin-bottom: 16px;
    }
    .center { text-align: center; }
    .header { text-align: center; margin-bottom: 6px; }
    .copy-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      border: 1px solid #333;
      padding: 1px 6px;
      border-radius: 3px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .store-name {
      font-size: ${isNarrow ? "14px" : "20px"};
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin: 4px 0;
    }
    .divider {
      border: none;
      border-top: 1px dashed #555;
      margin: 6px 0;
    }
    .meta { font-size: ${fontBase}; margin: 2px 0; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    .items-table th {
      font-size: ${fontBase};
      font-weight: 700;
      padding: 3px 4px;
      border-bottom: 1px solid #333;
      text-align: left;
    }
    .items-table th:nth-child(2) { text-align: center; }
    .items-table th:nth-child(3),
    .items-table th:nth-child(4) { text-align: right; }
    .items-table td { font-size: ${fontBase}; vertical-align: top; }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    .totals-table td { font-size: ${fontBase}; padding: 1px 0; }
    .grand-total td {
      font-size: ${isNarrow ? "13px" : "16px"};
      font-weight: 900;
      border-top: 1px solid #333;
      padding-top: 4px;
    }
    .footer {
      text-align: center;
      margin-top: 10px;
      font-size: ${fontBase};
      color: #555;
    }
    .cut-line {
      width: ${receiptWidth};
      text-align: center;
      font-size: 11px;
      color: #888;
      margin: 12px 0;
      letter-spacing: 2px;
    }
    @media print {
      @page {
        size: auto;
        margin: 1mm 1mm;
      }
      body {
        background: #fff;
        padding: 0;
        margin: 0;
        display: block;
      }
      .receipt {
        box-shadow: none;
        margin: 0 auto;
        width: 100% !important;
        max-width: ${receiptWidth};
        padding: 4px 2px;
      }
      .page-break {
        page-break-after: always;
        break-after: page;
      }
      .cut-line {
        display: block;
        border-top: 1px dashed #000;
        margin: 10px 0;
        padding-top: 4px;
      }
    }
    ${styleSpecificCss}
  `;
}

function buildCustomerReceiptCard(invoice, storeInfo = {}, options = {}, copyTitle = "CUSTOMER COPY") {
  const {
    businessName = "My Store",
    address = "",
    phone = "",
    email = "",
    logo = "",
    gstin = "",
  } = storeInfo;

  const {
    paperWidth = "3inch",
    showLogo = true,
    showTokenNumber = true,
    showCustomerPhone = true,
    showEmail = true,
    showGstin = true,
    footerNote = "Thank you! Visit again.",
    showBillType = true,
    invoiceStyle = "modern_zudio",
  } = options;

  const isNarrow = paperWidth === "2inch" || paperWidth === "3inch";
  const rawToken = String(invoice?.invoiceNumber || invoice?.tokenNumber || "--");
  const tokenDisplay = rawToken.replace(/[^0-9]/g, "") || rawToken;

  const itemRows = (invoice?.items || []).map((it) => {
    const name = it.name || "";
    const qty = it.quantity || 0;
    const rate = it.sellingPrice || it.rate || 0;
    const total = it.total || qty * rate;
    const hsnText = invoiceStyle === "gst_detailed" && it.hsnCode ? `<div style="font-size:9px;color:#64748B;">HSN: ${it.hsnCode}</div>` : "";
    return `<tr>
      <td style="padding:3px 0;word-break:break-word;max-width:${isNarrow ? "110px" : "220px"}">${name}${hsnText}</td>
      <td style="padding:3px 4px;text-align:center">${qty}</td>
      <td style="padding:3px 4px;text-align:right">${rate}</td>
      <td style="padding:3px 0;text-align:right;font-weight:700">${total}</td>
    </tr>`;
  }).join("");

  const paymentMode = (invoice?.paymentMode || "CASH").toUpperCase();
  const saleLabel =
    paymentMode === "CREDIT"
      ? "Credit Sale (Due)"
      : paymentMode === "UPI"
      ? "UPI Sale"
      : paymentMode === "UPI/CASH"
      ? "Split Sale (Cash + UPI)"
      : `${paymentMode === "CASH" ? "Cash" : paymentMode} Sale`;

  let paymentBreakdown = "";
  if (paymentMode === "UPI/CASH") {
    paymentBreakdown = `<tr><td colspan="3" style="padding:1px 0">Cash</td><td style="text-align:right">Rs. ${invoice?.cashAmount || 0}</td></tr><tr><td colspan="3" style="padding:1px 0">UPI</td><td style="text-align:right">Rs. ${invoice?.upiAmount || 0}</td></tr>`;
  }

  const logoHtml = showLogo && logo ? `<div style="text-align:center;margin-bottom:6px"><img src="${logo}" style="width:${isNarrow ? "56px" : "76px"};height:${isNarrow ? "56px" : "76px"};object-fit:contain;border-radius:6px" /></div>` : "";
  const gstinHtml = showGstin && gstin ? `<div>GSTIN: ${gstin}</div>` : "";
  const emailHtml = showEmail && email ? `<div>@: ${email}</div>` : "";

  const createdOn = formatReceiptDate(invoice?.createdAt || invoice?.invoiceDate);
  const custName = (invoice?.partyName || "").trim();
  const custPhone = showCustomerPhone && invoice?.partyPhone ? invoice.partyPhone : "";
  const billToCustomer =
    custName && custName !== "Walk-in Customer"
      ? `<div class="meta">Bill To: ${custName}${custPhone ? " | " + custPhone : ""}</div>`
      : custPhone
      ? `<div class="meta">Phone: ${custPhone}</div>`
      : "";

  const discountRow = invoice?.regularDiscountAmount > 0
    ? `<tr><td colspan="3">Discount (${invoice?.regularDiscountRate || invoice?.regularDiscountAppliedPercent || ""}%)</td><td style="text-align:right;color:#059669;font-weight:700">-${invoice.regularDiscountAmount}</td></tr>`
    : "";
  const freebieRow = invoice?.freebieItemGiven
    ? `<tr><td colspan="3">Freebie</td><td style="text-align:right;color:#2563eb;font-weight:700">${invoice.freebieItemGiven}</td></tr>`
    : "";

  const totalSavings = (invoice?.discountTotal || 0) + (invoice?.regularDiscountAmount || 0);
  const savingsHtml = totalSavings > 0
    ? `<div class="savings-pill">You Saved Rs. ${totalSavings.toFixed(0)} on this bill!</div>`
    : "";

  const signHtml = invoiceStyle === "gst_detailed"
    ? `<div class="sign-box">For ${businessName}<br/><br/>Authorized Signatory</div>`
    : "";

  const orderSource = (invoice?.orderSource || "COUNTER").toUpperCase();
  const extOrderId = (invoice?.externalOrderId || "").trim();
  const channelLabel =
    orderSource !== "COUNTER"
      ? `${orderSource}${extOrderId ? ` #${extOrderId}` : ""}`
      : "";

  return `
    <div class="receipt">
      <div class="center"><span class="copy-badge">${copyTitle}${channelLabel ? ` • ${channelLabel}` : ""}</span></div>
      <div class="header">
        ${logoHtml}
        <div class="store-name">${businessName}</div>
        ${address ? `<div style="margin-top:2px;line-height:1.35">${address}</div>` : ""}
        ${phone ? `<div>Phone: ${phone}</div>` : ""}
        ${emailHtml}
        ${gstinHtml}
      </div>
      <hr class="divider"/>
      ${showTokenNumber ? `<div class="meta"><b>Bill No: ${tokenDisplay}</b>${channelLabel ? ` &nbsp;|&nbsp; <b>${channelLabel}</b>` : ""}</div>` : ""}
      <div class="meta">Created On: ${createdOn}</div>
      ${showBillType ? `<div class="meta">Bill To: ${saleLabel}</div>` : ""}
      ${billToCustomer}
      <hr class="divider"/>
      <table class="items-table">
        <thead>
          <tr><th>Item Name</th><th>Qty</th><th>Rate</th><th>Total</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <hr class="divider"/>
      <table class="totals-table">
        <tr><td colspan="3">Subtotal</td><td style="text-align:right">Rs. ${invoice?.subtotal || invoice?.grandTotal || 0}</td></tr>
        ${discountRow}
        ${freebieRow}
        <tr class="grand-total"><td colspan="3">Grand Total</td><td style="text-align:right">Rs. ${invoice?.grandTotal || 0}</td></tr>
        <tr><td colspan="3" style="padding:4px 0 1px">Payment</td><td style="text-align:right;padding:4px 0 1px;font-weight:700">${paymentMode} (${invoice?.paymentStatus || "PAID"})</td></tr>
        ${paymentBreakdown}
      </table>
      ${savingsHtml}
      ${signHtml}
      <hr class="divider"/>
      <div class="footer">${footerNote}</div>
    </div>
  `;
}

function buildCookerReceiptCard(invoice, storeInfo = {}) {
  const { businessName = "Kitchen" } = storeInfo;
  const rawToken = String(invoice?.invoiceNumber || invoice?.tokenNumber || "--");
  const tokenDisplay = rawToken.replace(/[^0-9]/g, "") || rawToken;
  const createdOn = formatReceiptDate(invoice?.createdAt || invoice?.invoiceDate);

  let totalItemsQty = 0;
  const cookerRows = (invoice?.items || []).map((it, idx) => {
    const qty = it.quantity || 1;
    totalItemsQty += Number(qty) || 0;
    return `
      <tr>
        <td style="padding:4px 0;font-size:13px;font-weight:700;word-break:break-word">${idx + 1}. ${it.name}</td>
        <td style="padding:4px 0;text-align:right;font-size:16px;font-weight:900">x ${qty}</td>
      </tr>
    `;
  }).join("");

  const orderSource = (invoice?.orderSource || "COUNTER").toUpperCase();
  const extOrderId = (invoice?.externalOrderId || "").trim();
  const channelBadge =
    orderSource !== "COUNTER"
      ? `<div class="center" style="font-size:14px;font-weight:900;background:#000;color:#fff;padding:3px 6px;margin:4px 0;border-radius:4px;">${orderSource}${extOrderId ? ` • #${extOrderId}` : ""}</div>`
      : "";

  return `
    <div class="receipt cooker-receipt" style="border: 2px solid #000;">
      <div class="center"><span class="copy-badge" style="background:#000;color:#fff;">*** COOKER / KITCHEN KOT ***</span></div>
      ${channelBadge}
      <div class="header" style="margin-top:4px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;">${businessName}</div>
      </div>
      <hr class="divider"/>
      <div class="center" style="font-size:36px;font-weight:900;letter-spacing:2px;margin:2px 0">
        TOKEN: #${tokenDisplay}
      </div>
      <hr class="divider"/>
      <div class="meta" style="font-size:12px;"><b>Bill No:</b> #${tokenDisplay}</div>
      <div class="meta" style="font-size:12px;"><b>Time:</b> ${createdOn}</div>
      ${invoice?.partyName && invoice.partyName !== "Walk-in Customer" ? `<div class="meta" style="font-size:12px;"><b>Customer:</b> ${invoice.partyName}</div>` : ""}
      <hr class="divider"/>
      <table style="width:100%;border-collapse:collapse;margin:4px 0;">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th style="text-align:left;font-size:12px;font-weight:900;padding-bottom:3px;">ORDERED ITEM</th>
            <th style="text-align:right;font-size:12px;font-weight:900;padding-bottom:3px;">QTY</th>
          </tr>
        </thead>
        <tbody>
          ${cookerRows}
        </tbody>
      </table>
      <hr class="divider"/>
      <div class="center" style="font-size:13px;font-weight:900;margin-top:6px;">
        TOTAL QUANTITY: ${totalItemsQty}
      </div>
      <div class="center" style="font-size:10px;color:#555;margin-top:4px;">
        [ Kitchen Copy - Prepare Order ]
      </div>
    </div>
  `;
}

export function buildReceiptHtml(invoice, storeInfo = {}, options = {}, mode = "all") {
  const { paperWidth = "2inch", invoiceStyle = "modern_zudio" } = options;
  const widthMap = { "2inch": "220px", "3inch": "302px", "A4": "595px", "A5": "420px" };
  const receiptWidth = widthMap[paperWidth] || "220px";
  const isNarrow = paperWidth === "2inch" || paperWidth === "3inch";
  const fontBase = isNarrow ? "11px" : "13px";

  const rawToken = String(invoice?.invoiceNumber || invoice?.tokenNumber || "--");
  const tokenDisplay = rawToken.replace(/[^0-9]/g, "") || rawToken;

  let bodyContent = "";

  if (mode === "single") {
    bodyContent = buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY");
  } else if (mode === "cooker" || mode === "kot") {
    bodyContent = buildCookerReceiptCard(invoice, storeInfo);
  } else if (mode === "customer") {
    bodyContent = `
      ${buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY - 1")}
      <div class="cut-line">✂ - - - - - - - - - - - - - - - - - - ✂</div>
      <div class="page-break"></div>
      ${buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY - 2")}
    `;
  } else {
    bodyContent = `
      ${buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY - 1")}
      <div class="cut-line">✂ - - - - - - - - - - - - - - - - - - ✂</div>
      <div class="page-break"></div>
      ${buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY - 2")}
      <div class="cut-line">✂ - - - - - - - - - - - - - - - - - - ✂</div>
      <div class="page-break"></div>
      ${buildCookerReceiptCard(invoice, storeInfo)}
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Bill #${tokenDisplay}</title>
  <style>
    ${getReceiptStyles(receiptWidth, fontBase, isNarrow, invoiceStyle)}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

export async function shareBillAsPdf(invoice, storeInfo = {}, options = {}, mode = "all") {
  try {
    const safeOpts = { paperWidth: "2inch", invoiceStyle: "modern_zudio", ...options };
    const html = buildReceiptHtml(invoice, storeInfo, safeOpts, mode);

    if (Platform.OS === "web") {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        setTimeout(() => { try { win.print(); } catch(e){} }, 800);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `Bill-${invoice?.invoiceNumber || "receipt"}.html`;
        a.click();
      }
      return { success: true };
    }

    const Print = await import("expo-print");
    const Sharing = await import("expo-sharing");
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Bill #${invoice?.invoiceNumber || ""}`,
        UTI: "com.adobe.pdf",
      });
    }
    return { success: true, uri };
  } catch (err) {
    console.error("shareBillAsPdf error:", err);
    return { success: false, error: err.message || "Failed to share receipt" };
  }
}

export async function printBill(invoice, storeInfo = {}, options = {}, mode = "all") {
  try {
    const safeOpts = { paperWidth: "2inch", invoiceStyle: "modern_zudio", ...options };
    const html = buildReceiptHtml(invoice, storeInfo, safeOpts, mode);
    if (Platform.OS === "web") {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) setTimeout(() => { try { win.print(); } catch(e){} }, 800);
      return { success: true };
    }
    const Print = await import("expo-print");
    await Print.printAsync({ html });
    return { success: true };
  } catch (err) {
    console.error("printBill error:", err);
    return { success: false, error: err.message || "Failed to print receipt" };
  }
}

export async function printTestSlip(storeInfo = {}, options = {}, mode = null) {
  const sampleInvoice = {
    invoiceNumber: "TEST-01",
    partyName: "Walk-in Cash Customer",
    partyPhone: "9876543210",
    createdAt: new Date().toISOString(),
    paymentMode: "CASH",
    items: [
      { name: "Crispy Chicken Burger", quantity: 2, sellingPrice: 149, total: 298, hsnCode: "2106" },
      { name: "Farmhouse Cheesy Pizza", quantity: 1, sellingPrice: 249, total: 249, hsnCode: "2106" },
      { name: "Cold Coffee Frappe", quantity: 2, sellingPrice: 89, total: 178, hsnCode: "2202" },
    ],
    subtotal: 725,
    regularDiscountAmount: 35,
    regularDiscountRate: 5,
    grandTotal: 690,
  };
  const targetMode = mode || options?.printTarget || "both";
  return printBill(sampleInvoice, storeInfo, options, targetMode);
}
