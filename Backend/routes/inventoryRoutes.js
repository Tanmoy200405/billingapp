import express from "express";
import mongoose from "mongoose";
import Item from "../models/Item.js";
import StockTransfer from "../models/StockTransfer.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Party from "../models/Party.js";
import { protect } from "../middleware/authMiddleware.js";
import { invalidateUserCache } from "../services/cacheService.js";

const router = express.Router();
router.use(protect);


router.get("/transfers", async (req, res) => {
  try {
    const { type, status } = req.query;
    const filter = { userId: req.user._id };
    if (type) filter.type = type;
    if (status) filter.status = status;

    const transfers = await StockTransfer.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({ success: true, transfers });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/inventory/transfers (Raise Indent, Supply Dispatch, or Return Damaged Stock)
router.post("/transfers", async (req, res) => {
  try {
    const {
      type = "INDENT_REQUEST",
      sourceType = "OUTLET",
      sourceName = "Main Outlet",
      destinationType = "CENTRAL_KITCHEN",
      destinationName = "Central Kitchen Hub",
      outletZone = "Main Kitchen",
      items = [],
      notes = "",
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: "At least one item is required" });
    }

    const dateStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .split("/")
      .reverse()
      .join("");

    const count = await StockTransfer.countDocuments({
      userId: req.user._id,
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    });

    const prefix = type === "DAMAGED_RETURN" ? "RET" : type === "SUPPLY_DISPATCH" ? "DSP" : "IND";
    const transferNumber = `${prefix}-${dateStr}-${String(count + 1).padStart(3, "0")}`;

    const newTransfer = await StockTransfer.create({
      userId: req.user._id,
      transferNumber,
      type,
      sourceType,
      sourceName,
      destinationType,
      destinationName,
      outletZone,
      items,
      status: "PENDING",
      notes,
    });

    // If it's a damaged return marked from outlet, deduct damaged stock immediately
    if (type === "DAMAGED_RETURN") {
      const stockUpdates = items
        .filter((it) => it.itemId && mongoose.Types.ObjectId.isValid(it.itemId))
        .map((it) => ({
          updateOne: {
            filter: { _id: it.itemId, userId: req.user._id },
            update: { $inc: { stock: -Number(it.quantity || 0) } },
          },
        }));
      if (stockUpdates.length > 0) {
        await Item.bulkWrite(stockUpdates);
        invalidateUserCache(req.user._id);
      }
    }

    return res.status(201).json({
      success: true,
      transfer: newTransfer,
      message: `${type === "DAMAGED_RETURN" ? "Damaged stock return logged" : "Transfer request raised"} successfully`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/inventory/transfers/:id/status
router.patch("/transfers/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const transfer = await StockTransfer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!transfer) {
      return res.status(404).json({ success: false, message: "Transfer record not found" });
    }

    const prevStatus = transfer.status;
    transfer.status = status;
    if (status === "DISPATCHED" && !transfer.dispatchedAt) transfer.dispatchedAt = new Date();
    if (status === "RECEIVED" && !transfer.receivedAt) transfer.receivedAt = new Date();
    await transfer.save();

    // If marked RECEIVED, increment the outlet's raw material/item stock!
    if (status === "RECEIVED" && prevStatus !== "RECEIVED" && transfer.type !== "DAMAGED_RETURN") {
      const stockUpdates = transfer.items
        .filter((it) => it.itemId && mongoose.Types.ObjectId.isValid(it.itemId))
        .map((it) => ({
          updateOne: {
            filter: { _id: it.itemId, userId: req.user._id },
            update: { $inc: { stock: Number(it.quantity || 0) } },
          },
        }));
      if (stockUpdates.length > 0) {
        await Item.bulkWrite(stockUpdates);
        invalidateUserCache(req.user._id);
      }
    }

    return res.status(200).json({
      success: true,
      transfer,
      message: `Transfer status updated to ${status}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PURCHASE ORDER (PO) MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/inventory/purchase-orders
router.get("/purchase-orders", async (req, res) => {
  try {
    const { status, source } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    if (source) filter.source = source;

    const purchaseOrders = await PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({ success: true, purchaseOrders });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/inventory/purchase-orders (Raise PO to Supplier or Central Kitchen)
router.post("/purchase-orders", async (req, res) => {
  try {
    const {
      supplierId,
      supplierName,
      supplierPhone = "",
      source = "SUPPLIER",
      outletZone = "Main Kitchen",
      items = [],
      expectedDeliveryDate,
      notes = "",
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: "At least one item is required for PO" });
    }

    const dateStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .split("/")
      .reverse()
      .join("");

    const count = await PurchaseOrder.countDocuments({
      userId: req.user._id,
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    });

    const poNumber = `PO-${dateStr}-${String(count + 1).padStart(3, "0")}`;

    let subtotal = 0;
    const processedItems = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.unitPrice || 0);
      const total = qty * price;
      subtotal += total;
      return {
        itemId: it.itemId,
        name: it.name,
        quantity: qty,
        unit: it.unit || "KG",
        unitPrice: price,
        total,
      };
    });

    const tax = Math.round(subtotal * 0.05 * 100) / 100; // default standard 5% tax or calculate
    const grandTotal = Math.round(subtotal + tax);

    const po = await PurchaseOrder.create({
      userId: req.user._id,
      poNumber,
      supplierId: supplierId && mongoose.Types.ObjectId.isValid(supplierId) ? supplierId : undefined,
      supplierName: supplierName || "Direct Supplier",
      supplierPhone,
      source,
      outletZone,
      items: processedItems,
      subtotal,
      tax,
      grandTotal,
      status: "RAISED",
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
      notes,
    });

    return res.status(201).json({
      success: true,
      purchaseOrder: po,
      message: `Purchase Order ${poNumber} raised successfully`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/inventory/purchase-orders/:id/status (Accept, Receive, or Cancel PO)
router.patch("/purchase-orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const po = await PurchaseOrder.findOne({ _id: req.params.id, userId: req.user._id });
    if (!po) {
      return res.status(404).json({ success: false, message: "Purchase Order not found" });
    }

    const prevStatus = po.status;
    po.status = status;
    if (status === "RECEIVED" && !po.receivedAt) {
      po.receivedAt = new Date();
    }
    await po.save();

    // When PO is RECEIVED: Automatically increase raw material / item stock in inventory!
    if (status === "RECEIVED" && prevStatus !== "RECEIVED") {
      const stockUpdates = po.items
        .filter((it) => it.itemId && mongoose.Types.ObjectId.isValid(it.itemId))
        .map((it) => ({
          updateOne: {
            filter: { _id: it.itemId, userId: req.user._id },
            update: { $inc: { stock: Number(it.quantity || 0) } },
          },
        }));

      if (stockUpdates.length > 0) {
        await Item.bulkWrite(stockUpdates);
        invalidateUserCache(req.user._id);
      }
    }

    return res.status(200).json({
      success: true,
      purchaseOrder: po,
      message: `PO marked as ${status}. ${status === "RECEIVED" ? "Stock updated automatically." : ""}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/inventory/frequent-items (Frequently ordered items from each supplier and outlet/zone)
router.get("/frequent-items", async (req, res) => {
  try {
    const pipeline = [
      { $match: { userId: req.user._id } },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            supplierName: "$supplierName",
            itemId: "$items.itemId",
            itemName: "$items.name",
            unit: "$items.unit",
          },
          orderCount: { $sum: 1 },
          totalQuantity: { $sum: "$items.quantity" },
          lastUnitPrice: { $last: "$items.unitPrice" },
        },
      },
      { $sort: { orderCount: -1 } },
      { $limit: 30 },
    ];

    const results = await PurchaseOrder.aggregate(pipeline);
    const frequentItems = results.map((r) => ({
      supplierName: r._id.supplierName,
      itemId: r._id.itemId,
      itemName: r._id.itemName,
      unit: r._id.unit,
      orderCount: r.orderCount,
      totalQuantity: r.totalQuantity,
      lastUnitPrice: r.lastUnitPrice,
    }));

    return res.status(200).json({ success: true, frequentItems });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RAW MATERIAL & CHANNEL AVAILABILITY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/inventory/raw-materials (Filtered list of raw materials with low stock alerts)
router.get("/raw-materials", async (req, res) => {
  try {
    const rawMaterials = await Item.find({
      userId: req.user._id,
      itemType: { $in: ["RAW_MATERIAL", "SEMI_FINISHED"] },
    })
      .sort({ stock: 1, name: 1 })
      .lean();

    return res.status(200).json({ success: true, rawMaterials });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/inventory/availability/:id (Toggle Dine-in or Online availability)
router.patch("/availability/:id", async (req, res) => {
  try {
    const { isDineInAvailable, isOnlineAvailable } = req.body;
    const update = {};
    if (isDineInAvailable !== undefined) update.isDineInAvailable = Boolean(isDineInAvailable);
    if (isOnlineAvailable !== undefined) update.isOnlineAvailable = Boolean(isOnlineAvailable);

    const updatedItem = await Item.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: update },
      { new: true }
    ).lean();

    if (!updatedItem) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    invalidateUserCache(req.user._id);
    return res.status(200).json({
      success: true,
      item: updatedItem,
      message: "Channel availability updated",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MULTI-STAGE RECIPE MANAGEMENT (BOM)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/inventory/recipes (List items with recipes attached)
router.get("/recipes", async (req, res) => {
  try {
    const dishes = await Item.find({
      userId: req.user._id,
      itemType: { $in: ["FINISHED_GOOD", "SEMI_FINISHED"] },
    })
      .select("name category sellingPrice costPrice unit recipe autoDeductRecipeStock isDineInAvailable isOnlineAvailable")
      .sort({ category: 1, name: 1 })
      .lean();

    return res.status(200).json({ success: true, dishes });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/inventory/recipe/:id (Attach / Update item-wise multi-stage recipe)
router.put("/recipe/:id", async (req, res) => {
  try {
    const { recipe = [], autoDeductRecipeStock = true } = req.body;

    const validatedRecipe = recipe.map((r) => ({
      rawMaterialId: r.rawMaterialId,
      rawMaterialName: r.rawMaterialName,
      quantity: Number(r.quantity) || 0,
      unit: r.unit || "GM",
      stage: r.stage || "COOKING",
    }));

    const updatedItem = await Item.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      {
        $set: {
          recipe: validatedRecipe,
          autoDeductRecipeStock: Boolean(autoDeductRecipeStock),
        },
      },
      { new: true }
    ).lean();

    if (!updatedItem) {
      return res.status(404).json({ success: false, message: "Dish not found" });
    }

    invalidateUserCache(req.user._id);
    return res.status(200).json({
      success: true,
      dish: updatedItem,
      message: `Recipe saved with ${validatedRecipe.length} ingredients`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

