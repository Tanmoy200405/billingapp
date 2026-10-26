/**
 * Thermal Receipt PDF Generator
 * Generates HTML matching the "THE A POP JAKO BITES" thermal receipt format.
 * Uses expo-print + expo-sharing on native, window.print on web.
 */
import { Platform } from "react-native";

function formatReceiptDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
}

export function buildReceiptHtml(invoice, storeInfo = {}, options = {}) {
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
  } = options;

  const widthMap = { "2inch": "220px", "3inch": "302px", "A4": "595px", "A5": "420px" };
  const receiptWidth = widthMap[paperWidth] || "302px";
  const isNarrow = paperWidth === "2inch" || paperWidth === "3inch";
  const fontBase = isNarrow ? "11px" : "13px";

  const rawToken = invoice?.invoiceNumber || invoice?.tokenNumber || "--";
  const tokenDisplay = rawToken.replace(/[^0-9]/g, "") || rawToken;

  const itemRows = (invoice?.items || []).map((it) => {
    const name = it.name || "";
    const qty = it.quantity || 0;
    const rate = it.sellingPrice || it.rate || 0;
    const total = it.total || qty * rate;
    return `<tr><td style="padding:2px 0;word-break:break-word;max-width:${isNarrow ? "100px" : "200px"}">${name}</td><td style="padding:2px 4px;text-align:center">${qty}</td><td style="padding:2px 4px;text-align:right">${rate}</td><td style="padding:2px 0;text-align:right;font-weight:700">${total}</td></tr>`;
  }).join("");

  const paymentMode = invoice?.paymentMode || "CASH";
  let paymentBreakdown = "";
  if (paymentMode === "UPI/CASH") {
    paymentBreakdown = `<tr><td colspan="3" style="padding:1px 0">Cash</td><td style="text-align:right">Rs. ${invoice?.cashAmount || 0}</td></tr><tr><td colspan="3" style="padding:1px 0">UPI</td><td style="text-align:right">Rs. ${invoice?.upiAmount || 0}</td></tr>`;
  }

  const logoHtml = showLogo && logo ? `<img src="${logo}" style="width:70px;height:70px;object-fit:contain;border-radius:6px;margin-bottom:4px" />` : "";
  const gstinHtml = showGstin && gstin ? `<div>GSTIN: ${gstin}</div>` : "";
  const emailHtml = showEmail && email ? `<div>@: ${email}</div>` : "";
  const tokenHtml = showTokenNumber ? `<div style="font-size:${isNarrow ? "28px" : "36px"};font-weight:900;letter-spacing:2px;margin:6px 0">${tokenDisplay}</div>` : "";
  const createdOn = formatReceiptDate(invoice?.createdAt);
  const billToCustomer = (invoice?.partyName && invoice.partyName !== "Walk-in Customer")
    ? `<div>Bill To: ${invoice.partyName}${showCustomerPhone && invoice?.partyPhone ? " | " + invoice.partyPhone : ""}</div>`
    : "";
  const discountRow = invoice?.regularDiscountAmount > 0
    ? `<tr><td colspan="3">Discount (${invoice?.regularDiscountRate || ""}%)</td><td style="text-align:right;color:#059669;font-weight:700">-${invoice.regularDiscountAmount}</td></tr>`
    : "";
  const freebieRow = invoice?.freebieItemGiven
    ? `<tr><td colspan="3">Freebie</td><td style="text-align:right;color:#2563eb;font-weight:700">${invoice.freebieItemGiven}</td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Bill #${tokenDisplay}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',Courier,monospace;font-size:${fontBase};background:#f5f5f5;display:flex;justify-content:center;padding:20px 0}.receipt{width:${receiptWidth};background:#fff;padding:${isNarrow ? "12px 10px" : "20px 18px"};box-shadow:0 2px 12px rgba(0,0,0,.15)}.center{text-align:center}.header{text-align:center;margin-bottom:6px}.store-name{font-size:${isNarrow ? "14px" : "20px"};font-weight:900;letter-spacing:1px;text-transform:uppercase;margin:4px 0}.divider{border:none;border-top:1px dashed #555;margin:6px 0}.meta{font-size:${fontBase};margin:2px 0}.items-table{width:100%;border-collapse:collapse;margin:4px 0}.items-table th{font-size:${fontBase};font-weight:700;padding:3px 4px;border-bottom:1px solid #333;text-align:left}.items-table th:nth-child(2){text-align:center}.items-table th:nth-child(3),.items-table th:nth-child(4){text-align:right}.items-table td{font-size:${fontBase};vertical-align:top}.totals-table{width:100%;border-collapse:collapse;margin:4px 0}.totals-table td{font-size:${fontBase};padding:1px 0}.grand-total td{font-size:${isNarrow ? "13px" : "16px"};font-weight:900;border-top:1px solid #333;padding-top:4px}.footer{text-align:center;margin-top:10px;font-size:${fontBase};color:#555}@media print{body{background:#fff;padding:0}.receipt{box-shadow:none}}</style>
</head><body><div class="receipt">
<div class="header">${logoHtml}<div class="store-name">${businessName}</div>${address ? `<div>${address}</div>` : ""}${phone ? `<div>Phone: ${phone}</div>` : ""}${emailHtml}${gstinHtml}</div>
<hr class="divider"/><div class="center">${tokenHtml}</div>
<hr class="divider"/>
<div class="meta">Bill No: ${tokenDisplay}</div>
<div class="meta">Created On: ${createdOn}</div>
${showBillType ? `<div class="meta">Bill To: ${paymentMode === "CREDIT" ? "Credit" : "Cash Sale"}</div>` : ""}
${billToCustomer}
<hr class="divider"/>
<table class="items-table"><thead><tr><th>Item Name</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>${itemRows}</tbody></table>
<hr class="divider"/>
<table class="totals-table">
<tr><td colspan="3">Subtotal</td><td style="text-align:right">Rs. ${invoice?.subtotal || 0}</td></tr>
${discountRow}${freebieRow}
<tr class="grand-total"><td colspan="3">Grand Total</td><td style="text-align:right">Rs. ${invoice?.grandTotal || 0}</td></tr>
<tr><td colspan="3" style="padding:4px 0 1px">Payment</td><td style="text-align:right;padding:4px 0 1px;font-weight:700">${paymentMode}</td></tr>
${paymentBreakdown}
</table>
<hr class="divider"/><div class="footer">${footerNote}</div>
</div></body></html>`;
}

export async function shareBillAsPdf(invoice, storeInfo, options) {
  const html = buildReceiptHtml(invoice, storeInfo, options);

  if (Platform.OS === "web") {
    try {
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
        dialogTitle: `Bill #${invoice?.invoiceNumber || ""}`,
        UTI: "com.adobe.pdf",
      });
    }
    return { success: true, uri };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function printBill(invoice, storeInfo, options) {
  const html = buildReceiptHtml(invoice, storeInfo, options);
  if (Platform.OS === "web") {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) setTimeout(() => { try { win.print(); } catch(e){} }, 800);
    return { success: true };
  }
  try {
    const Print = await import("expo-print");
    await Print.printAsync({ html });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
