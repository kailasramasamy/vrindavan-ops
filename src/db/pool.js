import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config();

const USE_DB = String(process.env.USE_DB || "false").toLowerCase() === "true";

// Operations database pool (vrindavan_ops)
let opsPool = null;

// Analytics database pool (APP_DB)
let analyticsPool = null;

if (USE_DB) {
  // Operations database connection
  opsPool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "root",
    database: process.env.DB_NAME || "vrindavan_ops",
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Analytics database connection
  analyticsPool = mysql.createPool({
    host: process.env.APP_DB_HOST || "127.0.0.1",
    user: process.env.APP_DB_USER || "root",
    password: process.env.APP_DB_PASS || "root",
    database: process.env.APP_DB_NAME || "vrindavan_app_prod",
    port: Number(process.env.APP_DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

// Default export for backward compatibility (operations database)
export default opsPool;

// Named exports for specific database access
export { analyticsPool, opsPool };

// Alias for stage copy database
export const stageCopyPool = analyticsPool;

// Get APP_DB name for cross-database queries
export const getAppDbName = () => {
  return process.env.APP_DB_NAME || "vrindavan_app_prod";
};
