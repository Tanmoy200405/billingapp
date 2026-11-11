import authRoutes from "../routes/authRoutes.js";
import partyRoutes from "../routes/partyRoutes.js";
import itemRoutes from "../routes/itemRoutes.js";
import dashboardRoutes from "../routes/dashboardRoutes.js";
import { createServiceApp } from "./createServiceApp.js";

/**
 * Core API & Catalog Microservice (Auth, Parties, Inventory, Dashboard).
 */
const app = createServiceApp({
  serviceName: "core-service",
  defaultPort: process.env.CORE_SERVICE_PORT || 5001,
  mountRoutes: (server) => {
    server.use("/api/auth", authRoutes);
    server.use("/api/parties", partyRoutes);
    server.use("/api/items", itemRoutes);
    server.use("/api/dashboard", dashboardRoutes);
  },
});

export default app;
