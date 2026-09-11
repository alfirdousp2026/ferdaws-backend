const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/:token", async (req, res) => {
  try {
    const result = await pool.query("SELECT data FROM portals WHERE token = $1", [req.params.token]);
    if (result.rows.length === 0) return res.status(404).json({ error: "الرابط غير موجود أو تم حذفه" });
    res.json(result.rows[0].data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر تحميل كشف الحساب" });
  }
});

router.post("/:token", requireAuth, async (req, res) => {
  const data = req.body || {};
  try {
    const existing = await pool.query("SELECT company_id FROM portals WHERE token = $1", [req.params.token]);
    if (existing.rows.length && existing.rows[0].company_id !== req.companyId) {
      return res.status(403).json({ error: "هذا الرابط تابع لشركة أخرى" });
    }
    await pool.query(
      `INSERT INTO portals (token, company_id, data, updated_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (token) DO UPDATE SET data = $3, updated_at = now()`,
      [req.params.token, req.companyId, data]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر نشر كشف الحساب" });
  }
});

module.exports = router;
