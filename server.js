const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();
const { Pool } = require('pg');

const port = Number(process.env.PORT) || 3000;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const markets = [
  { symbol: 'BTC', name: 'Bitcoin', price: 64280, change24h: 2.4 },
  { symbol: 'ETH', name: 'Ethereum', price: 3420, change24h: 1.8 },
  { symbol: 'SOL', name: 'Solana', price: 162.8, change24h: 4.3 },
  { symbol: 'LINK', name: 'Chainlink', price: 18.14, change24h: -0.6 }
];

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) reject(new Error('Request body is too large'));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Request body must be valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function passwordMatches(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { status: 'ok', service: 'vancrypto-api' });
  }

  if (request.method === 'GET' && url.pathname === '/api/markets') {
    return sendJson(response, 200, { data: markets, updatedAt: new Date().toISOString() });
  }

  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });

  if (url.pathname === '/api/auth/register') {
    const body = await readJson(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !email.includes('@') || password.length < 8) {
      return sendJson(response, 400, { error: 'A valid email and password of at least 8 characters are required' });
    }
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rowCount) return sendJson(response, 409, { error: 'An account with that email already exists' });

    const user = { id: crypto.randomUUID(), email, passwordHash: hashPassword(password) };
    await pool.query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
      [user.id, user.email, user.passwordHash]
    );
    return sendJson(response, 201, { user: publicUser(user) });
  }

  if (url.pathname === '/api/auth/login') {
    const body = await readJson(request);
    const email = String(body.email || '').trim().toLowerCase();
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !passwordMatches(String(body.password || ''), user.password_hash)) {
      return sendJson(response, 401, { error: 'Invalid email or password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, user.id]);
    return sendJson(response, 200, { token, user: publicUser(user) });
  }

  return sendJson(response, 404, { error: 'API route not found' });
}

function serveStatic(response, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(__dirname, `.${requestedPath}`);
  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }

  const contentType = filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/jpeg';
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    return response.end();
  }

  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    serveStatic(response, url);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
});

initializeDatabase()
  .then(() => {
    server.listen(port, () => {
      console.log(`Vancrypto API listening at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error.message);
    process.exitCode = 1;
  });