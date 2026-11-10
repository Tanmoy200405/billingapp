import express from "express";
import { createRequire } from "module";
import Item from "../models/Item.js";
import Category from "../models/Category.js";
import { protect } from "../middleware/authMiddleware.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const router = express.Router();

router.use(protect);

router.get("/", async (req, res) => {
  try {
    const { search, category, lowStock } = req.query;
    const filter = { userId: req.user._id };

    if (category && category !== "All") {
      filter.category = category;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { barcode: searchRegex },
        { category: searchRegex },
      ];
    }

    if (lowStock === "true") {
      filter.$expr = { $lte: ["$stock", "$lowStockThreshold"] };
    }

    const items = await Item.find(filter)
      .collation({ locale: "en", numericOrdering: true })
      .sort({ name: 1 })
      .lean();

    items.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    return res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch items",
      error: error.message,
    });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const itemCategories = await Item.distinct("category", { userId: req.user._id });
    let savedCategories = [];
    try {
      savedCategories = (await Category.find({ userId: req.user._id }).lean()).map((c) => c.name);
    } catch {}

    const combined = Array.from(new Set([...savedCategories, ...itemCategories].filter(Boolean)));
    if (!combined.length) {
      combined.push("General");
    }

    combined.sort((a, b) =>
      String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    return res.status(200).json({
      success: true,
      categories: combined,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: error.message,
    });
  }
});

router.post("/categories", async (req, res) => {
  try {
    const name = (req.body.name || "").toString().trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const existing = await Category.findOne({
      userId: req.user._id,
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Category already exists",
        category: existing.name,
      });
    }

    const cat = await Category.create({
      userId: req.user._id,
      name,
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: cat.name,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: error.message,
    });
  }
});

router.get("/barcode/:barcode", async (req, res) => {
  try {
    const item = await Item.findOne({
      userId: req.user._id,
      barcode: req.params.barcode.trim(),
    }).lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "No item found with this barcode",
      });
    }

    return res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error scanning barcode",
      error: error.message,
    });
  }
});

router.post("/bulk-import", async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body.items)
      ? req.body.items
      : Array.isArray(req.body)
      ? req.body
      : [];

    if (!rawItems.length) {
      return res.status(400).json({ success: false, message: "No items provided for import" });
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const entry of rawItems) {
      const name = (entry.name || entry["Item Name"] || entry.itemName || "").toString().trim();
      const sellingPrice = Number(
        entry.sellingPrice ??
        entry["Selling Price"] ??
        entry.price ??
        entry.rate ??
        0
      );

      if (!name || isNaN(sellingPrice) || sellingPrice <= 0) {
        continue;
      }

      const category = (entry.category || entry["Category"] || "General").toString().trim();
      const barcode = (entry.barcode || entry["Barcode"] || "").toString().trim();
      const hsnCode = (entry.hsnCode || entry["HSN"] || entry["Hsn Code"] || "").toString().trim();
      const costPrice = Number(entry.costPrice ?? entry["Purchase Price"] ?? entry["Cost Price"] ?? 0) || 0;
      const taxRate = Number(entry.taxRate ?? entry["Tax"] ?? entry["Tax Rate"] ?? 0) || 0;
      const stock = Number(entry.stock ?? entry["Stock"] ?? entry.quantity ?? 0) || 0;
      const unit = (entry.unit || entry["Unit"] || "PCS").toString().trim().toUpperCase();
      const lowStockThreshold = Number(entry.lowStockThreshold ?? entry["Low Stock Threshold"] ?? 5) || 5;

      let existing = null;
      if (barcode) {
        existing = await Item.findOne({ userId: req.user._id, barcode });
      }
      if (!existing) {
        existing = await Item.findOne({
          userId: req.user._id,
          name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "i") },
        });
      }

      if (existing) {
        existing.name = name;
        if (barcode) existing.barcode = barcode;
        if (hsnCode) existing.hsnCode = hsnCode;
        if (category) existing.category = category;
        existing.sellingPrice = sellingPrice;
        if (costPrice) existing.costPrice = costPrice;
        existing.taxRate = taxRate;
        existing.stock = stock;
        existing.unit = unit;
        existing.lowStockThreshold = lowStockThreshold;
        await existing.save();
        updatedCount++;
      } else {
        await Item.create({
          userId: req.user._id,
          name,
          barcode: barcode || undefined,
          hsnCode: hsnCode || undefined,
          category,
          costPrice,
          sellingPrice,
          taxRate,
          stock,
          unit,
          lowStockThreshold,
        });
        addedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Menu imported successfully (${addedCount} added, ${updatedCount} updated)`,
      addedCount,
      updatedCount,
      totalProcessed: addedCount + updatedCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

function parseItemsFromPdfText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  const headerWords = /^(item|product|description|particular|name|sl\.?no|s\.?no|rate|price|amount|qty|quantity|unit|total|subtotal|cgst|sgst|tax|page\s+\d+)/i;

  for (const line of lines) {
    if (line.length < 3 || headerWords.test(line)) continue;
    if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line)) continue;
    if (/^(tax\s*invoice|bill\s*of\s*supply|invoice|receipt|menu|price\s*list|catalogue)/i.test(line)) continue;

    const parts = line.split(/[|\t,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const name = parts[0].replace(/^[\d\.\-\*\)]+\s*/, "").trim();
      const priceStr = parts.find((p) => /^(₹|rs\.?|inr)?\s*\d+(\.\d+)?$/i.test(p.trim()));
      if (priceStr) {
        const price = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
        if (price > 0 && name.length >= 2) {
          items.push({
            name,
            sellingPrice: price,
            category: parts[2] || "General",
            stock: parseInt(parts[3]) || 10,
            unit: (parts[4] || "PCS").toUpperCase(),
          });
          continue;
        }
      }
    }

    const endPriceMatch = line.match(/^(.+?)\s*(?:[-–:]|\.{2,})?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)$/i);
    if (endPriceMatch) {
      const rawName = endPriceMatch[1].replace(/^[\d\.\-\*\)]+\s*/, "").trim();
      const price = parseFloat(endPriceMatch[2]);
      if (rawName.length >= 2 && price > 0 && !headerWords.test(rawName)) {
        items.push({
          name: rawName,
          sellingPrice: price,
          category: "General",
          stock: 10,
          unit: "PCS",
        });
        continue;
      }
    }

    const kvMatch = line.match(/(?:item|name)\s*:\s*(.+?)\s*(?:price|rate)\s*:\s*(\d+(?:\.\d{1,2})?)/i);
    if (kvMatch) {
      const name = kvMatch[1].trim();
      const price = parseFloat(kvMatch[2]);
      if (name.length >= 2 && price > 0) {
        items.push({
          name,
          sellingPrice: price,
          category: "General",
          stock: 10,
          unit: "PCS",
        });
        continue;
      }
    }
  }
  return items;
}

router.post("/import-pdf", async (req, res) => {
  try {
    const isRawBuffer = Buffer.isBuffer(req.body);
    const { pdfBase64, pdfText, previewOnly: bodyPreview } = isRawBuffer ? {} : (req.body || {});
    const previewOnly = bodyPreview || req.query.previewOnly === "true";
    let extractedText = pdfText || "";

    if (isRawBuffer && req.body.length > 0) {
      const parser = new PDFParse({ data: req.body });
      await parser.load();
      const result = await parser.getText();
      await parser.destroy();
      extractedText = result.text || "";
    } else if (pdfBase64) {
      const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const parser = new PDFParse({ data: buffer });
      await parser.load();
      const result = await parser.getText();
      await parser.destroy();
      extractedText = result.text || "";
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({
        success: false,
        message: "No readable text found in the provided PDF file.",
      });
    }

    const items = parseItemsFromPdfText(extractedText);
    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: "Could not find valid item names and prices in this PDF file.",
      });
    }

    if (previewOnly) {
      return res.status(200).json({
        success: true,
        count: items.length,
        items,
      });
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const entry of items) {
      const name = entry.name.trim();
      const sellingPrice = Number(entry.sellingPrice);
      const category = entry.category || "General";
      const stock = Number(entry.stock) || 10;
      const unit = (entry.unit || "PCS").toUpperCase();

      let existing = await Item.findOne({
        userId: req.user._id,
        name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "i") },
      });

      if (existing) {
        existing.sellingPrice = sellingPrice;
        if (category && category !== "General") existing.category = category;
        existing.stock = stock;
        existing.unit = unit;
        await existing.save();
        updatedCount++;
      } else {
        await Item.create({
          userId: req.user._id,
          name,
          category,
          costPrice: 0,
          sellingPrice,
          taxRate: 0,
          stock,
          unit,
          lowStockThreshold: 5,
        });
        addedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `PDF menu imported successfully (${addedCount} added, ${updatedCount} updated)`,
      addedCount,
      updatedCount,
      totalProcessed: addedCount + updatedCount,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to process PDF file: " + error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      name,
      barcode,
      hsnCode,
      category = "General",
      costPrice = 0,
      sellingPrice,
      taxRate = 0,
      stock = 0,
      unit = "PCS",
      lowStockThreshold = 5,
      imageUrl,
    } = req.body;

    if (!name || sellingPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product name and selling price are required",
      });
    }

    if (barcode && barcode.trim()) {
      const existingBarcode = await Item.findOne({
        userId: req.user._id,
        barcode: barcode.trim(),
      });
      if (existingBarcode) {
        return res.status(400).json({
          success: false,
          message: "An item with this barcode already exists",
        });
      }
    }

    const item = await Item.create({
      userId: req.user._id,
      name: name.trim(),
      barcode: barcode ? barcode.trim() : undefined,
      hsnCode: hsnCode ? hsnCode.trim() : undefined,
      category: category.trim(),
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice),
      taxRate: Number(taxRate) || 0,
      stock: Number(stock) || 0,
      unit,
      lowStockThreshold: Number(lowStockThreshold) || 5,
      imageUrl,
    });

    return res.status(201).json({
      success: true,
      message: "Item added successfully",
      item,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create item",
      error: error.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      barcode,
      hsnCode,
      category,
      costPrice,
      sellingPrice,
      taxRate,
      stock,
      unit,
      lowStockThreshold,
      imageUrl,
    } = req.body;

    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      {
        ...(name && { name: name.trim() }),
        ...(barcode !== undefined && { barcode: barcode ? barcode.trim() : "" }),
        ...(hsnCode !== undefined && { hsnCode: hsnCode ? hsnCode.trim() : "" }),
        ...(category && { category: category.trim() }),
        ...(costPrice !== undefined && { costPrice: Number(costPrice) }),
        ...(sellingPrice !== undefined && { sellingPrice: Number(sellingPrice) }),
        ...(taxRate !== undefined && { taxRate: Number(taxRate) }),
        ...(stock !== undefined && { stock: Number(stock) }),
        ...(unit && { unit }),
        ...(lowStockThreshold !== undefined && {
          lowStockThreshold: Number(lowStockThreshold),
        }),
        ...(imageUrl !== undefined && { imageUrl }),
      },
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Item updated successfully",
      item,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update item",
      error: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Item deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete item",
      error: error.message,
    });
  }
});

export default router;
