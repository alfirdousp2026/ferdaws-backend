
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  try {
    await pool.query(sql);
    console.log("✔ تم إنشاء/تحديث جداول قاعدة البيانات بنجاح");
  } catch (e) {
    console.error("❌ فشل تنفيذ الترحيل:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
