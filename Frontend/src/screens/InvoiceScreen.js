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
import { useResponsive } from "../utils/responsive";

export default function InvoiceScreen({ user, onBack, onInvoiceSaved, editingInvoice }) {
  const { isWide, isDesktop, posColumns, headerTopPadding } = useResponsive();
  // Step 1: "items" (first select items) | Step 2: "invoice" (customer & payment)
  const [currentStep, setCurrentStep] = useState("items");

  const [parties, setParties] = useState(() => getMemoryCachedData("parties_customers") || getMemoryCachedData("parties_all") || []);
  const [items, setItems] = useState(() => getMemoryCachedData("items_all") || []);
  const [selectedParty, setSelectedParty] = useState(null);
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState("CASH");
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
  const [printTarget, setPrintTarget] = useState("both"); // "both" | "customer" | "kot"
  const [customDiscount, setCustomDiscount] = useState("");
  const [customFreebie, setCustomFreebie] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sharingPdf, setSharingPdf] = useState(false);
  const [kotSent, setKotSent] = useState(false);
  const [printingBill, setPrintingBill] = useState(false);

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
        if (parsed.printTarget) {
          setPrintTarget(parsed.printTarget);
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
      const sorted = [...iRes.items].sort((a, b) =>
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
          c._id === item._id ? { ...c, quantity: c.quantity + 1 } : c
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
        },
      ]);
    }
  };

  const removeItemFromCart = (itemId) => {
    const existing = cart.find((c) => c._id === itemId);
    if (existing && existing.quantity > 1) {
      setCart(
        cart.map((c) =>
          c._id === itemId ? { ...c, quantity: c.quantity - 1 } : c
        )
      );
    } else {
      setCart(cart.filter((c) => c._id !== itemId));
    }
  };

  const getCartItemQty = (itemId) => {
    const found = cart.find((c) => c._id === itemId);
    return found ? found.quantity : 0;
  };

  const cartTotalItems = cart.reduce((sum, c) => sum + c.quantity, 0);

  const updateQuantity = (itemId, change) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c._id === itemId) {
            const nextQty = c.quantity + change;
            return nextQty > 0 ? { ...c, quantity: nextQty } : null;
          }
          return c;
        })
        .filter(Boolean)
    );
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

  const handleGenerateInvoice = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty Bill", "Please select at least one item to bill");
      setCurrentStep("items");
      return;
    }

    if (paymentMode === "UPI/CASH") {
      const cash = Number(cashAmount) || 0;
      const upi = Number(upiAmount) || 0;
      if (cash + upi !== grandTotal) {
        Alert.alert(
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
      paymentMode,
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
        unit: c.unit,
        taxRate: c.taxRate,
      })),
    };

    const res = editingInvoice?._id
      ? await api.invoices.update(editingInvoice._id, payload)
      : await api.invoices.create(payload);
    setLoading(false);

    if (res && res.success && res.invoice) {
      setCreatedInvoice(res.invoice);
      setWhatsappUrl(res.whatsappUrl || "");
      setWhatsappSent(Boolean(res.whatsappSent || res.whatsappQueued));
      setShowReceiptModal(true);
      setKotSent(false);

      if (editingInvoice) {
        if (Platform.OS === "web") {
          window.alert(res.message || "Invoice updated successfully!");
        }
      }

      // Automatic printing only if printTarget is not 'none'
      if (printTarget !== "none") {
        try {
          const storeData = {
            businessName: user?.businessName || "My Store",
            phone: user?.phone || "",
            address: user?.address || "",
            email: user?.email || "",
            gstin: user?.gstin || "",
          };
          await printBill(res.invoice, storeData, billFormatOptions, printTarget);
          setKotSent(true);
        } catch (printErr) {
          console.warn("Thermal print notice (printer offline or skipped):", printErr.message);
        }
      }
    } else {
      const errorMsg = res?.message || "Could not save invoice";
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
        phone: user?.phone || "",
        address: user?.address || "",
        email: user?.email || "",
        gstin: user?.gstin || "",
        logo: user?.logo || "",
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
    setCashAmount("");
    setUpiAmount("");
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

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      {/* ────────────────── HEADER ────────────────── */}
      <View
        style={{ paddingTop: headerTopPadding }}
        className="bg-blue-600 px-4 pb-4 flex-row items-center justify-between"
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => {
              if (!isWide && currentStep === "invoice") {
                setCurrentStep("items");
              } else {
                onBack();
              }
            }}
            className="mr-3"
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text className="text-white text-lg font-bold">
              {editingInvoice
                ? `Edit Bill #${editingInvoice.invoiceNumber}`
                : isWide
                  ? "POS Billing Workspace"
                  : currentStep === "items"
                    ? "1. Select Items"
                    : "2. Finalize Invoice"}
            </Text>
            <Text className="text-blue-100 text-[11px]">
              {isWide || currentStep === "items"
                ? `${cartTotalItems} item(s) in cart · Subtotal Rs. ${subtotal}`
                : "Customer Details & Payment"}
            </Text>
          </View>
        </View>

        {isWide ? (
          <View className="flex-row items-center bg-white/20 px-3 py-1 rounded-full">
            <Ionicons name="desktop-outline" size={14} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold ml-1.5">
              Grand Total: Rs. {grandTotal}
            </Text>
          </View>
        ) : currentStep === "invoice" ? (
          <TouchableOpacity
            onPress={() => setCurrentStep("items")}
            className="bg-white/20 px-3 py-1.5 rounded-lg flex-row items-center"
          >
            <Ionicons name="cart" size={16} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold ml-1.5">Edit Items</Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center bg-white/20 px-2.5 py-1 rounded-full">
            <Ionicons name="receipt-outline" size={15} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold ml-1">Step 1 of 2</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, flexDirection: isWide ? "row" : "column" }}>
      {/* ────────────────── STEP 1 / LEFT PANE: ITEM SELECTION CATALOG ────────────────── */}
      {showItemsPane && (
        <View style={{ flex: isWide ? 1.35 : 1 }}>
          {/* Search Bar */}
          <View className="bg-white px-4 pt-3 pb-2 border-b border-gray-200">
            <View className="flex-row bg-gray-100 rounded-xl px-3 py-2 items-center">
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput
                className="flex-1 ml-2 text-sm text-gray-800"
                placeholder="Search items by name or scan barcode..."
                value={itemSearch}
                onChangeText={setItemSearch}
              />
              {itemSearch ? (
                <TouchableOpacity onPress={() => setItemSearch("")}>
                  <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Category Filter Chips */}
            {categories.length > 2 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2.5 py-1">
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-full mr-2 border ${selectedCategory === cat
                        ? "bg-blue-600 border-blue-600"
                        : "bg-gray-100 border-gray-200"
                      }`}
                  >
                    <Text
                      className={`text-xs font-bold ${selectedCategory === cat ? "text-white" : "text-gray-700"
                        }`}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </View>

          {/* Items Catalog List */}
          <FlatList
            key={`pos-cols-${posColumns}`}
            numColumns={posColumns}
            columnWrapperStyle={posColumns > 1 ? { gap: 10, paddingHorizontal: 4 } : undefined}
            data={filteredItems}
            keyExtractor={(i) => i._id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: 12, paddingBottom: isWide ? 24 : 110 }}
            ListEmptyComponent={
              <View className="items-center justify-center py-16">
                <FontAwesome5 name="box-open" size={40} color="#D1D5DB" />
                <Text className="text-gray-500 font-bold text-sm mt-3">
                  No items match "{itemSearch}"
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  Add items in the Items screen or clear filters
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const qtyInCart = getCartItemQty(item._id);
              return (
                <View
                  style={posColumns > 1 ? { flex: 1, maxWidth: `${100 / posColumns - 1}%` } : undefined}
                  className={`flex-row items-center justify-between p-3.5 mb-2.5 rounded-xl border bg-white ${qtyInCart > 0
                      ? "border-blue-400 bg-blue-50/40 shadow-sm"
                      : "border-gray-200 shadow-xs"
                    }`}
                >
                  <View className="flex-row items-center flex-1 pr-2">
                    {item.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={{ width: 44, height: 44, borderRadius: 10, marginRight: 12 }}
                      />
                    ) : (
                      <View className="w-11 h-11 rounded-10 bg-gray-100 items-center justify-center mr-3 border border-gray-200">
                        <Ionicons name="cube-outline" size={22} color="#6B7280" />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View className="flex-row items-center mt-0.5">
                        <Text className="text-xs font-extrabold text-blue-700 mr-2">
                          Rs. {item.sellingPrice}
                          <Text className="text-gray-500 font-normal"> / {item.unit || "PCS"}</Text>
                        </Text>
                        {item.stock !== undefined ? (
                          <Text
                            className={`text-[10px] font-semibold ${item.stock > 5 ? "text-emerald-700" : "text-amber-700"
                              }`}
                          >
                            Stock: {item.stock}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Quantity Controls */}
                  {qtyInCart > 0 ? (
                    <View className="flex-row items-center bg-blue-100/80 rounded-xl p-1">
                      <TouchableOpacity
                        onPress={() => removeItemFromCart(item._id)}
                        className="w-8 h-8 rounded-lg bg-white items-center justify-center shadow-xs"
                      >
                        <Ionicons name="remove" size={18} color="#DC2626" />
                      </TouchableOpacity>
                      <Text className="text-sm font-extrabold text-blue-900 w-8 text-center">
                        {qtyInCart}
                      </Text>
                      <TouchableOpacity
                        onPress={() => addItemToCart(item)}
                        className="w-8 h-8 rounded-lg bg-blue-600 items-center justify-center shadow-xs"
                      >
                        <Ionicons name="add" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => addItemToCart(item)}
                      className="bg-blue-600 px-3.5 py-2 rounded-xl flex-row items-center shadow-xs"
                    >
                      <Ionicons name="add" size={16} color="#FFFFFF" />
                      <Text className="text-white font-bold text-xs ml-1">ADD</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />

          {/* Sticky Bottom Bar (Phone Only): Cart Summary & "Proceed to Invoice" */}
          {!isWide && (
          <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-gray-500 font-medium">Selected Items</Text>
              <Text className="text-base font-black text-gray-900">
                {cartTotalItems} item{cartTotalItems > 1 ? "s" : ""} ·{" "}
                <Text className="text-blue-600">Rs. {subtotal}</Text>
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (cart.length === 0) {
                  Alert.alert("Select Items First", "Please add at least 1 item to proceed to invoice");
                  return;
                }
                setCurrentStep("invoice");
              }}
              disabled={cart.length === 0}
              className={`px-5 py-3 rounded-xl flex-row items-center shadow ${cart.length > 0 ? "bg-emerald-600" : "bg-gray-300"
                }`}
            >
              <Text className="text-white font-bold text-sm mr-2">
                Proceed to Invoice
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          )}
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
                <View className="bg-amber-50 border border-amber-300 rounded-xl p-3 my-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Ionicons name="person-circle" size={24} color="#D97706" />
                      <View className="ml-2">
                        <Text className="text-sm font-extrabold text-amber-950">
                          {activeCustomer.name}
                        </Text>
                        <Text className="text-[11px] font-bold text-amber-800">
                          Total Visits: <Text className="font-extrabold text-amber-900 text-xs">{activeCustomer.visitCount || 1}</Text> • Total Spent: Rs. {activeCustomer.totalSpent || 0}
                        </Text>
                      </View>
                    </View>
                    {(activeCustomer.isRegular || (activeCustomer.visitCount || 0) >= (user?.vipVisitThreshold || 3)) ? (
                      <View className="bg-amber-200 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] font-extrabold text-amber-900">VIP / Regular</Text>
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
                <TouchableOpacity onPress={() => setCurrentStep("items")}>
                  <Text className="text-xs font-bold text-blue-600">+ Add / Change Items</Text>
                </TouchableOpacity>
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
                    <Text className="text-xs text-gray-500 mt-0.5">
                      Rs. {c.sellingPrice} / {c.unit}
                    </Text>
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
                {["CASH", "UPI", "UPI/CASH", "BANK", "CHEQUE", "CREDIT"].map((mode) => (
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
                  { key: "both", label: "Both (Bill+KOT)", icon: "copy-outline" },
                  { key: "customer", label: "Customer", icon: "receipt-outline" },
                  { key: "cooker", label: "Cooker KOT", icon: "restaurant-outline" },
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
                        <View className="bg-amber-100 px-1.5 py-0.5 rounded">
                          <Text className="text-[10px] font-bold text-amber-800">Regular</Text>
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
                  { key: "both", label: "Both (Cust+KOT)", icon: "copy-outline" },
                  { key: "customer", label: "Customer", icon: "receipt-outline" },
                  { key: "cooker", label: "Cooker KOT", icon: "restaurant-outline" },
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
                      ? "Print Both (2 Customer + 1 Cooker KOT)"
                      : printTarget === "customer"
                        ? "Print Customer Copies Only"
                        : printTarget === "cooker"
                          ? "Print Cooker KOT Slip Only"
                          : "Thermal Print (Tap to Print Both)"}
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
    </View>
  );
}
