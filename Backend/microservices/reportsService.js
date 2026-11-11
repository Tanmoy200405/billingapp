import reportRoutes from "../routes/reportRoutes.js";
import { createServiceApp } from "./createServiceApp.js";

/**
 * Analytics & Reports Microservice (Aggregations, Sales/Inventory/Ledger PDF/CSV).
 */
const app = createServiceApp({
  serviceName: "reports-service",
  defaultPort: process.env.REPORTS_SERVICE_PORT || 5003,
  mountRoutes: (server) => {
    server.use("/api/reports", reportRoutes);
  },
});

export default app;
