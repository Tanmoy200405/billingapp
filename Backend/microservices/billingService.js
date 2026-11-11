import invoiceRoutes from "../routes/invoiceRoutes.js";
import { createServiceApp } from "./createServiceApp.js";

/**
 * Billing & Invoice Microservice (Checkout, Public Bill Viewer, Invoice PDF).
 */
const app = createServiceApp({
  serviceName: "billing-service",
  defaultPort: process.env.BILLING_SERVICE_PORT || 5002,
  mountRoutes: (server) => {
    server.use("/api/invoices", invoiceRoutes);
  },
});

export default app;
