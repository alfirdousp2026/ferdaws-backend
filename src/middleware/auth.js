const jwt = require("jsonwebtoken");
const pool = require("../db");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "مطلوب تسجيل الدخول" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query("SELECT token_version FROM sync_users WHERE id = $1", [payload.userId]);
    if (result.rows.length === 0) return res.status(401).json({ error: "المستخدم غير موجود" });
    const currentVersion = result.rows[0].token_version || 1;
    if ((payload.tokenVersion || 1) !== currentVersion) {
      return res.status(401).json({ error: "تم إنهاء هذه الجلسة من جهاز آخر — سجّل الدخول مرة أخرى" });
    }
    req.companyId = payload.companyId;
    req.userId = payload.userId;
    req.email = payload.email;
    next();
  } catch (e) {
    return res.status(401).json({ error: "انتهت صلاحية الجلسة أو الرمز غير صحيح، سجّل الدخول مرة أخرى" });
  }
}

module.exports = { requireAuth };
