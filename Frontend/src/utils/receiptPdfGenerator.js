/**
 * Thermal Receipt PDF Generator
 * Generates thermal receipts matching custom formatting:
 * - 2 Bills for Customers (Customer Copy + Store Copy)
 * - 1 Short Bill for Cookers (Kitchen Order Ticket / KOT)
 * Uses expo-print + expo-sharing on native, window.print on web.
 */
import { Platform, Linking } from "react-native";
import { getApiBaseUrl, getAuthToken } from "../config/api";

/**
 * Downloads the backend-generated PDF invoice (Zudio / Petpooja style) and
 * opens the native share sheet so the user can send it directly via WhatsApp.
 * On Web, it triggers a browser download.
 *
 * @param {Object} invoice  - Invoice object (must have _id)
 * @param {string} fileName - Optional custom file name
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function shareBackendPdf(invoice, fileName = null) {
  const invoiceId = invoice?._id;
  if (!invoiceId) return { success: false, error: "Invoice ID missing" };

  const token = getAuthToken();
  const baseUrl = getApiBaseUrl(); // e.g. https://billing-app-backend-lake.vercel.app/api
  const pdfUrl = `${baseUrl}/invoices/${invoiceId}/pdf`;
  const safeFileName = fileName || `Invoice_${invoice.invoiceNumber || invoiceId}.pdf`;

  // ─── WEB ────────────────────────────────────────────────────────────────────
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
      try { Linking.openURL(pdfUrl); } catch {}
      return { success: true };
    }
  }

  // ─── NATIVE (Android / iOS) ─────────────────────────────────────────────────
  try {
    const FileSystem = await import("expo-file-system");
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
      // Fallback: open the public URL in browser
      const publicUrl = `${baseUrl.replace(/\/api$/, "")}/api/invoices/public/${invoiceId}/pdf`;
      Linking.openURL(publicUrl);
    }
    return { success: true, uri: downloadResult.uri };
  } catch (err) {
    console.error("[PDF] Native share error:", err.message);
    // Last resort — open public (no-auth) view URL
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

function getReceiptStyles(receiptWidth, fontBase, isNarrow) {
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
      body { background: #fff; padding: 0; }
      .receipt { box-shadow: none; margin-bottom: 0; }
      .page-break { page-break-after: always; break-after: page; }
      .cut-line { display: block; border-top: 1px dashed #000; margin: 15px 0; padding-top: 5px; }
    }
  `;
}

function buildCustomerReceiptCard(invoice, storeInfo = {}, options = {}, copyTitle = "CUSTOMER COPY") {
  const {
    businessName = "My Store",
    address = "",
    phone = "7003317615",
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

  const isNarrow = paperWidth === "2inch" || paperWidth === "3inch";
  const rawToken = invoice?.invoiceNumber || invoice?.tokenNumber || "--";
  const tokenDisplay = rawToken.replace(/[^0-9]/g, "") || rawToken;

  const itemRows = (invoice?.items || []).map((it) => {
    const name = it.name || "";
    const qty = it.quantity || 0;
    const rate = it.sellingPrice || it.rate || 0;
    const total = it.total || qty * rate;
    return `<tr>
      <td style="padding:2px 0;word-break:break-word;max-width:${isNarrow ? "100px" : "200px"}">${name}</td>
      <td style="padding:2px 4px;text-align:center">${qty}</td>
      <td style="padding:2px 4px;text-align:right">${rate}</td>
      <td style="padding:2px 0;text-align:right;font-weight:700">${total}</td>
    </tr>`;
  }).join("");

  const paymentMode = invoice?.paymentMode || "CASH";
  let paymentBreakdown = "";
  if (paymentMode === "UPI/CASH") {
    paymentBreakdown = `<tr><td colspan="3" style="padding:1px 0">Cash</td><td style="text-align:right">Rs. ${invoice?.cashAmount || 0}</td></tr><tr><td colspan="3" style="padding:1px 0">UPI</td><td style="text-align:right">Rs. ${invoice?.upiAmount || 0}</td></tr>`;
  }

  const logoHtml = showLogo && logo ? `<img src="${logo}" style="width:70px;height:70px;object-fit:contain;border-radius:6px;margin-bottom:4px" />` : "";
  const gstinHtml = showGstin && gstin ? `<div>GSTIN: ${gstin}</div>` : "";
  const emailHtml = showEmail && email ? `<div>@: ${email}</div>` : "";
  const tokenHtml = showTokenNumber ? `<div style="font-size:${isNarrow ? "28px" : "36px"};font-weight:900;letter-spacing:2px;margin:4px 0">${tokenDisplay}</div>` : "";
  const createdOn = formatReceiptDate(invoice?.createdAt || invoice?.invoiceDate);
  const billToCustomer = (invoice?.partyName && invoice.partyName !== "Walk-in Customer")
    ? `<div>Bill To: ${invoice.partyName}${showCustomerPhone && invoice?.partyPhone ? " | " + invoice.partyPhone : ""}</div>`
    : "";
  const discountRow = invoice?.regularDiscountAmount > 0
    ? `<tr><td colspan="3">Discount (${invoice?.regularDiscountRate || ""}%)</td><td style="text-align:right;color:#059669;font-weight:700">-${invoice.regularDiscountAmount}</td></tr>`
    : "";
  const freebieRow = invoice?.freebieItemGiven
    ? `<tr><td colspan="3">Freebie</td><td style="text-align:right;color:#2563eb;font-weight:700">${invoice.freebieItemGiven}</td></tr>`
    : "";

  return `
    <div class="receipt">
      <div class="center"><span class="copy-badge">${copyTitle}</span></div>
      <div class="header">
        ${logoHtml}
        <div class="store-name">${businessName}</div>
        ${address ? `<div>${address}</div>` : ""}
        ${phone ? `<div>Phone: ${phone}</div>` : ""}
        ${emailHtml}
        ${gstinHtml}
      </div>
      <hr class="divider"/>
      <div class="center">${tokenHtml}</div>
      <hr class="divider"/>
      <div class="meta">Bill No: ${tokenDisplay}</div>
      <div class="meta">Created On: ${createdOn}</div>
      ${showBillType ? `<div class="meta">Bill To: ${paymentMode === "CREDIT" ? "Credit" : "Cash Sale"}</div>` : ""}
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
        <tr><td colspan="3">Subtotal</td><td style="text-align:right">Rs. ${invoice?.subtotal || 0}</td></tr>
        ${discountRow}
        ${freebieRow}
        <tr class="grand-total"><td colspan="3">Grand Total</td><td style="text-align:right">Rs. ${invoice?.grandTotal || 0}</td></tr>
        <tr><td colspan="3" style="padding:4px 0 1px">Payment</td><td style="text-align:right;padding:4px 0 1px;font-weight:700">${paymentMode}</td></tr>
        ${paymentBreakdown}
      </table>
      <hr class="divider"/>
      <div class="footer">${footerNote}</div>
    </div>
  `;
}

function buildCookerReceiptCard(invoice, storeInfo = {}) {
  const { businessName = "Kitchen" } = storeInfo;
  const rawToken = invoice?.invoiceNumber || invoice?.tokenNumber || "--";
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

  return `
    <div class="receipt cooker-receipt" style="border: 2px solid #000;">
      <div class="center"><span class="copy-badge" style="background:#000;color:#fff;">*** COOKER / KITCHEN KOT ***</span></div>
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

/**
 * Builds Full HTML document
 * @param {Object} invoice
 * @param {Object} storeInfo
 * @param {Object} options
 * @param {string} mode: "all" (2 customer + 1 cooker) | "customer" (2 customer copies) | "cooker" (1 cooker slip) | "single" (1 customer copy)
 */
export function buildReceiptHtml(invoice, storeInfo = {}, options = {}, mode = "all") {
  const { paperWidth = "3inch" } = options;
  const widthMap = { "2inch": "220px", "3inch": "302px", "A4": "595px", "A5": "420px" };
  const receiptWidth = widthMap[paperWidth] || "302px";
  const isNarrow = paperWidth === "2inch" || paperWidth === "3inch";
  const fontBase = isNarrow ? "11px" : "13px";

  const rawToken = invoice?.invoiceNumber || invoice?.tokenNumber || "--";
  const tokenDisplay = rawToken.replace(/[^0-9]/g, "") || rawToken;

  let bodyContent = "";

  if (mode === "single") {
    bodyContent = buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY");
  } else if (mode === "cooker") {
    bodyContent = buildCookerReceiptCard(invoice, storeInfo);
  } else if (mode === "customer") {
    // 2 Customer Bills
    bodyContent = `
      ${buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY - 1")}
      <div class="cut-line">✂ - - - - - - - - - - - - - - - - - - ✂</div>
      <div class="page-break"></div>
      ${buildCustomerReceiptCard(invoice, storeInfo, options, "CUSTOMER COPY - 2")}
    `;
  } else {
    // "all": 2 Customer Bills + 1 Cooker Short Bill
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
    ${getReceiptStyles(receiptWidth, fontBase, isNarrow)}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

export async function shareBillAsPdf(invoice, storeInfo, options, mode = "all") {
  const html = buildReceiptHtml(invoice, storeInfo, options, mode);

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

export async function printBill(invoice, storeInfo, options, mode = "all") {
  const html = buildReceiptHtml(invoice, storeInfo, options, mode);
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
