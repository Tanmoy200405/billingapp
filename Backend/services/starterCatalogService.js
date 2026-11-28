import mongoose from "mongoose";
import Item from "../models/Item.js";
import Category from "../models/Category.js";
import { invalidateUserCache } from "./cacheService.js";

/**
 * Standard Restaurant Starter Raw Materials (Kitchen Inventory)
 */
const STARTER_RAW_MATERIALS = [
  {
    key: "rice",
    name: "Basmati Rice",
    category: "Grains & Rice",
    costPrice: 75,
    sellingPrice: 0,
    stock: 50,
    unit: "KG",
    lowStockThreshold: 10,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "oil",
    name: "Cooking Sunflower Oil",
    category: "Oils & Ghee",
    costPrice: 130,
    sellingPrice: 0,
    stock: 40,
    unit: "LTR",
    lowStockThreshold: 10,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "chicken",
    name: "Fresh Raw Chicken",
    category: "Meat & Poultry",
    costPrice: 180,
    sellingPrice: 0,
    stock: 30,
    unit: "KG",
    lowStockThreshold: 5,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "paneer",
    name: "Fresh Malai Paneer",
    category: "Dairy",
    costPrice: 320,
    sellingPrice: 0,
    stock: 15,
    unit: "KG",
    lowStockThreshold: 3,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "milk",
    name: "Fresh Whole Milk",
    category: "Dairy",
    costPrice: 60,
    sellingPrice: 0,
    stock: 30,
    unit: "LTR",
    lowStockThreshold: 5,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "flour",
    name: "Wheat Flour / Maida",
    category: "Flour & Bakery",
    costPrice: 40,
    sellingPrice: 0,
    stock: 50,
    unit: "KG",
    lowStockThreshold: 10,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "potatoes",
    name: "Fresh Potatoes",
    category: "Vegetables",
    costPrice: 25,
    sellingPrice: 0,
    stock: 40,
    unit: "KG",
    lowStockThreshold: 10,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "onions",
    name: "Fresh Onions",
    category: "Vegetables",
    costPrice: 35,
    sellingPrice: 0,
    stock: 40,
    unit: "KG",
    lowStockThreshold: 10,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "tomatoes",
    name: "Fresh Tomatoes",
    category: "Vegetables",
    costPrice: 30,
    sellingPrice: 0,
    stock: 25,
    unit: "KG",
    lowStockThreshold: 5,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "spices",
    name: "Garam Masala & Spices Mix",
    category: "Spices",
    costPrice: 450,
    sellingPrice: 0,
    stock: 10,
    unit: "KG",
    lowStockThreshold: 2,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "sugar",
    name: "Refined White Sugar",
    category: "Pantry",
    costPrice: 45,
    sellingPrice: 0,
    stock: 25,
    unit: "KG",
    lowStockThreshold: 5,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "tea",
    name: "Assam CTC Tea Leaves",
    category: "Beverages",
    costPrice: 350,
    sellingPrice: 0,
    stock: 10,
    unit: "KG",
    lowStockThreshold: 2,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "coffee",
    name: "Arabica Roast Coffee Powder",
    category: "Beverages",
    costPrice: 650,
    sellingPrice: 0,
    stock: 5,
    unit: "KG",
    lowStockThreshold: 1,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "cheese",
    name: "Mozzarella Cheese Blend",
    category: "Dairy",
    costPrice: 420,
    sellingPrice: 0,
    stock: 10,
    unit: "KG",
    lowStockThreshold: 2,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "burger_bun",
    name: "Fresh Burger Buns (Pack)",
    category: "Flour & Bakery",
    costPrice: 12,
    sellingPrice: 0,
    stock: 60,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "RAW_MATERIAL",
  },
  {
    key: "pizza_base",
    name: "Thin Crust Pizza Base 8-inch",
    category: "Flour & Bakery",
    costPrice: 18,
    sellingPrice: 0,
    stock: 50,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "RAW_MATERIAL",
  },
];

/**
 * Standard Restaurant Starter Food Menu (Finished Goods / Dishes)
 * Recipes reference the starter raw material keys
 */
const STARTER_FOOD_ITEMS = [
  // ── Fast Food & Snacks ──
  {
    name: "Veg Cheese Burger",
    category: "Fast Food",
    costPrice: 35,
    sellingPrice: 80,
    taxRate: 5,
    stock: 50,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "burger_bun", quantity: 1, unit: "PCS", stage: "PREP" },
      { key: "potatoes", quantity: 100, unit: "GM", stage: "COOKING" },
      { key: "oil", quantity: 20, unit: "ML", stage: "COOKING" },
      { key: "cheese", quantity: 30, unit: "GM", stage: "GARNISH" },
    ],
  },
  {
    name: "Crispy Chicken Burger",
    category: "Fast Food",
    costPrice: 55,
    sellingPrice: 130,
    taxRate: 5,
    stock: 40,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "burger_bun", quantity: 1, unit: "PCS", stage: "PREP" },
      { key: "chicken", quantity: 120, unit: "GM", stage: "COOKING" },
      { key: "oil", quantity: 25, unit: "ML", stage: "COOKING" },
    ],
  },
  {
    name: "Classic French Fries",
    category: "Fast Food",
    costPrice: 25,
    sellingPrice: 70,
    taxRate: 5,
    stock: 60,
    unit: "PCS",
    lowStockThreshold: 15,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "potatoes", quantity: 150, unit: "GM", stage: "PREP" },
      { key: "oil", quantity: 30, unit: "ML", stage: "COOKING" },
    ],
  },
  {
    name: "Classic Margherita Pizza",
    category: "Pizza",
    costPrice: 70,
    sellingPrice: 160,
    taxRate: 5,
    stock: 30,
    unit: "PCS",
    lowStockThreshold: 5,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "pizza_base", quantity: 1, unit: "PCS", stage: "PREP" },
      { key: "cheese", quantity: 100, unit: "GM", stage: "COOKING" },
      { key: "tomatoes", quantity: 50, unit: "GM", stage: "COOKING" },
    ],
  },
  {
    name: "Farmhouse Veg Delight Pizza",
    category: "Pizza",
    costPrice: 95,
    sellingPrice: 220,
    taxRate: 5,
    stock: 25,
    unit: "PCS",
    lowStockThreshold: 5,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "pizza_base", quantity: 1, unit: "PCS", stage: "PREP" },
      { key: "cheese", quantity: 120, unit: "GM", stage: "COOKING" },
      { key: "onions", quantity: 40, unit: "GM", stage: "COOKING" },
      { key: "tomatoes", quantity: 40, unit: "GM", stage: "COOKING" },
      { key: "paneer", quantity: 50, unit: "GM", stage: "GARNISH" },
    ],
  },

  // ── Main Course & Rice ──
  {
    name: "Royal Chicken Dum Biryani",
    category: "Main Course",
    costPrice: 90,
    sellingPrice: 220,
    taxRate: 5,
    stock: 40,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "chicken", quantity: 250, unit: "GM", stage: "COOKING" },
      { key: "rice", quantity: 200, unit: "GM", stage: "COOKING" },
      { key: "oil", quantity: 30, unit: "ML", stage: "COOKING" },
      { key: "onions", quantity: 50, unit: "GM", stage: "COOKING" },
      { key: "spices", quantity: 15, unit: "GM", stage: "GARNISH" },
    ],
  },
  {
    name: "Hyderabadi Veg Dum Biryani",
    category: "Main Course",
    costPrice: 60,
    sellingPrice: 150,
    taxRate: 5,
    stock: 30,
    unit: "PCS",
    lowStockThreshold: 8,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "rice", quantity: 200, unit: "GM", stage: "COOKING" },
      { key: "potatoes", quantity: 60, unit: "GM", stage: "COOKING" },
      { key: "onions", quantity: 40, unit: "GM", stage: "COOKING" },
      { key: "oil", quantity: 25, unit: "ML", stage: "COOKING" },
      { key: "spices", quantity: 12, unit: "GM", stage: "GARNISH" },
    ],
  },
  {
    name: "Paneer Butter Masala",
    category: "Main Course",
    costPrice: 75,
    sellingPrice: 180,
    taxRate: 5,
    stock: 35,
    unit: "PCS",
    lowStockThreshold: 8,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "paneer", quantity: 200, unit: "GM", stage: "COOKING" },
      { key: "tomatoes", quantity: 100, unit: "GM", stage: "COOKING" },
      { key: "oil", quantity: 30, unit: "ML", stage: "COOKING" },
      { key: "milk", quantity: 50, unit: "ML", stage: "COOKING" },
      { key: "spices", quantity: 15, unit: "GM", stage: "GARNISH" },
    ],
  },
  {
    name: "Chicken Butter Masala",
    category: "Main Course",
    costPrice: 100,
    sellingPrice: 240,
    taxRate: 5,
    stock: 35,
    unit: "PCS",
    lowStockThreshold: 8,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "chicken", quantity: 250, unit: "GM", stage: "COOKING" },
      { key: "tomatoes", quantity: 100, unit: "GM", stage: "COOKING" },
      { key: "oil", quantity: 30, unit: "ML", stage: "COOKING" },
      { key: "milk", quantity: 50, unit: "ML", stage: "COOKING" },
      { key: "spices", quantity: 15, unit: "GM", stage: "GARNISH" },
    ],
  },
  {
    name: "Butter Naan",
    category: "Breads",
    costPrice: 12,
    sellingPrice: 35,
    taxRate: 5,
    stock: 80,
    unit: "PCS",
    lowStockThreshold: 20,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "flour", quantity: 80, unit: "GM", stage: "PREP" },
      { key: "milk", quantity: 20, unit: "ML", stage: "COOKING" },
    ],
  },
  {
    name: "Tandoori Roti",
    category: "Breads",
    costPrice: 8,
    sellingPrice: 20,
    taxRate: 5,
    stock: 80,
    unit: "PCS",
    lowStockThreshold: 20,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "flour", quantity: 70, unit: "GM", stage: "PREP" },
    ],
  },
  {
    name: "Jeera Rice",
    category: "Rice",
    costPrice: 40,
    sellingPrice: 110,
    taxRate: 5,
    stock: 40,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "rice", quantity: 180, unit: "GM", stage: "COOKING" },
      { key: "oil", quantity: 15, unit: "ML", stage: "COOKING" },
    ],
  },

  // ── Beverages ──
  {
    name: "Kulhad Masala Chai",
    category: "Beverages",
    costPrice: 8,
    sellingPrice: 25,
    taxRate: 5,
    stock: 100,
    unit: "PCS",
    lowStockThreshold: 25,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "milk", quantity: 100, unit: "ML", stage: "COOKING" },
      { key: "tea", quantity: 10, unit: "GM", stage: "COOKING" },
      { key: "sugar", quantity: 15, unit: "GM", stage: "GARNISH" },
    ],
  },
  {
    name: "Classic Cold Coffee",
    category: "Beverages",
    costPrice: 30,
    sellingPrice: 80,
    taxRate: 5,
    stock: 50,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "milk", quantity: 180, unit: "ML", stage: "PREP" },
      { key: "coffee", quantity: 15, unit: "GM", stage: "COOKING" },
      { key: "sugar", quantity: 20, unit: "GM", stage: "GARNISH" },
    ],
  },
  {
    name: "Fresh Lime Soda",
    category: "Beverages",
    costPrice: 15,
    sellingPrice: 50,
    taxRate: 5,
    stock: 60,
    unit: "PCS",
    lowStockThreshold: 15,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "sugar", quantity: 20, unit: "GM", stage: "PREP" },
    ],
  },

  // ── Desserts ──
  {
    name: "Hot Chocolate Brownie",
    category: "Desserts",
    costPrice: 35,
    sellingPrice: 90,
    taxRate: 5,
    stock: 30,
    unit: "PCS",
    lowStockThreshold: 8,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "flour", quantity: 60, unit: "GM", stage: "PREP" },
      { key: "sugar", quantity: 30, unit: "GM", stage: "COOKING" },
      { key: "milk", quantity: 30, unit: "ML", stage: "COOKING" },
    ],
  },
  {
    name: "Gulab Jamun (2 Pcs)",
    category: "Desserts",
    costPrice: 18,
    sellingPrice: 50,
    taxRate: 5,
    stock: 40,
    unit: "PCS",
    lowStockThreshold: 10,
    itemType: "FINISHED_GOOD",
    recipeKeys: [
      { key: "milk", quantity: 50, unit: "ML", stage: "COOKING" },
      { key: "sugar", quantity: 40, unit: "GM", stage: "GARNISH" },
      { key: "oil", quantity: 20, unit: "ML", stage: "COOKING" },
    ],
  },
];

/**
 * Seed complete restaurant catalog (Raw Materials + Finished Food Dishes + Categories + Recipes)
 * for a user if they do not have any items yet, or when force is requested.
 */
export async function seedStarterCatalog(userId, force = false) {
  const existingCount = await Item.countDocuments({ userId });
  if (existingCount > 0 && !force) {
    return {
      seeded: false,
      message: "Catalog already initialized",
      count: existingCount,
    };
  }

  // 1. Insert Raw Materials (Inventory)
  const rawMaterialDocs = STARTER_RAW_MATERIALS.map((raw) => ({
    userId,
    name: raw.name,
    category: raw.category,
    costPrice: raw.costPrice,
    sellingPrice: raw.sellingPrice,
    stock: raw.stock,
    unit: raw.unit,
    lowStockThreshold: raw.lowStockThreshold,
    itemType: "RAW_MATERIAL",
    isDineInAvailable: false,
    isOnlineAvailable: false,
  }));

  const insertedRawMaterials = await Item.insertMany(rawMaterialDocs);
  const rawMapByKey = new Map();
  insertedRawMaterials.forEach((doc, idx) => {
    const rawDef = STARTER_RAW_MATERIALS[idx];
    if (rawDef?.key) {
      rawMapByKey.set(rawDef.key, doc);
    }
  });

  // 2. Insert Finished Goods (Food Items / Dishes) with Recipes linking to Raw Materials
  const foodItemDocs = STARTER_FOOD_ITEMS.map((dish) => {
    const recipe = (dish.recipeKeys || [])
      .map((r) => {
        const rawDoc = rawMapByKey.get(r.key);
        if (!rawDoc) return null;
        return {
          rawMaterialId: rawDoc._id,
          rawMaterialName: rawDoc.name,
          quantity: r.quantity,
          unit: r.unit,
          stage: r.stage || "COOKING",
        };
      })
      .filter(Boolean);

    return {
      userId,
      name: dish.name,
      category: dish.category,
      costPrice: dish.costPrice,
      sellingPrice: dish.sellingPrice,
      taxRate: dish.taxRate || 0,
      stock: dish.stock,
      unit: dish.unit,
      lowStockThreshold: dish.lowStockThreshold,
      itemType: "FINISHED_GOOD",
      isDineInAvailable: true,
      isOnlineAvailable: true,
      autoDeductRecipeStock: true,
      recipe,
    };
  });

  const insertedFoodItems = await Item.insertMany(foodItemDocs);

  // 3. Register Categories
  const allCategoryNames = Array.from(
    new Set([
      ...STARTER_RAW_MATERIALS.map((r) => r.category),
      ...STARTER_FOOD_ITEMS.map((d) => d.category),
      "General",
    ])
  );

  const categoryOps = allCategoryNames.map((name) => ({
    updateOne: {
      filter: { userId, name },
      update: { $setOnInsert: { userId, name } },
      upsert: true,
    },
  }));
  if (categoryOps.length > 0) {
    await Category.bulkWrite(categoryOps, { ordered: false }).catch(() => {});
  }

  // 4. Invalidate Cache
  invalidateUserCache(userId);

  return {
    seeded: true,
    rawCount: insertedRawMaterials.length,
    dishCount: insertedFoodItems.length,
    totalCount: insertedRawMaterials.length + insertedFoodItems.length,
    message: `Successfully seeded ${insertedFoodItems.length} food dishes and ${insertedRawMaterials.length} raw inventory materials`,
  };
}
