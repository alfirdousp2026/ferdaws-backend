const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.post("/heartbeat", async (req, res) => {
  const { deviceId, name } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: "معرّف الجهاز مفقود" });
  try {
    await pool.query(
      `INSERT INTO devices (company_id, device_id, name, last_seen)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (company_id, device_id)
       DO UPDATE SET name = COALESCE(NULLIF($3, ''), devices.name), last_seen = now()`,
      [req.companyId, deviceId, name || ""]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر تسجيل حالة الجهاز" });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT device_id, name, last_seen FROM devices WHERE company_id = $1 ORDER BY last_seen DESC",
      [req.companyId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر جلب قائمة الأجهزة" });
  }
});

router.delete("/:deviceId", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM devices WHERE company_id = $1 AND device_id = $2",
      [req.companyId, req.params.deviceId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر حذف الجهاز" });
  }
});

module.exports = router;
