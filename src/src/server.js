require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const pool = require("./db");

const authRoutes = require("./routes/auth");
const chunksRoutes = require("./routes/chunks");
const portalRoutes = require("./routes/portal");

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(cors({
  origin: process.env.CORS_ORIGIN === "*" ? true : (process.env.CORS_ORIGIN || "").split(","),
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register-company", authLimiter);

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/chunks", chunksRoutes);
app.use("/api/portal", portalRoutes);

app.use((req, res) => res.status(404).json({ error: "مسار غير موجود" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "خطأ غير متوقع في السيرفر" });
});

const port = process.env.PORT || 3000;

async function migrateThenListen() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await pool.query(sql);
    console.log("✔ تم التأكد من وجود جداول قاعدة البيانات");
  } catch (e) {
    console.error("❌ فشل إعداد قاعدة البيانات:", e.message);
  }
  app.listen(port, () => console.log("🚀 ferdaws-backend يعمل على البورت " + port));
}
migrateThenListen();
