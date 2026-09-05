import express from "express";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "256kb" }));

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS page_content (
      page_slug VARCHAR(64) NOT NULL,
      field_key VARCHAR(191) NOT NULL,
      value MEDIUMTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (page_slug, field_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS edit_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      page_slug VARCHAR(64) NOT NULL,
      field_key VARCHAR(191) NOT NULL,
      old_value MEDIUMTEXT,
      new_value MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD || "";
  if (typeof password !== "string" || !expected || !timingSafeEqualStr(password, expected)) {
    return res.status(401).json({ error: "invalid_password" });
  }
  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "12h" });
  res.json({ token, expiresIn: 12 * 3600 });
});

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "admin") throw new Error("bad_role");
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

app.get("/api/session", requireAdmin, (req, res) => res.json({ ok: true }));

app.get("/api/content", async (req, res) => {
  const page = String(req.query.page || "");
  if (!page) return res.status(400).json({ error: "missing_page" });
  try {
    const [rows] = await pool.query(
      "SELECT field_key, value FROM page_content WHERE page_slug = ?",
      [page]
    );
    const out = {};
    for (const r of rows) out[r.field_key] = r.value;
    res.json(out);
  } catch (err) {
    console.error("GET /api/content failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.put("/api/content", requireAdmin, async (req, res) => {
  const { page, key, value } = req.body || {};
  if (
    typeof page !== "string" || !page ||
    typeof key !== "string" || !key ||
    typeof value !== "string"
  ) {
    return res.status(400).json({ error: "invalid_body" });
  }
  if (value.length > 20000) return res.status(400).json({ error: "too_large" });
  try {
    const [existingRows] = await pool.query(
      "SELECT value FROM page_content WHERE page_slug = ? AND field_key = ?",
      [page, key]
    );
    const oldValue = existingRows[0]?.value ?? null;
    await pool.query(
      `INSERT INTO page_content (page_slug, field_key, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [page, key, value]
    );
    await pool.query(
      `INSERT INTO edit_log (page_slug, field_key, old_value, new_value) VALUES (?, ?, ?, ?)`,
      [page, key, oldValue, value]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/content failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
ensureSchema()
  .then(() => {
    app.listen(port, () => console.log("content-api listening on", port));
  })
  .catch((err) => {
    console.error("schema init failed", err);
    process.exit(1);
  });
