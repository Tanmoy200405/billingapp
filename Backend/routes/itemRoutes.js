import express from "express";
import Item from "../models/Item.js";
import { protect } from "../middleware/authMiddleware.js";

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

    const items = await Item.find(filter).sort({ name: 1 }).lean();

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
