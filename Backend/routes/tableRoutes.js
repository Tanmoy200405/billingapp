import express from "express";
import Area from "../models/Area.js";
import Table from "../models/Table.js";
import Invoice from "../models/Invoice.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect);

const DEFAULT_AREAS = [
  { name: "Main Dining", code: "MAIN", serviceChargeRate: 0, color: "#2563EB", sortOrder: 1 },
  { name: "AC Hall", code: "AC", serviceChargeRate: 5, color: "#059669", sortOrder: 2 },
  { name: "Rooftop Garden", code: "ROOF", serviceChargeRate: 5, color: "#7C3AED", sortOrder: 3 },
];

async function ensureDefaultAreasAndTables(userId) {
  let areas = await Area.find({ userId }).sort({ sortOrder: 1 }).lean();
  if (!areas || areas.length === 0) {
    const toInsert = DEFAULT_AREAS.map((a) => ({ ...a, userId }));
    const insertedAreas = await Area.insertMany(toInsert);
    areas = insertedAreas.map((a) => a.toObject());

    // Also seed default tables for these areas
    const mainArea = areas.find((a) => a.name === "Main Dining") || areas[0];
    const acArea = areas.find((a) => a.name === "AC Hall") || areas[1] || areas[0];
    const roofArea = areas.find((a) => a.name === "Rooftop Garden") || areas[2] || areas[0];

    const initialTables = [
      { tableNo: "T-01", areaId: mainArea._id, areaName: mainArea.name, capacity: 4, sortOrder: 1 },
      { tableNo: "T-02", areaId: mainArea._id, areaName: mainArea.name, capacity: 4, sortOrder: 2 },
      { tableNo: "T-03", areaId: mainArea._id, areaName: mainArea.name, capacity: 2, sortOrder: 3 },
      { tableNo: "T-04", areaId: mainArea._id, areaName: mainArea.name, capacity: 6, sortOrder: 4 },
      { tableNo: "AC-01", areaId: acArea._id, areaName: acArea.name, capacity: 4, sortOrder: 5 },
      { tableNo: "AC-02", areaId: acArea._id, areaName: acArea.name, capacity: 6, sortOrder: 6 },
      { tableNo: "AC-03", areaId: acArea._id, areaName: acArea.name, capacity: 8, sortOrder: 7 },
      { tableNo: "R-01", areaId: roofArea._id, areaName: roofArea.name, capacity: 4, sortOrder: 8 },
      { tableNo: "R-02", areaId: roofArea._id, areaName: roofArea.name, capacity: 6, sortOrder: 9 },
    ].map((t) => ({ ...t, userId, status: "AVAILABLE" }));

    await Table.insertMany(initialTables);
  }
  return areas;
}

// ─────────────────────────────────────────────────────────────
// AREAS CRUD
// ─────────────────────────────────────────────────────────────

// GET /api/tables/areas
router.get("/areas", async (req, res) => {
  try {
    const areas = await ensureDefaultAreasAndTables(req.user._id);
    return res.status(200).json({ success: true, areas });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tables/areas
router.post("/areas", async (req, res) => {
  try {
    const { name, code, serviceChargeRate = 0, color = "#2563EB", description = "" } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Area name is required" });
    }

    const count = await Area.countDocuments({ userId: req.user._id });
    const area = await Area.create({
      userId: req.user._id,
      name: name.trim(),
      code: (code || "").trim().toUpperCase(),
      serviceChargeRate: Number(serviceChargeRate) || 0,
      color: color || "#2563EB",
      description: (description || "").trim(),
      sortOrder: count + 1,
    });

    return res.status(201).json({ success: true, area });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/tables/areas/:id
router.put("/areas/:id", async (req, res) => {
  try {
    const { name, code, serviceChargeRate, color, description, isActive } = req.body;
    const area = await Area.findOne({ _id: req.params.id, userId: req.user._id });
    if (!area) return res.status(404).json({ success: false, message: "Area not found" });

    if (name !== undefined) area.name = name.trim();
    if (code !== undefined) area.code = code.trim().toUpperCase();
    if (serviceChargeRate !== undefined) area.serviceChargeRate = Math.max(0, Number(serviceChargeRate) || 0);
    if (color !== undefined) area.color = color;
    if (description !== undefined) area.description = description.trim();
    if (isActive !== undefined) area.isActive = Boolean(isActive);

    await area.save();

    // Sync updated area name to tables
    if (name !== undefined) {
      await Table.updateMany(
        { areaId: area._id, userId: req.user._id },
        { $set: { areaName: area.name } }
      );
    }

    return res.status(200).json({ success: true, area });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/tables/areas/:id
router.delete("/areas/:id", async (req, res) => {
  try {
    const tableCount = await Table.countDocuments({ areaId: req.params.id, userId: req.user._id });
    if (tableCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete area with ${tableCount} table(s). Move or delete tables first.`,
      });
    }
    const result = await Area.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!result) return res.status(404).json({ success: false, message: "Area not found" });
    return res.status(200).json({ success: true, message: "Area deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// TABLES CRUD & OPERATIONS
// ─────────────────────────────────────────────────────────────

// GET /api/tables
router.get("/", async (req, res) => {
  try {
    await ensureDefaultAreasAndTables(req.user._id);

    const query = { userId: req.user._id };
    if (req.query.areaId) query.areaId = req.query.areaId;
    if (req.query.status) query.status = req.query.status.toUpperCase();

    const tables = await Table.find(query)
      .populate("areaId", "name serviceChargeRate color")
      .sort({ sortOrder: 1, tableNo: 1 })
      .lean();

    return res.status(200).json({ success: true, tables });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tables
router.post("/", async (req, res) => {
  try {
    const { tableNo, areaId, capacity = 4, shape = "square", sortOrder } = req.body;
    if (!tableNo || !tableNo.trim()) {
      return res.status(400).json({ success: false, message: "Table number/name is required" });
    }
    if (!areaId) {
      return res.status(400).json({ success: false, message: "Area selection is required" });
    }

    const area = await Area.findOne({ _id: areaId, userId: req.user._id });
    if (!area) return res.status(404).json({ success: false, message: "Selected area not found" });

    const existing = await Table.findOne({
      userId: req.user._id,
      tableNo: tableNo.trim(),
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Table "${tableNo}" already exists` });
    }

    const count = await Table.countDocuments({ userId: req.user._id });
    const table = await Table.create({
      userId: req.user._id,
      areaId: area._id,
      areaName: area.name,
      tableNo: tableNo.trim(),
      capacity: Number(capacity) || 4,
      shape: ["square", "round", "rectangle"].includes(shape) ? shape : "square",
      status: "AVAILABLE",
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : count + 1,
    });

    return res.status(201).json({ success: true, table });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/tables/:id
router.put("/:id", async (req, res) => {
  try {
    const { tableNo, areaId, capacity, shape, status, pax, customerName, customerPhone, notes } = req.body;
    const table = await Table.findOne({ _id: req.params.id, userId: req.user._id });
    if (!table) return res.status(404).json({ success: false, message: "Table not found" });

    if (tableNo !== undefined && tableNo.trim() !== table.tableNo) {
      const duplicate = await Table.findOne({
        userId: req.user._id,
        tableNo: tableNo.trim(),
        _id: { $ne: table._id },
      });
      if (duplicate) {
        return res.status(400).json({ success: false, message: `Table "${tableNo}" already exists` });
      }
      table.tableNo = tableNo.trim();
    }

    if (areaId !== undefined && areaId.toString() !== table.areaId?.toString()) {
      const area = await Area.findOne({ _id: areaId, userId: req.user._id });
      if (area) {
        table.areaId = area._id;
        table.areaName = area.name;
      }
    }

    if (capacity !== undefined) table.capacity = Math.max(1, Number(capacity) || 4);
    if (shape !== undefined) table.shape = shape;
    if (status !== undefined) table.status = status.toUpperCase();
    if (pax !== undefined) table.pax = Math.max(1, Number(pax) || 1);
    if (customerName !== undefined) table.customerName = customerName.trim();
    if (customerPhone !== undefined) table.customerPhone = customerPhone.trim();
    if (notes !== undefined) table.notes = notes.trim();

    await table.save();
    return res.status(200).json({ success: true, table });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/tables/:id
router.delete("/:id", async (req, res) => {
  try {
    const table = await Table.findOne({ _id: req.params.id, userId: req.user._id });
    if (!table) return res.status(404).json({ success: false, message: "Table not found" });
    if (table.status === "OCCUPIED" || table.status === "BILLED") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an occupied or billed table. Settle or transfer the order first.",
      });
    }
    await Table.deleteOne({ _id: table._id });
    return res.status(200).json({ success: true, message: "Table deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tables/transfer
// Move order from sourceTableId to targetTableId
router.post("/transfer", async (req, res) => {
  try {
    const { sourceTableId, targetTableId } = req.body;
    if (!sourceTableId || !targetTableId) {
      return res.status(400).json({ success: false, message: "Source and target table IDs are required" });
    }

    const [source, target] = await Promise.all([
      Table.findOne({ _id: sourceTableId, userId: req.user._id }),
      Table.findOne({ _id: targetTableId, userId: req.user._id }),
    ]);

    if (!source || !target) {
      return res.status(404).json({ success: false, message: "Source or target table not found" });
    }

    if (source.status === "AVAILABLE") {
      return res.status(400).json({ success: false, message: "Source table is not occupied" });
    }

    if (target.status !== "AVAILABLE") {
      return res.status(400).json({
        success: false,
        message: `Target table "${target.tableNo}" is already ${target.status.toLowerCase()}`,
      });
    }

    // Move state to target
    target.status = source.status;
    target.currentInvoiceId = source.currentInvoiceId;
    target.currentInvoiceNumber = source.currentInvoiceNumber;
    target.runningTotal = source.runningTotal;
    target.itemsCount = source.itemsCount;
    target.pax = source.pax;
    target.customerName = source.customerName;
    target.customerPhone = source.customerPhone;
    target.seatedAt = source.seatedAt;
    target.notes = source.notes;

    // Reset source
    source.status = "AVAILABLE";
    source.currentInvoiceId = null;
    source.currentInvoiceNumber = "";
    source.runningTotal = 0;
    source.itemsCount = 0;
    source.pax = 1;
    source.customerName = "";
    source.customerPhone = "";
    source.seatedAt = null;
    source.notes = "";

    await Promise.all([source.save(), target.save()]);

    // Update active invoice if linked
    if (target.currentInvoiceId) {
      await Invoice.updateOne(
        { _id: target.currentInvoiceId, userId: req.user._id },
        {
          $set: {
            tableId: target._id,
            tableName: target.tableNo,
            areaId: target.areaId,
            areaName: target.areaName,
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: `Order successfully transferred from ${source.tableNo} to ${target.tableNo}`,
      source,
      target,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tables/settle/:id
// Checkout / Vacate table
router.post("/settle/:id", async (req, res) => {
  try {
    const table = await Table.findOne({ _id: req.params.id, userId: req.user._id });
    if (!table) return res.status(404).json({ success: false, message: "Table not found" });

    table.status = "AVAILABLE";
    table.currentInvoiceId = null;
    table.currentInvoiceNumber = "";
    table.runningTotal = 0;
    table.itemsCount = 0;
    table.pax = 1;
    table.customerName = "";
    table.customerPhone = "";
    table.seatedAt = null;
    table.notes = "";

    await table.save();
    return res.status(200).json({ success: true, message: `Table ${table.tableNo} settled & available`, table });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tables/reserve/:id
router.post("/reserve/:id", async (req, res) => {
  try {
    const { guestName, phone, time, cancel } = req.body;
    const table = await Table.findOne({ _id: req.params.id, userId: req.user._id });
    if (!table) return res.status(404).json({ success: false, message: "Table not found" });

    if (cancel) {
      table.status = "AVAILABLE";
      table.reservationName = "";
      table.reservationPhone = "";
      table.reservationTime = "";
    } else {
      table.status = "RESERVED";
      table.reservationName = (guestName || "Guest").trim();
      table.reservationPhone = (phone || "").trim();
      table.reservationTime = (time || "").trim();
    }

    await table.save();
    return res.status(200).json({ success: true, table });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;

