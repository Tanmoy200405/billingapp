module.exports = {
  apps: [
    {
      name: "billingapp-gateway",
      script: "./gateway.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "180M",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },
    },
    {
      name: "ms-core",
      script: "./microservices/coreService.js",
      instances: Number(process.env.CORE_INSTANCES || 1),
      exec_mode: "cluster",
      max_memory_restart: "240M",
      env: {
        NODE_ENV: "production",
        PORT: 5001,
        MICROSERVICES_MODE: "true",
      },
    },
    {
      name: "ms-billing",
      script: "./microservices/billingService.js",
      instances: Number(process.env.BILLING_INSTANCES || 1),
      exec_mode: "cluster",
      max_memory_restart: "240M",
      env: {
        NODE_ENV: "production",
        PORT: 5002,
        MICROSERVICES_MODE: "true",
      },
    },
    {
      name: "ms-reports",
      script: "./microservices/reportsService.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "260M",
      env: {
        NODE_ENV: "production",
        PORT: 5003,
        MICROSERVICES_MODE: "true",
      },
    },
    {
      name: "ms-messaging",
      script: "./microservices/messagingService.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "320M",
      env: {
        NODE_ENV: "production",
        PORT: 5004,
      },
    },
  ],
};
