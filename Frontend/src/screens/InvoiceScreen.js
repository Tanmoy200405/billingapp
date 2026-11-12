import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
  Image,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import { api } from "../config/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { shareBillAsPdf, shareBackendPdf, printBill } from "../utils/receiptPdfGenerator";
import { getCachedData, setCachedData, getMemoryCachedData } from "../utils/localCache";
import { queueOfflineInvoice, isNetworkErrorMessage, applyOfflineItemOpsToList, queueOfflineItemCreate } from "../utils/offlineQueue";
import { CURRENT_APP_VERSION } from "../services/updateService";
import { useResponsive } from "../utils/responsive";

export default function InvoiceScreen({ user, onBack, onInvoiceSaved, editingInvoice }) {
  const { isWide, isDesktop, posColumns, headerTopPadding } = useResponsive();
  const businessType = user?.businessType || "restaurant";
  const slipTitle =
    businessType === "salon"
      ? "SLIP"
      : businessType === "retail" || businessType === "general"
      ? "SLIP"
      : "KOT";
  const addItemLabel =
    businessType === "salon"
      ? "+ Service"
      : businessType === "retail"
      ? "+ Product"
      : "+ Item";
  // Step 1: "items" (first select items) | Step 2: "invoice" (customer & payment)
  const [currentStep, setCurrentStep] = useState("items");

  const [parties, setParties] = useState(() => getMemoryCachedData("parties_customers") || getMemoryCachedData("parties_all") || []);
  const [items, setItems] = useState(() => getMemoryCachedData("items_all") || []);
  const [selectedParty, setSelectedParty] = useState(null);
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [orderSource, setOrderSource] = useState("COUNTER");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [partySearch, setPartySearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [billFormatOptions, setBillFormatOptions] = useState({});
  const [printTarget, setPrintTarget] = useState("none"); // "none" (default: no auto-print dialog) | "both" | "customer" | "cooker"
  const [customDiscount, setCustomDiscount] = useState("");
  const [customFreebie, setCustomFreebie] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sharingPdf, setSharingPdf] = useState(false);
  const [kotSent, setKotSent] = useState(false);
  const [printingBill, setPrintingBill] = useState(false);

  const [showSearchBar, setShowSearchBar] = useState(false);
  const [showItemImages, setShowItemImages] = useState(true);
  const [heldBills, setHeldBills] = useState([]);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdNote, setHoldNote] = useState("");
  const [defaultAllParcel, setDefaultAllParcel] = useState(false);
  const [showParcelModal, setShowParcelModal] = useState(false);
  const [showQuickItemModal, setShowQuickItemModal] = useState(false);
  const [quickItemName, setQuickItemName] = useState("");
  const [quickItemPrice, setQuickItemPrice] = useState("");
  const [quickItemCategory, setQuickItemCategory] = useState("General");
  const [savingQuickItem, setSavingQuickItem] = useState(false);

  const showPosNotice = (title, message) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const formatISTDate = (dateVal) => {
    try {
      const d = new Date(dateVal || Date.now());
      if (isNaN(d.getTime())) return "";
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d).replace(",", "");
    } catch (e) {
      const d = new Date(dateVal || Date.now());
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }
  };

  useEffect(() => {
    loadPartiesAndItems();
    loadBillFormat();
    AsyncStorage.getItem("pos_held_bills")
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setHeldBills(parsed);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (editingInvoice) {
      if (editingInvoice.items && Array.isArray(editingInvoice.items)) {
        setCart(
          editingInvoice.items.map((it, idx) => ({
            _id: it.itemId || it._id || `edit_item_${idx}`,
            name: it.name || it.itemName || "Item",
            barcode: it.barcode || "",
            sellingPrice: Number(it.sellingPrice ?? it.price ?? it.rate ?? 0),
            quantity: Number(it.quantity || it.qty || 1),
            parcelQuantity: Number(it.parcelQuantity || 0),
            unit: it.unit || "PCS",
            taxRate: Number(it.taxRate) || 0,
          }))
        );
      }
      if (editingInvoice.partyName) setCustomerName(editingInvoice.partyName);
      if (editingInvoice.partyPhone) setCustomerPhone(editingInvoice.partyPhone);
      if (editingInvoice.paymentMode) setPaymentMode(editingInvoice.paymentMode);
      if (editingInvoice.cashAmount !== undefined && editingInvoice.cashAmount !== null) {
        setCashAmount(String(editingInvoice.cashAmount));
      }
      if (editingInvoice.upiAmount !== undefined && editingInvoice.upiAmount !== null) {
        setUpiAmount(String(editingInvoice.upiAmount));
      }
      if (editingInvoice.regularDiscountAppliedPercent !== undefined && editingInvoice.regularDiscountAppliedPercent !== null) {
        setCustomDiscount(String(editingInvoice.regularDiscountAppliedPercent));
      } else if (editingInvoice.discountPercent !== undefined && editingInvoice.discountPercent !== null) {
        setCustomDiscount(String(editingInvoice.discountPercent));
      }
      if (editingInvoice.freebieItemGiven) {
        setCustomFreebie(editingInvoice.freebieItemGiven);
      }
      setCurrentStep("invoice");
    }
  }, [editingInvoice]);

  const loadBillFormat = async () => {
    try {
      const stored = await AsyncStorage.getItem("billFormatOptions");
      if (stored) {
        const parsed = JSON.parse(stored);
        setBillFormatOptions(parsed);
        if (parsed.autoPrintBill && parsed.printTarget) {
          setPrintTarget(parsed.printTarget);
        } else {
          setPrintTarget("none");
        }
      }
    } catch { }
  };

  const loadPartiesAndItems = async () => {
    const [cachedParties, cachedItems] = await Promise.all([
      getCachedData("parties_customers"),
      getCachedData("items_all"),
    ]);
    if (Array.isArray(cachedParties) && cachedParties.length > 0) {
      setParties(cachedParties);
    }
    if (Array.isArray(cachedItems) && cachedItems.length > 0) {
      setItems(cachedItems);
    }

    const [pRes, iRes] = await Promise.all([
      api.parties.getAll("type=customer"),
      api.items.getAll(),
    ]);
    if (pRes && pRes.success) {
      setParties(pRes.parties || []);
      setCachedData("parties_customers", pRes.parties || []);
    }
    if (iRes && iRes.success && Array.isArray(iRes.items)) {
      const mergedItems = await applyOfflineItemOpsToList(iRes.items);
      const sorted = [...mergedItems].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
      setItems(sorted);
      setCachedData("items_all", sorted);
    }
  };

  const addItemToCart = (item) => {
    const existing = cart.find((c) => c._id === item._id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c._id === item._id
            ? {
                ...c,
                quantity: c.quantity + 1,
                parcelQuantity: defaultAllParcel
                  ? Math.min(c.quantity + 1, (c.parcelQuantity || 0) + 1)
                  : c.parcelQuantity || 0,
              }
            : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          _id: item._id,
          name: item.name,
          barcode: item.barcode,
          sellingPrice: item.sellingPrice,
          unit: item.unit || "PCS",
          taxRate: item.taxRate || 0,
          quantity: 1,
          parcelQuantity: defaultAllParcel ? 1 : 0,
        },
      ]);
    }
  };

  const removeItemFromCart = (itemId) => {
    const existing = cart.find((c) => c._id === itemId);
    if (existing && existing.quantity > 1) {
      const nextQty = existing.quantity - 1;
      setCart(
        cart.map((c) =>
          c._id === itemId
            ? {
                ...c,
                quantity: nextQty,
                parcelQuantity: Math.min(c.parcelQuantity || 0, nextQty),
              }
            : c
        )
      );
    } else {
      setCart(cart.filter((c) => c._id !== itemId));
    }
  };

  const clearItemFromCart = (itemId) => {
    setCart((prev) => prev.filter((c) => c._id !== itemId));
  };

  const getCartItem = (itemId) => cart.find((c) => c._id === itemId);

  const getCartItemQty = (itemId) => {
    const found = cart.find((c) => c._id === itemId);
    return found ? found.quantity : 0;
  };

  const cartTotalItems = cart.reduce((sum, c) => sum + c.quantity, 0);
  const cartTotalParcelItems = cart.reduce((sum, c) => sum + (c.parcelQuantity || 0), 0);

  const updateQuantity = (itemId, change) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c._id === itemId) {
            const nextQty = c.quantity + change;
            if (nextQty <= 0) return null;
            return {
              ...c,
              quantity: nextQty,
              parcelQuantity:
                defaultAllParcel && change > 0
                  ? Math.min(nextQty, (c.parcelQuantity || 0) + change)
                  : Math.min(c.parcelQuantity || 0, nextQty),
            };
          }
          return c;
        })
        .filter(Boolean)
    );
  };

  const setItemParcelQty = (itemId, targetParcelQty) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c._id !== itemId) return c;
        const clamped = Math.max(0, Math.min(c.quantity, Number(targetParcelQty) || 0));
        return { ...c, parcelQuantity: clamped };
      })
    );
  };

  const toggleParcelAll = (makeAll) => {
    setDefaultAllParcel(makeAll);
    setCart((prev) =>
      prev.map((c) => ({
        ...c,
        parcelQuantity: makeAll ? c.quantity : 0,
      }))
    );
  };

  const persistHeldBills = async (nextList) => {
    setHeldBills(nextList);
    try {
      await AsyncStorage.setItem("pos_held_bills", JSON.stringify(nextList));
    } catch {}
  };

  const handleHoldCurrentBill = async (customLabel = "") => {
    if (cart.length === 0) return;
    const entry = {
      id: `hold_${Date.now()}`,
      label:
        customLabel.trim() ||
        (customerName && customerName !== "Walk-in Customer" ? customerName.trim() : `Hold #${heldBills.length + 1}`),
      heldAt: new Date().toISOString(),
      cart,
      customerName,
      customerPhone,
      paymentMode,
      orderSource,
      externalOrderId,
      customDiscount,
      customFreebie,
      defaultAllParcel,
    };
    await persistHeldBills([entry, ...heldBills]);
    setHoldNote("");
    setShowHoldModal(false);
    handleResetForNextBill();
    showPosNotice("Bill Held", `"${entry.label}" saved on Hold. Tap HOLD to resume anytime.`);
  };

  const handleHoldButtonPress = () => {
    if (cart.length > 0 && heldBills.length === 0) {
      handleHoldCurrentBill();
    } else {
      setShowHoldModal(true);
    }
  };

  const handleResumeHeldBill = async (entry) => {
    setCart(Array.isArray(entry.cart) ? entry.cart : []);
    setCustomerName(entry.customerName || "Walk-in Customer");
    setCustomerPhone(entry.customerPhone || "");
    setPaymentMode(entry.paymentMode || "CASH");
    setOrderSource(entry.orderSource || "COUNTER");
    setExternalOrderId(entry.externalOrderId || "");
    setCustomDiscount(entry.customDiscount || "");
    setCustomFreebie(entry.customFreebie || "");
    setDefaultAllParcel(Boolean(entry.defaultAllParcel));
    await persistHeldBills(heldBills.filter((h) => h.id !== entry.id));
    setShowHoldModal(false);
  };

  const handleDeleteHeldBill = async (holdId) => {
    await persistHeldBills(heldBills.filter((h) => h.id !== holdId));
  };

  const handleSaveQuickItem = async () => {
    const name = quickItemName.trim();
    const price = Number(quickItemPrice);
    if (!name || isNaN(price) || price < 0) {
      showPosNotice("Required", "Enter item name and valid price");
      return;
    }
    setSavingQuickItem(true);
    const payload = {
      name,
      category: quickItemCategory.trim() || (selectedCategory !== "All" ? selectedCategory : "General"),
      sellingPrice: price,
      stock: 100,
      unit: "PCS",
      taxRate: 0,
    };
    try {
      let res = await api.items.create(payload).catch((e) => ({ success: false, message: e.message }));
      if (!res || (!res.success && isNetworkErrorMessage(res.message))) {
        res = await queueOfflineItemCreate(payload);
      }
      if (res && res.success && res.item) {
        setItems((prev) => [res.item, ...prev]);
        addItemToCart(res.item);
        setQuickItemName("");
        setQuickItemPrice("");
        setShowQuickItemModal(false);
      } else {
        showPosNotice("Error", res?.message || "Could not add item");
      }
    } finally {
      setSavingQuickItem(false);
    }
  };

  const subtotal = cart.reduce(
    (sum, c) => sum + c.sellingPrice * c.quantity,
    0
  );

  // Live search/match customer by phone number as merchant types
  const handlePhoneChange = (val) => {
    setCustomerPhone(val);
    const clean = val.replace(/[^0-9]/g, "");
    if (clean.length >= 4) {
      const matched = parties.find(
        (p) =>
          (p.phone && p.phone.slice(-10) === clean.slice(-10)) ||
          (p.whatsappNumber && p.whatsappNumber.slice(-10) === clean.slice(-10)) ||
          (p.phone && p.phone.includes(clean))
      );
      if (matched) {
        setMatchedCustomer(matched);
        if (customerName === "Walk-in Customer" || !customerName.trim()) {
          setCustomerName(matched.name);
        }
        if (matched.customDiscountPercent && !customDiscount) {
          setCustomDiscount(matched.customDiscountPercent.toString());
        }
        if (matched.assignedFreebie && !customFreebie) {
          setCustomFreebie(matched.assignedFreebie);
        }
        return;
      }
    }
    if (!selectedParty) {
      setMatchedCustomer(null);
    }
  };

  const activeCustomer = selectedParty || matchedCustomer;

  const appliedDiscountPercent = Number(customDiscount) || (activeCustomer?.customDiscountPercent || 0);

  const regularDiscountAmount = Math.round(
    (subtotal * appliedDiscountPercent) / 100
  );

  const grandTotal = Math.max(0, subtotal - regularDiscountAmount);

  const handlePaymentModeChange = (mode) => {
    setPaymentMode(mode);
    if (mode === "UPI/CASH") {
      const half = Math.floor(grandTotal / 2);
      setCashAmount(half.toString());
      setUpiAmount((grandTotal - half).toString());
    }
  };

  const handleCashAmountChange = (val) => {
    setCashAmount(val);
    const num = Number(val) || 0;
    const remaining = Math.max(0, grandTotal - num);
    setUpiAmount(remaining.toString());
  };

  const handleSelectParty = (party) => {
    if (!party) {
      setSelectedParty(null);
      setMatchedCustomer(null);
      setCustomerName("Walk-in Customer");
      setCustomerPhone("");
      setCustomDiscount("");
      setCustomFreebie("");
    } else {
      setSelectedParty(party);
      setMatchedCustomer(party);
      setCustomerName(party.name);
      setCustomerPhone(party.whatsappNumber || party.phone || "");
      if (party.customDiscountPercent) {
        setCustomDiscount(party.customDiscountPercent.toString());
      }
      if (party.assignedFreebie) {
        setCustomFreebie(party.assignedFreebie);
      }
    }
    setShowPartyModal(false);
  };

  const handleOrderSourceChange = (src) => {
    setOrderSource(src);
    if (src === "SWIGGY") {
      setPaymentMode("SWIGGY");
      setCashAmount("");
      setUpiAmount("");
    } else if (src === "ZOMATO") {
      setPaymentMode("ZOMATO");
      setCashAmount("");
      setUpiAmount("");
    } else if (paymentMode === "SWIGGY" || paymentMode === "ZOMATO") {
      setPaymentMode("CASH");
    }
  };

  const handleGenerateInvoice = async (overridePrintTarget = null) => {
    if (cart.length === 0) {
      showPosNotice("Empty Bill", "Please tap at least one food item to bill");
      setCurrentStep("items");
      return;
    }

    if (paymentMode === "UPI/CASH") {
      const cash = Number(cashAmount) || 0;
      const upi = Number(upiAmount) || 0;
      if (cash + upi !== grandTotal) {
        showPosNotice(
          "Payment Mismatch",
          `Cash (Rs. ${cash}) + UPI (Rs. ${upi}) must equal Grand Total (Rs. ${grandTotal})`
        );
        return;
      }
    }

    setLoading(true);
    const cleanPhone = customerPhone.replace(/[^0-9]/g, "");

    const payload = {
      partyId: activeCustomer ? activeCustomer._id : undefined,
      partyName: customerName.trim() || "Walk-in Customer",
      partyPhone: cleanPhone || undefined,
      autoSendWhatsApp: cleanPhone.length >= 10,
      paymentMode,
      orderSource,
      externalOrderId: externalOrderId.trim() || undefined,
      cashAmount: paymentMode === "UPI/CASH" ? Number(cashAmount) || 0 : undefined,
      upiAmount: paymentMode === "UPI/CASH" ? Number(upiAmount) || 0 : undefined,
      customDiscountPercent: Number(customDiscount) || (activeCustomer?.customDiscountPercent || 0),
      customFreebieItem: customFreebie.trim() || (activeCustomer?.assignedFreebie || ""),
      items: cart.map((c) => ({
        itemId: c._id,
        name: c.name,
        barcode: c.barcode,
        sellingPrice: c.sellingPrice,
        quantity: c.quantity,
        parcelQuantity: c.parcelQuantity || 0,
        unit: c.unit,
        taxRate: c.taxRate,
      })),
    };

    let finalRes = editingInvoice?._id
      ? await api.invoices.update(editingInvoice._id, payload)
      : await api.invoices.create(payload);

    if (
      !editingInvoice?._id &&
      (!finalRes || (!finalRes.success && isNetworkErrorMessage(finalRes.message)))
    ) {
      finalRes = await queueOfflineInvoice(payload, {
        subtotal,
        discountTotal: regularDiscountAmount,
        regularDiscountAmount,
        grandTotal,
      });
    }
    setLoading(false);

    if (finalRes && finalRes.success && finalRes.invoice) {
      setCreatedInvoice(finalRes.invoice);
      setWhatsappUrl(finalRes.whatsappUrl || "");
      setWhatsappSent(Boolean(finalRes.whatsappSent || finalRes.whatsappQueued));
      setKotSent(false);

      const shouldShowReceipt = billFormatOptions?.showReceiptModalOnSave !== false;
      if (shouldShowReceipt) {
        setShowReceiptModal(true);
      } else {
        showPosNotice(
          "Bill Saved",
          `Invoice #${finalRes.invoice.invoiceNumber} (₹${finalRes.invoice.grandTotal}) created!`
        );
        handleResetForNextBill();
        if (onInvoiceSaved) onInvoiceSaved();
      }

      if (editingInvoice) {
        if (Platform.OS === "web") {
          window.alert(finalRes.message || "Invoice updated successfully!");
        }
      } else if (finalRes.offlineQueued) {
        const msg = "No internet — Bill saved offline & will auto-sync when online!";
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Saved Offline", msg);
        }
      }

      // Automatic printing only if explicitly triggered via KOT button or autoPrintBill is turned ON in settings
      const shouldAutoPrint = Boolean(billFormatOptions?.autoPrintBill);
      const activePrintTarget = overridePrintTarget || (shouldAutoPrint ? (billFormatOptions?.printTarget || printTarget) : "none");
      if (activePrintTarget && activePrintTarget !== "none") {
        try {
          const storeData = {
            businessName: user?.businessName || "My Store",
            businessType: user?.businessType || "restaurant",
            phone: user?.phone || "",
            address: user?.address || "",
            email: user?.email || "",
            gstin: user?.gstin || "",
            logo: user?.logo || "",
            googleMapLocation: user?.googleMapLocation || "",
          };
          await printBill(finalRes.invoice, storeData, billFormatOptions, activePrintTarget);
          setKotSent(true);
        } catch (printErr) {
          console.warn("Thermal print notice (printer offline or skipped):", printErr.message);
        }
      }
    } else {
      const errorMsg = finalRes?.message || "Could not save invoice";
      if (Platform.OS === "web") {
        window.alert(errorMsg);
      } else {
        Alert.alert("Billing Failed", errorMsg);
      }
    }
  };

  const handleResendWhatsApp = async () => {
    if (!createdInvoice?._id) return;
    setSendingWa(true);
    try {
      const res = await api.invoices.sendWhatsApp(
        createdInvoice._id,
        createdInvoice.partyPhone || customerPhone
      );
      if (res.success && res.whatsappSent) {
        setWhatsappSent(true);
        Alert.alert("Delivered", "Invoice PDF delivered directly to customer's WhatsApp!");
      } else if (res.whatsappUrl) {
        setWhatsappUrl(res.whatsappUrl);
        Linking.openURL(res.whatsappUrl);
      } else {
        Alert.alert("Notice", res.message || "Could not send directly. Please use Share PDF button.");
      }
    } catch (err) {
      Alert.alert("Notice", err.message || "Failed to deliver WhatsApp message.");
    } finally {
      setSendingWa(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!createdInvoice) {
      Alert.alert("Notice", "No invoice data available to print.");
      return;
    }
    setPrintingBill(true);
    try {
      const storeData = {
        businessName: user?.businessName || "My Store",
        businessType: user?.businessType || "restaurant",
        phone: user?.phone || "",
        address: user?.address || "",
        email: user?.email || "",
        gstin: user?.gstin || "",
        logo: user?.logo || "",
        googleMapLocation: user?.googleMapLocation || "",
      };
      const target = printTarget === "none" ? "both" : printTarget;
      const opts = { paperWidth: "2inch", invoiceStyle: user?.invoiceStyle || billFormatOptions?.invoiceStyle || "modern_zudio", ...billFormatOptions };
      const res = await printBill(createdInvoice, storeData, opts, target);
      if (res && !res.success) {
        Alert.alert("Print Notice", res.error || "Could not print. Please check printer connection or print spooler.");
      }
    } catch (err) {
      console.error("Print receipt error:", err);
      Alert.alert("Print Notice", err.message || "Failed to trigger print.");
    } finally {
      setPrintingBill(false);
    }
  };

  const handleResetForNextBill = () => {
    setCart([]);
    setSelectedParty(null);
    setCustomerName("Walk-in Customer");
    setCustomerPhone("");
    setPaymentMode("CASH");
    setOrderSource("COUNTER");
    setExternalOrderId("");
    setDefaultAllParcel(false);
    setCashAmount("");
    setUpiAmount("");
    setCustomDiscount("");
    setCustomFreebie("");
    setCreatedInvoice(null);
    setShowReceiptModal(false);
    setCurrentStep("items");
  };

  const storeInfo = {
    businessName: user?.businessName || "",
    address: user?.address || "",
    phone: user?.phone || "",
    email: user?.email || "",
    logo: user?.logo || "",
    gstin: user?.gstin || "",
  };

  const categories = ["All", ...new Set(items.map((i) => i.category || "General").filter(Boolean))];

  const filteredItems = items
    .filter((i) => {
      const matchSearch = itemSearch
        ? i.name?.toLowerCase().includes(itemSearch.toLowerCase()) ||
        (i.barcode || "").toLowerCase().includes(itemSearch.toLowerCase())
        : true;
      const matchCategory = selectedCategory === "All" || (i.category || "General") === selectedCategory;
      return matchSearch && matchCategory;
    })
    .sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

  const showItemsPane = isWide || currentStep === "items";
  const showInvoicePane = isWide || currentStep === "invoice";

  const gridColumns = isDesktop ? 4 : isWide ? 3 : 2;

  const getCategorySelectedCount = (cat) => {
    if (cat === "All") return cartTotalItems;
    return cart.reduce((sum, c) => {
      const matched = items.find((i) => i._id === c._id);
      return (matched?.category || "General") === cat ? sum + c.quantity : sum;
    }, 0);
  };

  const parcelSummaryLabel =
    cartTotalParcelItems <= 0
      ? "Parcel"
      : cartTotalParcelItems >= cartTotalItems
      ? `All Parcel (${cartTotalParcelItems})`
      : `Parcel ${cartTotalParcelItems}/${cartTotalItems}`;

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-slate-50">
      {/* ────────────────── HEADER (BillingApp Blue Theme) ────────────────── */}
      <View
        style={{ paddingTop: headerTopPadding }}
        className="bg-blue-600 px-3 pb-3 flex-row items-center justify-between"
      >
        <View className="flex-row items-center flex-1 pr-2">
          <TouchableOpacity
            onPress={() => {
              if (!isWide && currentStep === "invoice") {
                setCurrentStep("items");
              } else {
                onBack();
              }
            }}
            className="mr-2.5 p-1"
          >
            <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-extrabold" numberOfLines={1}>
              {editingInvoice
                ? `Edit Bill #${editingInvoice.invoiceNumber}`
                : isWide
                ? "Select Items & Checkout"
                : currentStep === "items"
                ? "Select Items"
                : "Finalize Invoice"}
            </Text>
            <Text className="text-blue-100 text-[10px] font-medium" numberOfLines={1}>
              {`v${CURRENT_APP_VERSION}${user?.phone ? ` | ${user.phone}` : ""}${
                user?.businessName ? ` | ${user.businessName}` : ""
              }`}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          {!isWide && currentStep === "invoice" ? (
            <TouchableOpacity
              onPress={() => setCurrentStep("items")}
              className="bg-white/20 px-3 py-1.5 rounded-lg flex-row items-center"
            >
              <Ionicons name="grid-outline" size={15} color="#FFFFFF" />
              <Text className="text-white text-xs font-bold ml-1">Items</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setShowSearchBar((prev) => !prev)}
                className={`p-2 rounded-lg ${showSearchBar ? "bg-white/25" : ""}`}
              >
                <Ionicons name="search" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowQuickItemModal(true)}
                className="p-2 rounded-lg"
              >
                <Ionicons name="add-circle-outline" size={21} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleHoldButtonPress()}
                className="p-2 rounded-lg"
              >
                <Ionicons name="calculator-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: isWide ? "row" : "column" }}>
      {/* ────────────────── STEP 1 / LEFT PANE: SPLIT CATEGORY + 2-COL GRID ────────────────── */}
      {showItemsPane && (
        <View style={{ flex: isWide ? 1.4 : 1, backgroundColor: "#F1F5F9" }}>
          {/* Top Action Bar (+ Item | HOLD | Parcel | Toggle Images) */}
          <View className="bg-white px-2.5 py-2 border-b border-gray-200 flex-row items-center gap-1.5">
            <TouchableOpacity
              onPress={() => setShowQuickItemModal(true)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white items-center justify-center"
            >
              <Text className="text-xs font-bold text-gray-800">{addItemLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleHoldButtonPress}
              className={`flex-1 py-1.5 px-2 rounded-lg border items-center justify-center flex-row ${
                heldBills.length > 0
                  ? "bg-slate-800 border-slate-800"
                  : cart.length > 0
                  ? "bg-white border-gray-300"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <Text
                className={`text-xs font-extrabold ${
                  heldBills.length > 0 ? "text-white" : "text-gray-700"
                }`}
              >
                {heldBills.length > 0 ? `HOLD (${heldBills.length})` : "HOLD"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowParcelModal(true)}
              className={`flex-1 py-1.5 px-2 rounded-lg border items-center justify-center flex-row ${
                cartTotalParcelItems > 0 || defaultAllParcel
                  ? "bg-emerald-50 border-emerald-500"
                  : "bg-white border-gray-300"
              }`}
            >
              <Ionicons
                name="bag-handle-outline"
                size={13}
                color={cartTotalParcelItems > 0 || defaultAllParcel ? "#059669" : "#374151"}
              />
              <Text
                className={`text-xs font-extrabold ml-1 ${
                  cartTotalParcelItems > 0 || defaultAllParcel ? "text-emerald-700" : "text-gray-700"
                }`}
                numberOfLines={1}
              >
                {parcelSummaryLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowItemImages((prev) => !prev)}
              className={`p-1.5 rounded-lg border ${
                showItemImages ? "bg-white border-gray-300" : "bg-blue-50 border-blue-400"
              }`}
            >
              <Ionicons
                name={showItemImages ? "images-outline" : "eye-off-outline"}
                size={17}
                color={showItemImages ? "#475569" : "#2563EB"}
              />
            </TouchableOpacity>
          </View>

          {/* Optional Search Input */}
          {showSearchBar ? (
            <View className="bg-white px-3 py-2 border-b border-gray-200">
              <View className="flex-row bg-gray-100 rounded-lg px-3 py-1.5 items-center">
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput
                  className="flex-1 ml-2 text-xs text-gray-900"
                  placeholder={
                    businessType === "salon"
                      ? "Search service, product or code..."
                      : businessType === "retail"
                      ? "Search product, barcode..."
                      : "Search item, food or barcode..."
                  }
                  value={itemSearch}
                  onChangeText={setItemSearch}
                  autoFocus
                />
                {itemSearch ? (
                  <TouchableOpacity onPress={() => setItemSearch("")}>
                    <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* 2-Column Split Body: Left Category Sidebar + Right Item Tiles Grid */}
          <View style={{ flex: 1, flexDirection: "row" }}>
            {/* Left Vertical Categories Sidebar */}
            <View style={{ width: isWide ? 128 : 92, backgroundColor: "#F8FAFC", borderRightWidth: 1, borderRightColor: "#E2E8F0" }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 5, paddingBottom: 140 }}
              >
                {categories.map((cat) => {
                  const selectedCount = getCategorySelectedCount(cat);
                  const isActiveCat = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setSelectedCategory(cat)}
                      className={`px-2 py-2.5 mb-1.5 rounded-lg border ${
                        isActiveCat
                          ? "bg-blue-600 border-blue-600"
                          : selectedCount > 0
                          ? "bg-blue-50 border-blue-300"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold leading-4 ${
                          isActiveCat ? "text-white" : selectedCount > 0 ? "text-blue-900" : "text-gray-700"
                        }`}
                      >
                        {cat} ({selectedCount})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Right Multi-Column Food Tile Grid */}
            <View style={{ flex: 1 }}>
              <FlatList
                key={`pos-grid-${gridColumns}-${showItemImages}`}
                numColumns={gridColumns}
                columnWrapperStyle={{ gap: 6 }}
                data={filteredItems}
                keyExtractor={(i) => i._id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ padding: 6, paddingBottom: isWide ? 110 : 145 }}
                ListEmptyComponent={
                  <View className="items-center justify-center py-16 px-4">
                    <FontAwesome5 name="box-open" size={36} color="#CBD5E1" />
                    <Text className="text-gray-500 font-bold text-xs mt-3 text-center">
                      No food items match "{itemSearch || selectedCategory}"
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowQuickItemModal(true)}
                      className="mt-3 bg-blue-600 px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-white text-xs font-bold">+ Add Food Item</Text>
                    </TouchableOpacity>
                  </View>
                }
                renderItem={({ item }) => {
                  const cartEntry = getCartItem(item._id);
                  const qtyInCart = cartEntry ? cartEntry.quantity : 0;
                  const parcelInCart = cartEntry ? cartEntry.parcelQuantity || 0 : 0;

                  return (
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => addItemToCart(item)}
                      style={{
                        flex: 1,
                        maxWidth: `${100 / gridColumns - 1}%`,
                        backgroundColor: qtyInCart > 0 ? "#EFF6FF" : "#FFFFFF",
                        borderColor: qtyInCart > 0 ? "#2563EB" : "#E2E8F0",
                        borderWidth: 1,
                        borderRadius: 8,
                        padding: 6,
                        marginBottom: 6,
                        justifyContent: "space-between",
                        minHeight: showItemImages ? 132 : 76,
                      }}
                    >
                      {/* Red X Remove Badge on Top-Right when Selected */}
                      {qtyInCart > 0 ? (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation && e.stopPropagation();
                            clearItemFromCart(item._id);
                          }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            zIndex: 10,
                            backgroundColor: "#DC2626",
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name="close" size={12} color="#FFFFFF" />
                        </TouchableOpacity>
                      ) : null}

                      {/* Item Image Thumbnail */}
                      {showItemImages ? (
                        <View className="items-center justify-center mb-1.5 mt-0.5">
                          {item.imageUrl ? (
                            <Image
                              source={{ uri: item.imageUrl }}
                              style={{ width: "100%", height: 54, borderRadius: 6, backgroundColor: "#F1F5F9" }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View className="w-full h-12 rounded-md bg-gray-100 items-center justify-center border border-gray-200">
                              <Ionicons name="image-outline" size={22} color="#94A3B8" />
                            </View>
                          )}
                        </View>
                      ) : null}

                      {/* Item Title */}
                      <Text
                        className="text-xs font-extrabold text-gray-900 text-center leading-4 mb-2"
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>

                      {/* Bottom Row: [Qty / Parcel] on Left, [Dashed Price] on Right */}
                      <View className="flex-row items-center justify-between mt-auto">
                        <View className="flex-row items-center gap-1">
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation && e.stopPropagation();
                              if (qtyInCart > 0) removeItemFromCart(item._id);
                            }}
                            style={{
                              minWidth: 28,
                              paddingHorizontal: 5,
                              paddingVertical: 2,
                              borderRadius: 5,
                              borderWidth: 1,
                              borderColor: qtyInCart > 0 ? "#2563EB" : "#94A3B8",
                              backgroundColor: qtyInCart > 0 ? "#DBEAFE" : "#FFFFFF",
                              alignItems: "center",
                            }}
                          >
                            <Text className="text-[11px] font-extrabold text-gray-900">
                              {qtyInCart}
                            </Text>
                          </TouchableOpacity>

                          {qtyInCart > 0 ? (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation && e.stopPropagation();
                                setShowParcelModal(true);
                              }}
                              style={{
                                paddingHorizontal: 4,
                                paddingVertical: 2,
                                borderRadius: 5,
                                borderWidth: 1,
                                borderColor: parcelInCart > 0 ? "#059669" : "#94A3B8",
                                backgroundColor: parcelInCart > 0 ? "#ECFDF5" : "#FFFFFF",
                              }}
                            >
                              <Text
                                className="text-[9px] font-extrabold"
                                style={{ color: parcelInCart > 0 ? "#059669" : "#475569" }}
                              >
                                {parcelInCart > 0
                                  ? parcelInCart >= qtyInCart
                                    ? "P"
                                    : `${parcelInCart}P`
                                  : "D"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>

                        <View
                          style={{
                            borderWidth: 1,
                            borderStyle: "dashed",
                            borderColor: "#2563EB",
                            borderRadius: 5,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: "#FFFFFF",
                          }}
                        >
                          <Text className="text-[11px] font-extrabold text-gray-900">
                            {item.sellingPrice}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>

          {/* Sticky Bottom Checkout Strip (Exact 3-Tap POS Footer) */}
          <View className="bg-white border-t border-gray-300 px-3 pt-2 pb-2.5 shadow-lg">
            {/* Total + Paid Checkbox + Order Source/Payment Quick Chips */}
            <View className="flex-row items-center justify-between mb-1.5">
              <View className="flex-row items-center">
                <Text className="text-xs font-extrabold text-gray-900">
                  Total:{Number(grandTotal).toFixed(1)}
                </Text>
                <TouchableOpacity
                  onPress={() => handlePaymentModeChange(paymentMode === "CREDIT" ? "CASH" : "CREDIT")}
                  className="flex-row items-center ml-2.5"
                >
                  <Ionicons
                    name={paymentMode === "CREDIT" ? "square-outline" : "checkbox"}
                    size={18}
                    color="#2563EB"
                  />
                  <Text className="text-xs font-bold text-gray-800 ml-1">
                    {paymentMode === "CREDIT" ? "Credit (Unpaid)" : `Received:${Number(grandTotal).toFixed(1)}`}
                  </Text>
                </TouchableOpacity>
              </View>

              {cartTotalParcelItems > 0 ? (
                <TouchableOpacity
                  onPress={() => setShowParcelModal(true)}
                  className="bg-emerald-100 border border-emerald-400 px-2 py-0.5 rounded-full"
                >
                  <Text className="text-[10px] font-extrabold text-emerald-800">
                    {cartTotalParcelItems === cartTotalItems
                      ? "ALL PARCEL"
                      : `${cartTotalParcelItems}P / ${cartTotalItems - cartTotalParcelItems}D`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Quick Payment & Aggregator Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {[
                { label: "Cash", mode: "CASH", src: "COUNTER" },
                { label: "UPI", mode: "UPI", src: "COUNTER" },
                { label: "UPI/Cash", mode: "UPI/CASH", src: "COUNTER" },
                { label: "Swiggy", mode: "SWIGGY", src: "SWIGGY" },
                { label: "Zomato", mode: "ZOMATO", src: "ZOMATO" },
                { label: "Bank", mode: "BANK", src: "COUNTER" },
                { label: "Credit", mode: "CREDIT", src: "COUNTER" },
              ].map((pill) => {
                const isSelected = paymentMode === pill.mode;
                return (
                  <TouchableOpacity
                    key={pill.mode}
                    onPress={() => {
                      handlePaymentModeChange(pill.mode);
                      if (pill.src === "SWIGGY" || pill.src === "ZOMATO") {
                        setOrderSource(pill.src);
                      } else if (orderSource === "SWIGGY" || orderSource === "ZOMATO") {
                        setOrderSource("COUNTER");
                      }
                    }}
                    style={{
                      backgroundColor: isSelected ? "#2563EB" : "#FFFFFF",
                      borderColor: "#2563EB",
                      borderWidth: 1,
                    }}
                    className="px-3 py-1 rounded-full mr-1.5"
                  >
                    <Text
                      className={`text-[11px] font-bold ${
                        isSelected ? "text-white" : "text-gray-800"
                      }`}
                    >
                      {pill.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 3 Bottom Action Buttons: DETAILS | KOT | NEXT (₹ Amount) */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setCurrentStep("invoice")}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 bg-white items-center justify-center"
              >
                <Text className="text-xs font-extrabold text-gray-700">DETAILS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleGenerateInvoice("cooker")}
                disabled={loading || cart.length === 0}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 bg-white items-center justify-center"
              >
                <Text className="text-xs font-extrabold text-gray-700">{slipTitle}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (cart.length === 0) {
                    showPosNotice(
                      "Select Items",
                      businessType === "salon"
                        ? "Tap at least 1 service or product to continue"
                        : "Tap at least 1 item to continue"
                    );
                    return;
                  }
                  if (isWide) {
                    handleGenerateInvoice();
                  } else {
                    setCurrentStep("invoice");
                  }
                }}
                disabled={loading}
                style={{ backgroundColor: cart.length > 0 ? "#2563EB" : "#94A3B8" }}
                className="flex-1.5 px-4 py-2.5 rounded-lg items-center justify-center"
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-xs font-extrabold text-white">
                    {isWide ? `BILL (₹ ${grandTotal})` : `NEXT (₹ ${grandTotal})`}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ────────────────── STEP 2 / RIGHT PANE: CUSTOMER & PAYMENT DETAILS ────────────────── */}
      {showInvoicePane && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={
            isWide
              ? {
                  width: isDesktop ? 420 : 350,
                  borderLeftWidth: 1,
                  borderLeftColor: "#E5E7EB",
                  backgroundColor: "#F8FAFC",
                }
              : { flex: 1 }
          }
        >
          <ScrollView
            className="flex-1 p-4"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 120 }}
          >
            {/* Order Source Card (Counter / Takeaway / Swiggy / Zomato) */}
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Order Channel
              </Text>
              <View className="flex-row gap-2 flex-wrap">
                {[
                  { id: "COUNTER", label: "Counter", activeBg: "bg-blue-600 border-blue-600" },
                  { id: "TAKEAWAY", label: "Takeaway", activeBg: "bg-slate-800 border-slate-800" },
                  { id: "SWIGGY", label: "Swiggy", activeBg: "bg-emerald-600 border-emerald-600" },
                  { id: "ZOMATO", label: "Zomato", activeBg: "bg-blue-800 border-blue-800" },
                ].map((ch) => (
                  <TouchableOpacity
                    key={ch.id}
                    onPress={() => handleOrderSourceChange(ch.id)}
                    className={`px-3 py-2 rounded-xl border ${
                      orderSource === ch.id ? ch.activeBg : "bg-gray-100 border-gray-200"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        orderSource === ch.id ? "text-white" : "text-gray-700"
                      }`}
                    >
                      {ch.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {orderSource === "SWIGGY" || orderSource === "ZOMATO" ? (
                <View className="mt-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">
                    {orderSource === "SWIGGY" ? "Swiggy" : "Zomato"} Order ID (Shown on KOT & Bill)
                  </Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 font-semibold"
                    placeholder={orderSource === "SWIGGY" ? "e.g. #18492031" : "e.g. #5492018"}
                    value={externalOrderId}
                    onChangeText={setExternalOrderId}
                  />
                </View>
              ) : null}
            </View>

            {/* Customer Details Card */}
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Customer Details
                </Text>
                <TouchableOpacity onPress={() => setShowPartyModal(true)}>
                  <Text className="text-xs font-bold text-blue-600">
                    {selectedParty ? "Pick Another" : "Pick from Contacts"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">Customer Name</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 font-semibold"
                  placeholder="Walk-in Customer or name"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
              </View>

              <View className="mb-2">
                <Text className="text-xs font-bold text-gray-700 mb-1">
                  Customer WhatsApp / Phone Number
                </Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900"
                  placeholder="10-digit mobile number for WhatsApp PDF bill"
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={handlePhoneChange}
                  maxLength={15}
                />
              </View>

              {/* Visit Count & Customer Profile Badge */}
              {activeCustomer ? (
                <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 my-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Ionicons name="person-circle" size={24} color="#2563EB" />
                      <View className="ml-2">
                        <Text className="text-sm font-extrabold text-blue-950">
                          {activeCustomer.name}
                        </Text>
                        <Text className="text-[11px] font-bold text-blue-800">
                          Total Visits: <Text className="font-extrabold text-blue-900 text-xs">{activeCustomer.visitCount || 1}</Text> • Total Spent: Rs. {activeCustomer.totalSpent || 0}
                        </Text>
                      </View>
                    </View>
                    {(activeCustomer.isRegular || (activeCustomer.visitCount || 0) >= (user?.vipVisitThreshold || 3)) ? (
                      <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] font-extrabold text-emerald-800">VIP / Regular</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {customerPhone.trim().length >= 10 ? (
                <View className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex-row items-center mt-1">
                  <MaterialIcons name="send" size={16} color="#059669" />
                  <Text className="text-emerald-800 text-xs font-bold ml-1.5 flex-1">
                    Bill will be sent to WhatsApp: {customerPhone.trim()}
                  </Text>
                </View>
              ) : null}

              {/* Discount & Free Foods Section */}
              <View className="mt-3 pt-3 border-t border-gray-200">
                <Text className="text-xs font-bold text-gray-700 mb-2">
                  Custom Discount & Free Foods
                </Text>
                <View className="flex-row gap-2 mb-2">
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold text-gray-600 mb-1">
                      Discount (%):
                    </Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold text-emerald-800"
                      placeholder="e.g. 10"
                      keyboardType="numeric"
                      value={customDiscount}
                      onChangeText={setCustomDiscount}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold text-gray-600 mb-1">
                      Free Food / Gift:
                    </Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold text-blue-900"
                      placeholder="e.g. Cold Drink / Dessert"
                      value={customFreebie}
                      onChangeText={setCustomFreebie}
                    />
                  </View>
                </View>
                {appliedDiscountPercent > 0 ? (
                  <Text className="text-[11px] font-bold text-emerald-700">
                    🎉 {appliedDiscountPercent}% Discount Applied (-Rs. {regularDiscountAmount})
                  </Text>
                ) : null}
                {customFreebie ? (
                  <Text className="text-[11px] font-bold text-blue-700 mt-0.5">
                    🎁 Complimentary: {customFreebie}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Billed Items Summary Card */}
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Billed Items ({cart.length})
                </Text>
                <View className="flex-row items-center gap-3">
                  <TouchableOpacity onPress={() => setShowParcelModal(true)}>
                    <Text className="text-xs font-bold text-emerald-700">
                      {cartTotalParcelItems > 0 ? `Parcel (${cartTotalParcelItems}/${cartTotalItems})` : "Parcel / Dine-in"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCurrentStep("items")}>
                    <Text className="text-xs font-bold text-blue-600">+ Add / Change</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {cart.map((c, index) => (
                <View
                  key={c._id}
                  className="flex-row items-center justify-between py-2.5 border-b border-gray-100 last:border-b-0"
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-bold text-gray-900">
                      {index + 1}. {c.name}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-0.5 flex-wrap">
                      <Text className="text-xs text-gray-500">
                        Rs. {c.sellingPrice} / {c.unit}
                      </Text>
                      {(c.parcelQuantity || 0) > 0 ? (
                        <TouchableOpacity
                          onPress={() => setShowParcelModal(true)}
                          className="bg-emerald-100 px-1.5 py-0.5 rounded"
                        >
                          <Text className="text-[10px] font-extrabold text-emerald-800">
                            {c.parcelQuantity >= c.quantity
                              ? "PARCEL"
                              : `${c.parcelQuantity} Parcel · ${c.quantity - c.parcelQuantity} Dine-in`}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  <View className="flex-row items-center mr-3">
                    <TouchableOpacity
                      onPress={() => updateQuantity(c._id, -1)}
                      className="w-7 h-7 rounded-lg bg-gray-100 items-center justify-center"
                    >
                      <Ionicons name="remove" size={16} color="#374151" />
                    </TouchableOpacity>
                    <Text className="text-sm font-bold text-gray-900 w-8 text-center">
                      {c.quantity}
                    </Text>
                    <TouchableOpacity
                      onPress={() => updateQuantity(c._id, 1)}
                      className="w-7 h-7 rounded-lg bg-blue-100 items-center justify-center"
                    >
                      <Ionicons name="add" size={16} color="#2563EB" />
                    </TouchableOpacity>
                  </View>

                  <Text className="text-sm font-extrabold text-gray-900 w-16 text-right">
                    Rs. {c.sellingPrice * c.quantity}
                  </Text>
                </View>
              ))}
            </View>

            {/* Payment Mode Selection Card */}
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Payment Mode
              </Text>
              <View className="flex-row gap-2 flex-wrap">
                {["CASH", "UPI", "UPI/CASH", "BANK", "CHEQUE", "CREDIT", "SWIGGY", "ZOMATO"].map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => handlePaymentModeChange(mode)}
                    className={`px-3 py-2 rounded-xl border ${paymentMode === mode
                        ? "bg-blue-600 border-blue-600"
                        : "bg-gray-100 border-gray-200"
                      }`}
                  >
                    <Text
                      className={`text-xs font-bold ${paymentMode === mode ? "text-white" : "text-gray-700"
                        }`}
                    >
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {paymentMode === "UPI/CASH" ? (
                <View className="mt-3 bg-blue-50/70 border border-blue-200 rounded-xl p-3">
                  <Text className="text-xs font-bold text-blue-900 mb-2">
                    Split Payment (Cash + UPI)
                  </Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-gray-700 mb-1">
                        Cash Amount (Rs)
                      </Text>
                      <TextInput
                        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900"
                        keyboardType="numeric"
                        value={cashAmount}
                        onChangeText={handleCashAmountChange}
                        placeholder="0"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-gray-700 mb-1">
                        UPI Amount (Rs)
                      </Text>
                      <TextInput
                        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-gray-900"
                        keyboardType="numeric"
                        value={upiAmount}
                        onChangeText={setUpiAmount}
                        placeholder="0"
                      />
                    </View>
                  </View>
                  <Text className="text-[11px] text-gray-500 mt-2">
                    Total: Rs. {(Number(cashAmount) || 0) + (Number(upiAmount) || 0)} / Rs. {grandTotal}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Grand Total Summary */}
            <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200 shadow-sm">
              <View className="flex-row justify-between mb-2">
                <Text className="text-xs text-gray-600">Subtotal</Text>
                <Text className="text-xs font-bold text-gray-800">Rs. {subtotal}</Text>
              </View>

              {regularDiscountAmount > 0 ? (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs text-emerald-700 font-bold">
                    Discount ({appliedDiscountPercent}%)
                  </Text>
                  <Text className="text-xs font-bold text-emerald-700">
                    -Rs. {regularDiscountAmount}
                  </Text>
                </View>
              ) : null}

              {customFreebie || activeCustomer?.assignedFreebie ? (
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs text-blue-700 font-bold">Free Food / Gift</Text>
                  <Text className="text-xs font-bold text-blue-700">
                    {customFreebie || activeCustomer?.assignedFreebie}
                  </Text>
                </View>
              ) : null}

              <View className="h-px bg-gray-200 my-2" />

              <View className="flex-row justify-between items-center">
                <Text className="text-base font-extrabold text-gray-900">Grand Total</Text>
                <Text className="text-xl font-extrabold text-blue-900">Rs. {grandTotal}</Text>
              </View>
            </View>

            {/* Print Target Option while Creating Invoice */}
            <View className="bg-white rounded-xl p-3.5 mb-4 border border-blue-200 shadow-sm">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <Ionicons name="print-outline" size={16} color="#2563EB" />
                  <Text className="text-xs font-bold text-gray-800 uppercase tracking-wider ml-1.5">
                    Print Target
                  </Text>
                </View>
                <Text className="text-[10px] text-blue-600 font-semibold">
                  Auto-reflects on Thermal Printer
                </Text>
              </View>

              <View className="flex-row bg-gray-100 p-1 rounded-xl border border-gray-200">
                {[
                  {
                    key: "both",
                    label:
                      businessType === "salon"
                        ? "Both (Bill+Slip)"
                        : businessType === "retail" || businessType === "general"
                        ? "Both (Bill+Slip)"
                        : "Both (Bill+KOT)",
                    icon: "copy-outline",
                  },
                  { key: "customer", label: "Customer", icon: "receipt-outline" },
                  {
                    key: "cooker",
                    label:
                      businessType === "salon"
                        ? "Service Slip"
                        : businessType === "retail" || businessType === "general"
                        ? "Store Slip"
                        : "Cooker KOT",
                    icon:
                      businessType === "salon"
                        ? "cut-outline"
                        : businessType === "retail" || businessType === "general"
                        ? "newspaper-outline"
                        : "restaurant-outline",
                  },
                  { key: "none", label: "No Print", icon: "close-circle-outline" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setPrintTarget(t.key)}
                    className={`flex-1 py-1.5 rounded-lg flex-row items-center justify-center ${printTarget === t.key
                        ? "bg-white shadow-xs border border-blue-300"
                        : "bg-transparent"
                      }`}
                  >
                    <Ionicons
                      name={t.icon}
                      size={12}
                      color={printTarget === t.key ? "#2563EB" : "#6B7280"}
                    />
                    <Text
                      className={`text-[10px] font-bold ml-0.5 ${printTarget === t.key ? "text-blue-700" : "text-gray-600"
                        }`}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Finalize Button */}
            <TouchableOpacity
              onPress={handleGenerateInvoice}
              disabled={loading || cart.length === 0}
              className={`w-full py-4 rounded-xl items-center shadow-md mb-8 ${cart.length > 0 ? "bg-emerald-600" : "bg-gray-300"
                }`}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-done-circle" size={20} color="#FFFFFF" />
                  <Text className="text-white font-bold text-base ml-2">
                    {editingInvoice ? "Update & Save Invoice" : "Generate & Save Invoice"} (Rs. {grandTotal})
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      </View>

      {/* ────────────────── SELECT CUSTOMER MODAL ────────────────── */}
      <Modal
        visible={showPartyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowPartyModal(false);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: isWide ? "center" : "flex-end",
            alignItems: isWide ? "center" : "stretch",
            padding: isWide ? 24 : 0,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: isWide ? 24 : 0,
              borderBottomRightRadius: isWide ? 24 : 0,
              padding: 20,
              maxHeight: "80%",
              width: "100%",
              maxWidth: isWide ? 520 : undefined,
            }}
          >
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-base font-bold text-gray-900">Select Customer</Text>
              <TouchableOpacity onPress={() => setShowPartyModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => handleSelectParty(null)}
              className="bg-gray-100 p-3 rounded-xl mb-3"
            >
              <Text className="text-sm font-bold text-gray-800">
                Walk-in Cash Customer (Manual Entry)
              </Text>
            </TouchableOpacity>

            <FlatList
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              data={parties.filter(
                (p) =>
                  p.name.toLowerCase().includes(partySearch.toLowerCase()) ||
                  p.phone.includes(partySearch)
              )}
              keyExtractor={(p) => p._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectParty(item)}
                  className="flex-row items-center justify-between p-3 border-b border-gray-100"
                >
                  <View>
                    <View className="flex-row items-center">
                      <Text className="text-sm font-bold text-gray-900 mr-2">{item.name}</Text>
                      {item.isRegular ? (
                        <View className="bg-emerald-100 px-1.5 py-0.5 rounded">
                          <Text className="text-[10px] font-bold text-emerald-800">Regular</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-xs text-gray-500">{item.phone}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ────────────────── BILL & THERMAL PRINTER MODAL ────────────────── */}
      <Modal visible={showReceiptModal} animationType="fade" transparent={true}>
        <View className="flex-1 bg-black/60 justify-center items-center px-4">
          <View
            style={{ width: "100%", maxWidth: 480 }}
            className="bg-white rounded-2xl p-6 shadow-2xl max-h-[88%]"
          >
            <View className="items-center pb-4 border-b border-dashed border-gray-300">
              <Text className="text-lg font-black text-gray-900">BILL INVOICE</Text>
              <Text className="text-xs font-bold text-blue-600 mt-1">
                #{createdInvoice?.invoiceNumber}
              </Text>
              {createdInvoice?.isOfflinePending ? (
                <View className="bg-blue-100 border border-blue-300 px-2.5 py-0.5 rounded-full mt-1.5">
                  <Text className="text-[10px] font-extrabold text-blue-800">
                    Saved Offline • Auto-syncs when online
                  </Text>
                </View>
              ) : null}
              <Text className="text-[11px] text-gray-500 mt-0.5">
                Date: {formatISTDate(createdInvoice?.invoiceDate || createdInvoice?.createdAt)}
              </Text>
              <Text className="text-[11px] text-gray-500">
                Customer: {createdInvoice?.partyName}
              </Text>
              {createdInvoice?.partyPhone ? (
                <Text className="text-[11px] text-gray-500">
                  Phone: {createdInvoice.partyPhone}
                </Text>
              ) : null}
            </View>

            <ScrollView className="py-3 max-h-44">
              {createdInvoice?.items?.map((it, idx) => (
                <View key={idx} className="flex-row justify-between py-1 text-xs">
                  <Text className="text-xs text-gray-800 flex-1">
                    {it.name} x {it.quantity}
                  </Text>
                  <Text className="text-xs font-bold text-gray-900">Rs. {it.total}</Text>
                </View>
              ))}
            </ScrollView>

            <View className="pt-2 border-t border-dashed border-gray-300 mb-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-extrabold text-gray-900">
                  Paid ({createdInvoice?.paymentMode})
                </Text>
                <Text className="text-base font-extrabold text-blue-900">
                  Rs. {createdInvoice?.grandTotal}
                </Text>
              </View>
            </View>

            {/* WhatsApp Status Alert */}
            {whatsappSent ? (
              <View className="w-full bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 mb-2.5 flex-row items-center justify-center">
                <Ionicons name="checkmark-circle" size={17} color="#059669" />
                <Text className="text-emerald-800 font-bold text-xs ml-1.5">
                  PDF Bill Delivered to Customer's WhatsApp!
                </Text>
              </View>
            ) : null}

            {!whatsappSent && (createdInvoice?.partyPhone || customerPhone) ? (
              <TouchableOpacity
                onPress={handleResendWhatsApp}
                disabled={sendingWa}
                className="w-full bg-emerald-600 py-2.5 rounded-xl flex-row items-center justify-center mb-2 shadow-xs"
              >
                {sendingWa ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <FontAwesome5 name="whatsapp" size={16} color="#FFFFFF" />
                    <Text className="text-white font-extrabold text-xs ml-2">
                      Send PDF Bill via WhatsApp
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {/* Share PDF Invoice */}
            <TouchableOpacity
              onPress={async () => {
                setSharingPdf(true);
                const result = await shareBackendPdf(
                  createdInvoice,
                  `Invoice_${createdInvoice?.invoiceNumber || "bill"}.pdf`
                );
                setSharingPdf(false);
                if (!result.success) {
                  Alert.alert(
                    "PDF Share Failed",
                    result.error || "Could not download PDF. Try the WhatsApp button below."
                  );
                }
              }}
              disabled={sharingPdf}
              className="w-full bg-emerald-700 py-2.5 rounded-xl flex-row items-center justify-center mb-2 shadow-xs"
            >
              {sharingPdf ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="document-attach" size={16} color="#FFFFFF" />
                  <Text className="text-white font-extrabold text-xs ml-2">
                    📎 Share PDF Invoice (WhatsApp)
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* ─── PRINT FOR SELECTOR (Customer / KOT / Both) ─── */}
            <View className="mb-2">
              <Text className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Print For (Reflects on Printer):
              </Text>
              <View className="flex-row bg-gray-100 p-1 rounded-xl border border-gray-200">
                {[
                  {
                    key: "both",
                    label:
                      businessType === "salon"
                        ? "Both (Cust+Slip)"
                        : businessType === "retail" || businessType === "general"
                        ? "Both (Cust+Slip)"
                        : "Both (Cust+KOT)",
                    icon: "copy-outline",
                  },
                  { key: "customer", label: "Customer", icon: "receipt-outline" },
                  {
                    key: "cooker",
                    label:
                      businessType === "salon"
                        ? "Service Slip"
                        : businessType === "retail" || businessType === "general"
                        ? "Store Slip"
                        : "Cooker KOT",
                    icon:
                      businessType === "salon"
                        ? "cut-outline"
                        : businessType === "retail" || businessType === "general"
                        ? "newspaper-outline"
                        : "restaurant-outline",
                  },
                  { key: "none", label: "No Print", icon: "close-circle-outline" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setPrintTarget(t.key)}
                    className={`flex-1 py-1.5 rounded-lg flex-row items-center justify-center ${printTarget === t.key
                        ? "bg-white shadow-xs border border-gray-200"
                        : "bg-transparent"
                      }`}
                  >
                    <Ionicons
                      name={t.icon}
                      size={12}
                      color={printTarget === t.key ? "#2563EB" : "#6B7280"}
                    />
                    <Text
                      className={`text-[10px] font-bold ml-0.5 ${printTarget === t.key ? "text-blue-700" : "text-gray-600"
                        }`}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ─── BLUETOOTH THERMAL PRINTER ACTION BUTTON ─── */}
            <TouchableOpacity
              onPress={handlePrintReceipt}
              disabled={printingBill}
              className="w-full bg-gray-900 py-3 rounded-xl flex-row items-center justify-center mb-3 shadow-sm active:bg-gray-800"
            >
              {printingBill ? (
                <ActivityIndicator size="small" color="#60A5FA" />
              ) : (
                <>
                  <Ionicons name="print" size={18} color="#60A5FA" />
                  <Text className="text-white font-bold text-xs ml-2">
                    {printTarget === "both"
                      ? businessType === "salon"
                        ? "Print Both (Customer + Service Slip)"
                        : businessType === "retail" || businessType === "general"
                        ? "Print Both (Customer + Store Slip)"
                        : "Print Both (2 Customer + 1 Cooker KOT)"
                      : printTarget === "customer"
                        ? "Print Customer Copies Only"
                        : printTarget === "cooker"
                          ? businessType === "salon"
                            ? "Print Service Slip Only"
                            : businessType === "retail" || businessType === "general"
                            ? "Print Store Slip Only"
                            : "Print Cooker KOT Slip Only"
                          : "Thermal Print (Tap to Print)"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Next Bill / Done */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => {
                  handleResetForNextBill();
                  if (onInvoiceSaved) onInvoiceSaved();
                }}
                className="flex-1 bg-blue-600 py-2.5 rounded-xl items-center"
              >
                <Text className="text-white font-bold text-xs">Start Next Bill ➔</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowReceiptModal(false);
                  if (onInvoiceSaved) onInvoiceSaved();
                  onBack();
                }}
                className="flex-1 bg-gray-100 py-2.5 rounded-xl items-center"
              >
                <Text className="text-gray-800 font-bold text-xs">Done & Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ────────────────── PARCEL SETUP MODAL (All Parcel or Mixed Parcel + Eat Here) ────────────────── */}
      <Modal visible={showParcelModal} transparent animationType="slide" onRequestClose={() => setShowParcelModal(false)}>
        <View className="flex-1 bg-black/50 justify-end sm:justify-center items-center">
          <View style={{ width: "100%", maxWidth: 460 }} className="bg-white rounded-t-3xl sm:rounded-2xl p-5 max-h-[85%]">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-full bg-blue-100 items-center justify-center mr-2.5">
                  <Ionicons name="bag-handle-outline" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text className="text-base font-extrabold text-gray-900">
                    {businessType === "salon"
                      ? "In-Salon & Retail Takeaway Split"
                      : businessType === "retail" || businessType === "general"
                      ? "In-Store & Carry/Delivery Split"
                      : "Parcel & Dine-In Split"}
                  </Text>
                  <Text className="text-[11px] text-gray-500">
                    {businessType === "salon"
                      ? "Mark all items Retail Takeaway, or split per item (some Retail, some In-Salon)"
                      : businessType === "retail" || businessType === "general"
                      ? "Mark all items Carry/Delivery, or split per item (some Carry, some In-Store)"
                      : "Mark all items Parcel, or split per item (some Parcel, some Eat Here)"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowParcelModal(false)} className="p-1">
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-2 mb-4">
              <TouchableOpacity
                onPress={() => toggleParcelAll(true)}
                className={`flex-1 py-2.5 px-3 rounded-xl border items-center ${
                  defaultAllParcel || (cart.length > 0 && cartTotalParcelItems === cartTotalItems)
                    ? "bg-blue-600 border-blue-600"
                    : "bg-blue-50 border-blue-300"
                }`}
              >
                <Text
                  className={`text-xs font-extrabold ${
                    defaultAllParcel || (cart.length > 0 && cartTotalParcelItems === cartTotalItems)
                      ? "text-white"
                      : "text-blue-800"
                  }`}
                >
                  {businessType === "salon"
                    ? "All Retail Takeaway"
                    : businessType === "retail" || businessType === "general"
                    ? "All Carry / Delivery"
                    : "Parcel All Items"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => toggleParcelAll(false)}
                className={`flex-1 py-2.5 px-3 rounded-xl border items-center ${
                  !defaultAllParcel && cartTotalParcelItems === 0
                    ? "bg-emerald-600 border-emerald-600"
                    : "bg-gray-100 border-gray-300"
                }`}
              >
                <Text
                  className={`text-xs font-extrabold ${
                    !defaultAllParcel && cartTotalParcelItems === 0 ? "text-white" : "text-gray-700"
                  }`}
                >
                  {businessType === "salon"
                    ? "All In-Salon Services"
                    : businessType === "retail" || businessType === "general"
                    ? "All In-Store"
                    : "Eat Here All (Dine-In)"}
                </Text>
              </TouchableOpacity>
            </View>

            {cart.length === 0 ? (
              <View className="py-6 items-center">
                <Text className="text-xs text-gray-500 text-center">
                  Tap items on the menu first, or choose "Parcel All Items" above so every item you tap is marked Parcel.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                {cart.map((c) => {
                  const pQty = c.parcelQuantity || 0;
                  const dineQty = Math.max(0, c.quantity - pQty);
                  return (
                    <View
                      key={c._id}
                      className="flex-row items-center justify-between py-2.5 px-3 mb-2 bg-slate-50 rounded-xl border border-slate-200"
                    >
                      <View className="flex-1 pr-2">
                        <Text className="text-xs font-extrabold text-gray-900" numberOfLines={1}>
                          {c.name} (x{c.quantity})
                        </Text>
                        <Text className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                          {pQty} Parcel · {dineQty} Eat Here
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <TouchableOpacity
                          onPress={() => setItemParcelQty(c._id, pQty - 1)}
                          className="w-7 h-7 rounded-lg bg-white border border-gray-300 items-center justify-center"
                        >
                          <Ionicons name="remove" size={15} color="#374151" />
                        </TouchableOpacity>
                        <Text className="text-xs font-extrabold text-gray-900 w-8 text-center">
                          {pQty}P
                        </Text>
                        <TouchableOpacity
                          onPress={() => setItemParcelQty(c._id, pQty + 1)}
                          className="w-7 h-7 rounded-lg bg-emerald-600 items-center justify-center"
                        >
                          <Ionicons name="add" size={15} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              onPress={() => setShowParcelModal(false)}
              style={{ backgroundColor: "#2563EB" }}
              className="w-full py-3 rounded-xl items-center mt-3"
            >
              <Text className="text-white font-bold text-sm">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ────────────────── HOLD / RESUME BILLS MODAL ────────────────── */}
      <Modal visible={showHoldModal} transparent animationType="fade" onRequestClose={() => setShowHoldModal(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center px-5">
          <View style={{ width: "100%", maxWidth: 440 }} className="bg-white rounded-2xl p-5 max-h-[82%]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-extrabold text-gray-900">Hold & Resume Bills</Text>
              <TouchableOpacity onPress={() => setShowHoldModal(false)} className="p-1">
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {cart.length > 0 ? (
              <View className="bg-slate-100 border border-slate-300 rounded-xl p-3 mb-4">
                <Text className="text-xs font-extrabold text-slate-900 mb-2">
                  Park Current Cart ({cartTotalItems} items · Rs. {grandTotal})
                </Text>
                <TextInput
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-gray-900 mb-2"
                  placeholder="Optional Table / Customer note (e.g. Table 4)"
                  value={holdNote}
                  onChangeText={setHoldNote}
                />
                <TouchableOpacity
                  onPress={() => handleHoldCurrentBill(holdNote)}
                  className="bg-slate-800 py-2.5 rounded-lg items-center"
                >
                  <Text className="text-white font-bold text-xs">Put Current Bill on Hold</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text className="text-xs font-bold text-gray-500 uppercase mb-2">
              Held Bills ({heldBills.length})
            </Text>
            {heldBills.length === 0 ? (
              <Text className="text-xs text-gray-400 text-center py-6">
                No bills on hold right now.
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
                {heldBills.map((h) => {
                  const total = (h.cart || []).reduce(
                    (s, it) => s + Number(it.sellingPrice || 0) * Number(it.quantity || 1),
                    0
                  );
                  return (
                    <View
                      key={h.id}
                      className="flex-row items-center justify-between p-3 mb-2 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <View className="flex-1 pr-2">
                        <Text className="text-xs font-extrabold text-gray-900">{h.label}</Text>
                        <Text className="text-[11px] text-gray-500 mt-0.5">
                          {(h.cart || []).reduce((s, c) => s + (c.quantity || 1), 0)} items · Rs. {total}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleResumeHeldBill(h)}
                        className="bg-blue-600 px-3 py-1.5 rounded-lg mr-2"
                      >
                        <Text className="text-white text-xs font-bold">Resume</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteHeldBill(h.id)} className="p-1.5">
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ────────────────── QUICK + ITEM MODAL ────────────────── */}
      <Modal visible={showQuickItemModal} transparent animationType="fade" onRequestClose={() => setShowQuickItemModal(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center px-5">
          <View style={{ width: "100%", maxWidth: 400 }} className="bg-white rounded-2xl p-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-extrabold text-gray-900">Quick Add Food Item</Text>
              <TouchableOpacity onPress={() => setShowQuickItemModal(false)} className="p-1">
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text className="text-xs font-bold text-gray-700 mb-1">Item Name</Text>
            <TextInput
              className="bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 mb-3"
              placeholder="e.g. Classic CornDog"
              value={quickItemName}
              onChangeText={setQuickItemName}
            />
            <Text className="text-xs font-bold text-gray-700 mb-1">Selling Price (Rs.)</Text>
            <TextInput
              className="bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 mb-3"
              placeholder="e.g. 159"
              keyboardType="numeric"
              value={quickItemPrice}
              onChangeText={setQuickItemPrice}
            />
            <Text className="text-xs font-bold text-gray-700 mb-1">Category</Text>
            <TextInput
              className="bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 mb-4"
              placeholder="e.g. Korean"
              value={quickItemCategory}
              onChangeText={setQuickItemCategory}
            />
            <TouchableOpacity
              onPress={handleSaveQuickItem}
              disabled={savingQuickItem}
              style={{ backgroundColor: "#2563EB" }}
              className="w-full py-3 rounded-xl items-center"
            >
              {savingQuickItem ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white font-bold text-sm">Add Item & Select</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
