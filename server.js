import compression from "compression";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import methodOverride from "method-override";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import pool from "./src/db/pool.js";
import { attachUser } from "./src/middleware/rbac.js";
import auth from "./src/routes/auth.js";
import ops from "./src/routes/ops.js";
import marketing from "./src/routes/marketing.js";
import reminderScheduler from "./src/services/reminderScheduler.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Security + perf
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.includes("/reports") && req.query.export_format === "pdf") {
        return false;
      }
      if (res.getHeader("Content-Type") === "application/pdf") {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);
app.use(morgan("dev"));

// Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "vrindavan-ops-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Custom method override that works with multipart forms
app.use(
  methodOverride(function (req, res) {
    if (req.body && typeof req.body === "object" && "_method" in req.body) {
      var method = req.body._method;
      delete req.body._method;
      return method;
    }
  }),
);
app.use(methodOverride("_method"));

// Serve uploads with authentication
app.use("/uploads", attachUser, express.static(path.join(__dirname, "public", "uploads"), { maxAge: "1d" }));

// Static
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));

// Views
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// RBAC middleware for all routes
app.use(attachUser);

// Authentication routes (after RBAC middleware)
// Mounted at /ops so URLs match the legacy monorepo contract
// (Apache forwards vrindavan.farm/ops/* → localhost:PORT/ops/*)
app.use("/ops", auth);

// Ops routes
app.use("/ops", ops);

// Marketing routes
app.use("/marketing", marketing);

// Expose db pool to routers
if (pool) app.set("dbPool", pool);

// 404 handler
app.use((req, res) => {
  res.status(404).render("pages/ops/error", {
    seo: { title: "Not Found" },
    pageKey: "ops/error",
    title: "Page Not Found",
    message: "The page you are looking for does not exist.",
    error: { status: 404 },
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).render("pages/ops/error", {
    seo: { title: "Error" },
    pageKey: "ops/error",
    title: "Server Error",
    message: err.message || "An unexpected error occurred.",
    error: { status: err.status || 500 },
  });
});

// Create HTTP server with increased timeouts
const server = app.listen(PORT, () => {
  console.log(`Vrindavan Ops running at http://localhost:${PORT}`);

  const USE_DB = String(process.env.USE_DB || "false").toLowerCase() === "true";
  console.log(`Database Enabled: ${USE_DB ? "YES" : "NO"}`);

  if (!USE_DB) {
    console.log("Set USE_DB=true in .env to enable database connections");
    return;
  }

  console.log(`Operations DB: ${process.env.DB_NAME || "vrindavan_ops"} @ ${process.env.DB_HOST || "127.0.0.1"}`);
  console.log(`Analytics DB: ${process.env.APP_DB_NAME || "vrindavan_app_prod"} @ ${process.env.APP_DB_HOST || "127.0.0.1"}`);

  // Start reminder scheduler
  try {
    reminderScheduler.start();
    console.log("Reminder scheduler started");
  } catch (error) {
    console.error("Failed to start reminder scheduler:", error);
  }
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 121000;
server.requestTimeout = 120000;
