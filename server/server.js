import express from "express";
import mysql from "mysql2/promise";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitor_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_codes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(191) NOT NULL,
      code VARCHAR(8) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      page_slug VARCHAR(64) NOT NULL,
      element_key VARCHAR(191) NOT NULL,
      author_name VARCHAR(120) NOT NULL,
      user_id INT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (page_slug, element_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// Same mechanism as coursebook-platform/server/email-service.ts: Gmail SMTP
// via nodemailer, GMAIL_EMAIL + GMAIL_APP_PASSWORD env vars. If unset, log
// the code instead of failing — lets the rest of the flow be tested before
// the credential exists.
const mailer =
  process.env.GMAIL_EMAIL && process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
      })
    : null;

async function sendLoginCode(email, code) {
  if (!mailer) {
    console.log(`[EMAIL] (no GMAIL_APP_PASSWORD set) login code for ${email}: ${code}`);
    return;
  }
  await mailer.sendMail({
    from: process.env.GMAIL_EMAIL,
    to: email,
    subject: `Tu código de acceso: ${code}`,
    html: `<p>Tu código de acceso es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>Vence en 15 minutos.</p>`,
  });
}

function randomCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
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

// ── Visitor auth: email + one-time code, no password ────────────────────

function requireVisitorOptional(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  req.visitor = null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.role === "visitor") req.visitor = payload;
    } catch {
      // treat as anonymous rather than failing the request
    }
  }
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/auth/request-code", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "invalid_email" });
  const code = randomCode();
  try {
    await pool.query(
      `INSERT INTO login_codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
      [email, code]
    );
    await sendLoginCode(email, code);
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/request-code failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/auth/verify-code", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  const name = String(req.body?.name || "").trim().slice(0, 120);
  if (!EMAIL_RE.test(email) || !code) return res.status(400).json({ error: "invalid_body" });
  try {
    const [rows] = await pool.query(
      `SELECT id FROM login_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [email, code]
    );
    if (!rows[0]) return res.status(401).json({ error: "invalid_or_expired_code" });
    await pool.query(`UPDATE login_codes SET used = 1 WHERE id = ?`, [rows[0].id]);

    const [existing] = await pool.query(`SELECT id, name FROM visitor_users WHERE email = ?`, [email]);
    let userId, userName;
    if (existing[0]) {
      userId = existing[0].id;
      userName = existing[0].name;
    } else {
      const finalName = name || email.split("@")[0];
      const [ins] = await pool.query(
        `INSERT INTO visitor_users (email, name) VALUES (?, ?)`,
        [email, finalName]
      );
      userId = ins.insertId;
      userName = finalName;
    }
    const token = jwt.sign(
      { role: "visitor", userId, email, name: userName },
      process.env.JWT_SECRET,
      { expiresIn: "180d" }
    );
    res.json({ token, name: userName, email });
  } catch (err) {
    console.error("POST /api/auth/verify-code failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

// ── Comments ──────────────────────────────────────────────────────────────

app.get("/api/comments", async (req, res) => {
  const page = String(req.query.page || "");
  if (!page) return res.status(400).json({ error: "missing_page" });
  try {
    const [rows] = await pool.query(
      `SELECT id, element_key AS elementKey, author_name AS authorName, body, created_at AS createdAt
       FROM comments WHERE page_slug = ? ORDER BY created_at ASC`,
      [page]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/comments failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/comments", requireVisitorOptional, async (req, res) => {
  const page = String(req.body?.page || "");
  const elementKey = String(req.body?.elementKey || "");
  const body = String(req.body?.body || "").trim();
  const authorNameInput = String(req.body?.authorName || "").trim().slice(0, 120);
  if (!page || !elementKey || !body) return res.status(400).json({ error: "invalid_body" });
  if (body.length > 4000) return res.status(400).json({ error: "too_large" });
  const authorName = req.visitor ? req.visitor.name : authorNameInput;
  const userId = req.visitor ? req.visitor.userId : null;
  if (!authorName) return res.status(400).json({ error: "missing_name" });
  try {
    const [ins] = await pool.query(
      `INSERT INTO comments (page_slug, element_key, author_name, user_id, body) VALUES (?, ?, ?, ?, ?)`,
      [page, elementKey, authorName, userId, body]
    );
    res.status(201).json({
      id: ins.insertId, elementKey, authorName, body, createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("POST /api/comments failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.delete("/api/comments/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM comments WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/comments failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

// Serve the client script from one canonical URL (no per-site copy needed).
app.get("/comments.js", async (req, res) => {
  try {
    const js = await readFile(path.join(__dirname, "comments-client.js"), "utf8");
    res.type("application/javascript").set("Cache-Control", "public, max-age=300").send(js);
  } catch (err) {
    console.error("GET /comments.js failed", err);
    res.status(500).send("// failed to load comments.js");
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
