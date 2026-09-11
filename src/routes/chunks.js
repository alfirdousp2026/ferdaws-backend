const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const CHUNK_KEYS = ["core", "transactions", "entries", "operations", "activityLog", "trash"];

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT chunk_key, fields, rev FROM chunks WHERE company_id = $1",
      [req.companyId]
    );
    const out = {};
    CHUNK_KEYS.forEach((k) => { out[k] = { fields: {}, rev: 0 }; });
    result.rows.forEach((r) => { out[r.chunk_key] = { fields: r.fields, rev: r.rev }; });
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "تعذّر جلب البيانات" });
  }
});

router.put("/:key", async (req, res) => {
  const key = req.params.key;
  if (CHUNK_KEYS.indexOf(key) === -1) return res.status(400).json({ error: "جزء غير معروف" });
  const { fields, baseRev, force, deviceId } = req.body || {};
  if (typeof fields !== "object" || fields === null) {
    return res.status(400).json({ error: "بيانات غير صالحة" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT rev, fields FROM chunks WHERE company_id = $1 AND chunk_key = $2 FOR UPDATE",
      [req.companyId, key]
    );
    const serverRev = current.rows.length ? current.rows[0].rev : 0;
    if (!force && serverRev !== (baseRev || 0)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "تعارض: تم تعديل هذا الجزء من جهاز آخر في نفس الوقت تقريبًا",
        serverRev,
        serverFields: current.rows.length ? current.rows[0].fields : {},
      });
    }
    const newRev = serverRev + 1;
    await client.query(
      `INSERT INTO chunks (company_id, chunk_key, fields, rev, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (company_id, chunk_key)
       DO UPDATE SET fields = $3, rev = $4, updated_by = $5, updated_at = now()`,
      [req.companyId, key, fields, newRev, deviceId || ""]
    );
    await client.query("COMMIT");
    res.json({ ok: true, rev: newRev });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "تعذّر حفظ البيانات" });
  } finally {
    client.release();
  }
});

router.post("/push", async (req, res) => {
  const { chunks, baseRevs, force, deviceId } = req.body || {};
  if (typeof chunks !== "object" || chunks === null) {
    return res.status(400).json({ error: "بيانات غير صالحة" });
  }
  const keys = Object.keys(chunks).filter((k) => CHUNK_KEYS.indexOf(k) !== -1);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT chunk_key, rev, fields FROM chunks WHERE company_id = $1 AND chunk_key = ANY($2) FOR UPDATE",
      [req.companyId, keys]
    );
    const serverRevs = {}; const serverFields = {};
    current.rows.forEach((r) => { serverRevs[r.chunk_key] = r.rev; serverFields[r.chunk_key] = r.fields; });
    if (!force) {
      const conflicts = keys.filter((k) => (serverRevs[k] || 0) !== ((baseRevs && baseRevs[k]) || 0));
      if (conflicts.length) {
        await client.query("ROLLBACK");
        const out = {};
        conflicts.forEach((k) => { out[k] = { rev: serverRevs[k] || 0, fields: serverFields[k] || {} }; });
        return res.status(409).json({ error: "تعارض: تم تعديل بعض البيانات من جهاز آخر في نفس الوقت تقريبًا", conflicts: out });
      }
    }
    const newRevs = {};
    for (const key of keys) {
      const newRev = (serverRevs[key] || 0) + 1;
      newRevs[key] = newRev;
      await client.query(
        `INSERT INTO chunks (company_id, chunk_key, fields, rev, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (company_id, chunk_key)
         DO UPDATE SET fields = $3, rev = $4, updated_by = $5, updated_at = now()`,
        [req.companyId, key, chunks[key], newRev, deviceId || ""]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, revs: newRevs });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "تعذّر حفظ البيانات" });
  } finally {
    client.release();
  }
});

module.exports = router;
