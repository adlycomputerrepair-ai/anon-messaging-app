
/*! Simple Express backend using SQLite.
  Endpoints:
    POST /signup       { phone, password, invite_code }
    POST /login        { phone, password }
    GET  /users        (auth) list other users (id, maskedPhone)
    GET  /me           (auth) get current user info
    POST /messages     (auth) { to_user, body, anonymous }
    GET  /messages/:userId (auth) get messages for user (must match token user id)
*/

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const INVITE_CODE = process.env.INVITE_CODE || 'friends-only-2025';

// DB file
const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

function runAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
  });
}
function allAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}
function getAsync(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}

// initialize tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user INTEGER,
    to_user INTEGER NOT NULL,
    anonymous INTEGER DEFAULT 0,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(from_user) REFERENCES users(id),
    FOREIGN KEY(to_user) REFERENCES users(id)
  )`);
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing authorization header' });
  const token = auth.replace(/^Bearer /, '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/signup', async (req, res) => {
  try {
    const { phone, password, invite_code } = req.body;
    if (!phone || !password || !invite_code) return res.status(400).json({ error: 'phone, password and invite_code required' });
    if (invite_code !== INVITE_CODE) return res.status(403).json({ error: 'invalid invite code' });
    const existing = await getAsync('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existing) return res.status(409).json({ error: 'phone already registered' });
    const hash = await bcrypt.hash(password, 10);
    const info = await runAsync('INSERT INTO users (phone, password_hash) VALUES (?, ?)', [phone, hash]);
    const userId = info.lastID;
    const user = { id: userId, phone };
    const token = jwt.sign(user, JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });
    const row = await getAsync('SELECT id, phone, password_hash FROM users WHERE phone = ?', [phone]);
    if (!row) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const user = { id: row.id, phone: row.phone };
    const token = jwt.sign(user, JWT_SECRET);
    res.json({ token, user });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/users', authMiddleware, async (req, res) => {
  const rows = await allAsync('SELECT id, phone FROM users WHERE id != ? ORDER BY id DESC', [req.user.id]);
  // mask phone for UI convenience
  const out = rows.map(r => ({ id: r.id, phone: r.phone, masked: (r.phone.length>5? r.phone.slice(0,3)+'...'+r.phone.slice(-2) : r.phone) }));
  res.json(out);
});

app.get('/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, phone: req.user.phone });
});

app.post('/messages', authMiddleware, async (req, res) => {
  try {
    const { to_user, body, anonymous } = req.body;
    if (!to_user || !body) return res.status(400).json({ error: 'to_user and body required' });
    const info = await runAsync('INSERT INTO messages (from_user, to_user, anonymous, body) VALUES (?, ?, ?, ?)', [req.user.id, to_user, anonymous?1:0, body]);
    res.json({ id: info.lastID });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/messages/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (req.user.id !== userId) return res.status(403).json({ error: 'forbidden' });
    const rows = await allAsync('SELECT id, from_user, anonymous, body, created_at FROM messages WHERE to_user = ? ORDER BY created_at DESC', [userId]);
    const out = rows.map(r => ({ id: r.id, from: r.anonymous? null : r.from_user, anonymous: !!r.anonymous, body: r.body, created_at: r.created_at }));
    res.json(out);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
