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
} from "react-native";
import { Ionicons, FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import { api } from "../config/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { shareBillAsPdf, printBill } from "../utils/receiptPdfGenerator";


export default function InvoiceScreen({ user, onBack, onInvoiceSaved }) {
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
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
  const [showItemModal, setShowItemModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [billFormatOptions, setBillFormatOptions] = useState({});
  const [sharingPdf, setSharingPdf] = useState(false);


  useEffect(() => {
    loadPartiesAndItems();
    loadBillFormat();
  }, []);

  const loadBillFormat = async () => {
    try {
      const stored = await AsyncStorage.getItem("billFormatOptions");
      if (stored) setBillFormatOptions(JSON.parse(stored));
    } catch {}
  };

  const loadPartiesAndItems = async () => {
    const [pRes, iRes] = await Promise.all([
      api.parties.getAll("type=customer"),
      api.items.getAll(),
    ]);
    if (pRes.success) setParties(pRes.parties || []);
    if (iRes.success) setItems(iRes.items || []);
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
    setShowItemModal(false);
  };

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

  const regularDiscountRate =
    selectedParty && selectedParty.isRegular
      ? selectedParty.customDiscountPercent || 0
      : 0;

  const regularDiscountAmount = Math.round(
    (subtotal * regularDiscountRate) / 100
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
      setCustomerName("Walk-in Customer");
      setCustomerPhone("");
    } else {
      setSelectedParty(party);
      setCustomerName(party.name);
      setCustomerPhone(party.whatsappNumber || party.phone || "");
    }
    setShowPartyModal(false);
  };

  const handleGenerateInvoice = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty Bill", "Please add at least one item to bill");
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
      partyId: selectedParty ? selectedParty._id : undefined,
      partyName: customerName.trim() || "Walk-in Customer",
      partyPhone: cleanPhone || undefined,
      paymentMode,
      cashAmount: paymentMode === "UPI/CASH" ? Number(cashAmount) || 0 : undefined,
      upiAmount: paymentMode === "UPI/CASH" ? Number(upiAmount) || 0 : undefined,
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

    const res = await api.invoices.create(payload);
    setLoading(false);

    if (res.success && res.invoice) {
      setCreatedInvoice(res.invoice);
      setWhatsappUrl(res.whatsappUrl || "");
      setShowReceiptModal(true);
      if (onInvoiceSaved) onInvoiceSaved();
    } else {
      Alert.alert("Billing Failed", res.message || "Could not generate invoice");
    }
  };

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View className="bg-blue-600 px-4 pt-10 pb-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={onBack} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-bold">New Sale Invoice</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowItemModal(true)}
          className="bg-white/20 px-3 py-1.5 rounded-lg flex-row items-center"
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text className="text-white text-xs font-bold ml-1">Add Item</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
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
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Customer Name
            </Text>
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
              placeholder="10-digit mobile number to send invoice"
              keyboardType="phone-pad"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              maxLength={15}
            />
          </View>

          {customerPhone.trim().length >= 10 ? (
            <View className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex-row items-center mt-1">
              <MaterialIcons name="send" size={16} color="#059669" />
              <Text className="text-emerald-800 text-xs font-bold ml-1.5 flex-1">
                Bill will be sent to WhatsApp: {customerPhone.trim()}
              </Text>
            </View>
          ) : null}

          {selectedParty?.isRegular &&
          (selectedParty.customDiscountPercent > 0 ||
            selectedParty.assignedFreebie) ? (
            <View className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-2">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-blue-900 text-xs font-extrabold">
                  Regular Customer Perks Active
                </Text>
                <View className="bg-amber-100 px-1.5 py-0.5 rounded">
                  <Text className="text-amber-800 text-[10px] font-bold">
                    Regular
                  </Text>
                </View>
              </View>
              {selectedParty.customDiscountPercent > 0 ? (
                <Text className="text-blue-900 text-xs font-bold">
                  Discount: {selectedParty.customDiscountPercent}% auto-applied
                </Text>
              ) : null}
              {selectedParty.assignedFreebie ? (
                <Text className="text-blue-800 text-xs mt-0.5">
                  Free Gift: {selectedParty.assignedFreebie}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Billed Items ({cart.length})
          </Text>

          {cart.length === 0 ? (
            <TouchableOpacity
              onPress={() => setShowItemModal(true)}
              className="border border-dashed border-gray-300 rounded-xl py-8 items-center justify-center bg-gray-50"
            >
              <FontAwesome5 name="cart-plus" size={28} color="#9CA3AF" />
              <Text className="text-gray-500 text-xs font-bold mt-2">
                Tap to Add Products & Items
              </Text>
            </TouchableOpacity>
          ) : (
            cart.map((c, index) => (
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
            ))
          )}
        </View>

        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Payment Mode
          </Text>
          <View className="flex-row gap-2 flex-wrap">
            {["CASH", "UPI", "UPI/CASH", "BANK", "CHEQUE", "CREDIT"].map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => handlePaymentModeChange(mode)}
                className={`px-3 py-2 rounded-xl border ${
                  paymentMode === mode
                    ? "bg-blue-600 border-blue-600"
                    : "bg-gray-100 border-gray-200"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    paymentMode === mode ? "text-white" : "text-gray-700"
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

        <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200 shadow-sm">
          <View className="flex-row justify-between mb-2">
            <Text className="text-xs text-gray-600">Subtotal</Text>
            <Text className="text-xs font-bold text-gray-800">
              Rs. {subtotal}
            </Text>
          </View>

          {regularDiscountAmount > 0 ? (
            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-emerald-700 font-bold">
                Regular Discount ({regularDiscountRate}%)
              </Text>
              <Text className="text-xs font-bold text-emerald-700">
                -Rs. {regularDiscountAmount}
              </Text>
            </View>
          ) : null}

          {selectedParty?.assignedFreebie ? (
            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-blue-700 font-bold">
                Free Gift Item
              </Text>
              <Text className="text-xs font-bold text-blue-700">
                {selectedParty.assignedFreebie}
              </Text>
            </View>
          ) : null}

          <View className="h-px bg-gray-200 my-2" />

          <View className="flex-row justify-between items-center">
            <Text className="text-base font-extrabold text-gray-900">
              Grand Total
            </Text>
            <Text className="text-xl font-extrabold text-blue-900">
              Rs. {grandTotal}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleGenerateInvoice}
          disabled={loading || cart.length === 0}
          className={`w-full py-4 rounded-xl items-center shadow-md mb-8 ${
            cart.length > 0 ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">
              Generate & Save Invoice
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Select Customer Modal */}
      <Modal visible={showPartyModal} animationType="slide" transparent={true}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-5 max-h-[80%]">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-base font-bold text-gray-900">
                Select Customer
              </Text>
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
                      <Text className="text-sm font-bold text-gray-900 mr-2">
                        {item.name}
                      </Text>
                      {item.isRegular ? (
                        <View className="bg-amber-100 px-1.5 py-0.5 rounded">
                          <Text className="text-[10px] font-bold text-amber-800">
                            Regular
                          </Text>
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

      {/* Select Item Modal */}
      <Modal visible={showItemModal} animationType="slide" transparent={true}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-5 max-h-[85%]">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-base font-bold text-gray-900">
                Add Items to Invoice
              </Text>
              <TouchableOpacity onPress={() => setShowItemModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View className="flex-row bg-gray-100 rounded-xl px-3 py-2 items-center mb-3">
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput
                className="flex-1 ml-2 text-sm text-gray-800"
                placeholder="Search items..."
                value={itemSearch}
                onChangeText={setItemSearch}
              />
            </View>

            <FlatList
              data={items.filter((i) =>
                i.name.toLowerCase().includes(itemSearch.toLowerCase())
              )}
              keyExtractor={(i) => i._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => addItemToCart(item)}
                  className="flex-row items-center justify-between p-3 border-b border-gray-100 active:bg-blue-50"
                >
                  <View className="flex-row items-center flex-1 pr-2">
                    {item.imageUrl ? (
                      <Image
                        source={{ uri: item.imageUrl }}
                        style={{ width: 36, height: 36, borderRadius: 8, marginRight: 10 }}
                      />
                    ) : null}
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-gray-900">
                        {item.name}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        Stock: {item.stock} {item.unit} | Rs. {item.sellingPrice}
                      </Text>
                    </View>
                  </View>
                  <View className="w-8 h-8 rounded-lg bg-blue-600 items-center justify-center">
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Bill & Thermal Slip Preview Modal */}
      <Modal visible={showReceiptModal} animationType="fade" transparent={true}>
        <View className="flex-1 bg-black/60 justify-center px-4">
          <View className="bg-white rounded-2xl p-6 shadow-2xl max-h-[85%]">
            <View className="items-center pb-4 border-b border-dashed border-gray-300">
              <Text className="text-lg font-black text-gray-900">
                BILL INVOICE
              </Text>
              <Text className="text-xs font-bold text-blue-600 mt-1">
                {createdInvoice?.invoiceNumber}
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

            <ScrollView className="py-3 max-h-48">
              {createdInvoice?.items?.map((it, idx) => (
                <View
                  key={idx}
                  className="flex-row justify-between py-1 text-xs"
                >
                  <Text className="text-xs text-gray-800 flex-1">
                    {it.name} x {it.quantity}
                  </Text>
                  <Text className="text-xs font-bold text-gray-900">
                    Rs. {it.total}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View className="pt-3 border-t border-dashed border-gray-300 mb-4">
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-gray-600">Subtotal</Text>
                <Text className="text-xs font-bold text-gray-900">
                  Rs. {createdInvoice?.subtotal}
                </Text>
              </View>

              {createdInvoice?.regularDiscountAmount > 0 ? (
                <View className="flex-row justify-between mb-1">
                  <Text className="text-xs text-emerald-700 font-bold">
                    Regular Discount
                  </Text>
                  <Text className="text-xs font-bold text-emerald-700">
                    -Rs. {createdInvoice?.regularDiscountAmount}
                  </Text>
                </View>
              ) : null}

              {createdInvoice?.freebieItemGiven ? (
                <View className="flex-row justify-between mb-1">
                  <Text className="text-xs text-blue-700 font-bold">
                    Freebie Item
                  </Text>
                  <Text className="text-xs font-bold text-blue-700">
                    {createdInvoice?.freebieItemGiven}
                  </Text>
                </View>
              ) : null}

              <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-gray-200">
                <Text className="text-sm font-extrabold text-gray-900">
                  Paid ({createdInvoice?.paymentMode})
                </Text>
                <Text className="text-base font-extrabold text-blue-900">
                  Rs. {createdInvoice?.grandTotal}
                </Text>
              </View>

              {createdInvoice?.paymentMode === "UPI/CASH" ? (
                <View className="flex-row justify-between mt-1">
                  <Text className="text-[11px] text-gray-500">
                    Cash: Rs. {createdInvoice.cashAmount}
                  </Text>
                  <Text className="text-[11px] text-gray-500">
                    UPI: Rs. {createdInvoice.upiAmount}
                  </Text>
                </View>
              ) : null}
            </View>

            {whatsappUrl ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(whatsappUrl)}
                className="w-full bg-emerald-600 py-3 rounded-xl flex-row items-center justify-center mb-3 shadow"
              >
                <FontAwesome5 name="whatsapp" size={18} color="#FFFFFF" />
                <Text className="text-white font-bold text-xs ml-2">
                  Send Bill on WhatsApp
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Share as PDF */}
            <TouchableOpacity
              onPress={async () => {
                setSharingPdf(true);
                const storeInfo = {
                  businessName: user?.businessName || "",
                  address: user?.address || "",
                  phone: user?.phone || "",
                  email: user?.email || "",
                  logo: user?.logo || "",
                  gstin: user?.gstin || "",
                };
                const result = await shareBillAsPdf(createdInvoice, storeInfo, billFormatOptions);
                setSharingPdf(false);
                if (!result.success) {
                  Alert.alert("Error", result.error || "Could not generate PDF");
                }
              }}
              disabled={sharingPdf}
              className="w-full bg-blue-600 py-3 rounded-xl flex-row items-center justify-center mb-3 shadow"
            >
              {sharingPdf ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                  <Text className="text-white font-bold text-xs ml-2">
                    Share Bill as PDF
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Print All (2 Customer + 1 Cooker) */}
            <TouchableOpacity
              onPress={async () => {
                const storeInfo = {
                  businessName: user?.businessName || "",
                  address: user?.address || "",
                  phone: user?.phone || "",
                  email: user?.email || "",
                  logo: user?.logo || "",
                  gstin: user?.gstin || "",
                };
                await printBill(createdInvoice, storeInfo, billFormatOptions, "all");
              }}
              className="w-full bg-gray-900 py-3 rounded-xl flex-row items-center justify-center mb-2 shadow-sm"
            >
              <Ionicons name="print" size={18} color="#FFFFFF" />
              <Text className="text-white font-bold text-xs ml-2">
                Print All (2 Customer + 1 Cooker)
              </Text>
            </TouchableOpacity>

            {/* Individual Print Options */}
            <View className="flex-row justify-between mb-3">
              <TouchableOpacity
                onPress={async () => {
                  const storeInfo = {
                    businessName: user?.businessName || "",
                    address: user?.address || "",
                    phone: user?.phone || "",
                    email: user?.email || "",
                    logo: user?.logo || "",
                    gstin: user?.gstin || "",
                  };
                  await printBill(createdInvoice, storeInfo, billFormatOptions, "customer");
                }}
                className="flex-1 bg-gray-100 border border-gray-300 py-2.5 rounded-xl flex-row items-center justify-center mr-1.5"
              >
                <Ionicons name="receipt-outline" size={15} color="#374151" />
                <Text className="text-gray-800 font-bold text-xs ml-1.5">
                  Customer Bills (2)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  const storeInfo = {
                    businessName: user?.businessName || "",
                  };
                  await printBill(createdInvoice, storeInfo, billFormatOptions, "cooker");
                }}
                className="flex-1 bg-amber-50 border border-amber-300 py-2.5 rounded-xl flex-row items-center justify-center ml-1.5"
              >
                <Ionicons name="restaurant-outline" size={15} color="#B45309" />
                <Text className="text-amber-800 font-bold text-xs ml-1.5">
                  Cooker Slip (KOT)
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                setShowReceiptModal(false);
                onBack();
              }}
              className="w-full bg-gray-100 py-3 rounded-xl items-center"
            >
              <Text className="text-gray-800 font-bold text-xs">
                Done & Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
