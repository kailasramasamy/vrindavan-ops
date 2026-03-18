import mysql from "mysql2/promise";

// Marketing campaign database pool (vrindavan_ops)
const marketingPool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "root",
  database: process.env.DB_NAME || "vrindavan_ops",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Sales data database pool (APP_DB - read only)
const salesDataPool = mysql.createPool({
  host: process.env.APP_DB_HOST || "127.0.0.1",
  user: process.env.APP_DB_USER || "root",
  password: process.env.APP_DB_PASS || "root",
  database: process.env.APP_DB_NAME || "vrindavan_app_prod",
  port: process.env.APP_DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

export { marketingPool, salesDataPool };
