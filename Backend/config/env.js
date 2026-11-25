import dotenv from "dotenv";

dotenv.config();

const requiredEnvs = ["MONGODB_URI", "JWT_SECRET"];
for (const envName of requiredEnvs) {
  if (!process.env[envName]) {
    console.warn(`[Config Warning] Missing recommended environment variable: ${envName}`);
  }
}

export const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: (process.env.NODE_ENV || "development") === "production",

  database: {
    uri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ezo_billing",
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || "bistromate_default_secret_key_change_in_production",
    tokenExpiry: "30d",
  },

  server: {
    publicUrl: process.env.BACKEND_PUBLIC_URL || "https://billingapi.duckdns.org",
  },

  appRelease: {
    latestVersion: process.env.APP_LATEST_VERSION || "1.2.4",
    minSupportedVersion: process.env.APP_MIN_VERSION || "1.0.0",
    apkUrl:
      process.env.APP_APK_URL ||
      "https://github.com/jayeetamajumdar15-dev/billingapp/raw/main/BillingApp-release.apk",
    releaseNotes:
      process.env.APP_RELEASE_NOTES ||
      "Version 1.2.4: Fix party screen text overlap, fix inventory screen search and card text overlap, add Clear All Tables option and table delete buttons, and remove legacy predefined tables.",
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },

  email: {
    user: process.env.GMAIL_USER || "",
    appPassword: process.env.GMAIL_APP_PASSWORD || "",
  },

  aws: {
    region: process.env.AWS_REGION || "ap-south-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    sqsQueueUrl: process.env.AWS_SQS_QUEUE_URL || "",
    snsSmsEnabled: process.env.AWS_SNS_SMS_ENABLED === "true",
    snsSenderId: process.env.AWS_SNS_SENDER_ID || "BILLAPP",
    snsTopicArn: process.env.AWS_SNS_TOPIC_ARN || "",
    sesFromEmail: process.env.AWS_SES_FROM_EMAIL || process.env.GMAIL_USER || "",
    disableEmbeddedWorker: process.env.DISABLE_EMBEDDED_WORKER === "true",
  },

  microservices: {
    coreUrl: process.env.CORE_SERVICE_URL || "http://127.0.0.1:5001",
    billingUrl: process.env.BILLING_SERVICE_URL || "http://127.0.0.1:5002",
    reportsUrl: process.env.REPORTS_SERVICE_URL || "http://127.0.0.1:5003",
    messagingUrl: process.env.MESSAGING_SERVICE_URL || "http://127.0.0.1:5004",
  },
});

export default config;
