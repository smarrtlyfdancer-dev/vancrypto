const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function clearTestData() {
  const result = await pool.query(`
    DELETE FROM users
    WHERE email LIKE 'copilot-%@example.com'
    RETURNING email
  `);
  console.log(`Removed ${result.rowCount} temporary test account(s).`);
}

clearTestData()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());