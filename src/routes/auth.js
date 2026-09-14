const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { userId: user.id, companyId: user.company_id, email: user.email, tokenVersion: user.token_version || 1 },
    process.env.JWT_SECRET,
    { expiresIn: "90d" }
  );
}

router.post("/register-company", async (req, res) => {
  const { companyName, email, password, displayName } = req.body || {};
  if (!companyName || !email || !password) {
    return res.status(400).json({ error: "الرجاء إدخال اسم الشركة والبريد الإلكتروني وكلمة المرور" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const companyResult = await client.query(
      "INSERT INTO companies (name) VALUES ($1) RETURNING id, name",
      [companyName]
    );
    const company = companyResult.rows[0];
    const passwordHash = await bcrypt.hash(password, 10);
    let userResult;
    try {
      userResult = await client.query(
        "INSERT INTO sync_users (company_id, email, password_hash, display_name) VALUES ($1,$2,$3,$4) RETURNING id, company_id, email, display_name, token_version",
        [company.id, String(email).trim().toLowerCase(), passwordHash, displayName || ""]
      );
    } catch (e) {
      if (e.code === "23505") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "هذا البريد الإلكتروني مُسجَّل بالفعل — استخدم صفحة تسجيل الدخول" });
      }
      throw e;
    }
    await client.query("COMMIT");
    const user = userResult.rows[0];
    const token = signToken(user);
    res.json({ token, companyId: company.id, companyName: company.name, displayName: user.display_name, email: user.email });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "تعذّر إنشاء الشركة، حاول مرة أخرى" });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "أدخل البريد الإلكتروني وكلمة المرور" });
  try {
    const result = await pool.query(
      "SELECT su.*, c.name AS company_name FROM sync_users su JOIN companies c ON c.id = su.company_id WHERE su.email = $1",
      [String(email).trim().toLowerCase()]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    const token = signToken(user);
    res.json({ token, companyId: user.company_id, companyName: user.company_name, displayName: user.display_name, email: user.email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر تسجيل الدخول، حاول مرة أخرى" });
  }
});

router.post("/invite", requireAuth, async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "أدخل البريد الإلكتروني وكلمة المرور للمستخدم الجديد" });
  if (String(password).length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO sync_users (company_id, email, password_hash, display_name) VALUES ($1,$2,$3,$4) RETURNING id, email, display_name",
      [req.companyId, String(email).trim().toLowerCase(), passwordHash, displayName || ""]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "هذا البريد مُسجَّل بالفعل" });
    console.error(e);
    res.status(500).json({ error: "تعذّر إضافة المستخدم" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT su.email, su.display_name, c.name AS company_name FROM sync_users su JOIN companies c ON c.id = su.company_id WHERE su.id = $1",
    [req.userId]
  );
  if (result.rows.length === 0) return res.status(401).json({ error: "المستخدم غير موجود" });
  res.json({ companyId: req.companyId, ...result.rows[0] });
});

router.post("/logout-everywhere", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE sync_users SET token_version = token_version + 1 WHERE id = $1", [req.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر قطع الاتصال عن باقي الأجهزة" });
  }
});

module.exports = router;
