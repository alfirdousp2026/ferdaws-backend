const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌ متغيّر DATABASE_URL غير موجود. راجع ملف .env.example");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

module.exports = pool;
