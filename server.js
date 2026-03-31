const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔌 Подключение к Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 🏗 Создание таблицы
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      username TEXT UNIQUE,
      password TEXT,
      is_verified INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 1000,
      verification_code TEXT
    )
  `);
  console.log("DB OK");
}

initDB();

// 🎲 генерация кода
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 📩 РЕГИСТРАЦИЯ
app.post("/api/register", async (req, res) => {
  const { email, username, password } = req.body;
  const code = generateCode();
  try {
    await pool.query(
      "INSERT INTO users (email, username, password, verification_code) VALUES ($1, $2, $3, $4)",
      [email, username, password, code]
    );
    res.json({ success: true, code });
  } catch (e) {
    if (e.code === "23505") return res.json({ error: "Пользователь уже существует" });
    console.error(e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 🔐 ЛОГИН
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );
    if (result.rows.length === 0) return res.json({ error: "Неверные данные" });
    const user = result.rows[0];
    if (!user.is_verified) return res.json({ error: "Подтверди почту" });
    res.json({ success: true, user: { username: user.username, balance: user.balance } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ✅ ПОДТВЕРЖДЕНИЕ ПОЧТЫ
app.post("/api/verify", async (req, res) => {
  const { username, code } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    if (!user) return res.json({ error: "Юзер не найден" });
    if (user.verification_code !== code) return res.json({ error: "Неверный код" });
    await pool.query("UPDATE users SET is_verified = 1 WHERE username = $1", [username]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// 🔄 ПОВТОРНАЯ ОТПРАВКА КОДА
app.post("/api/resend-code", async (req, res) => {
  const { username } = req.body;
  const newCode = generateCode();
  try {
    await pool.query("UPDATE users SET verification_code = $1 WHERE username = $2", [newCode, username]);
    res.json({ success: true, code: newCode });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка" });
  }
});

// 💰 ИЗМЕНЕНИЕ БАЛАНСА
app.post("/api/set-balance", async (req, res) => {
  const { username, amount } = req.body;
  try {
    await pool.query("UPDATE users SET balance = balance + $1 WHERE username = $2", [amount, username]);
    const result = await pool.query("SELECT balance FROM users WHERE username = $1", [username]);
    res.json({ success: true, balance: result.rows[0].balance });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка" });
  }
});

const path = require('path');

// 🧪 DEBUG
app.get("/api/users", async (req, res) => {
  const result = await pool.query("SELECT * FROM users");
  res.json(result.rows);
});

// статика и корень
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚀 запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started on " + PORT));