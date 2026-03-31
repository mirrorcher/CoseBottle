const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

// 👀 Простая база в памяти
let users = [];
let sessions = {};

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Вспомогательные функции
function findUserByEmail(email) {
  return users.find(u => u.email === email);
}

function formatUser(user) {
  return {
    email: user.email,
    username: user.username,
    balance: user.balance,
    is_verified: user.is_verified
  };
}

// ---------------- API ----------------

// Регистрация
app.post("/api/register", (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) return res.json({ success: false, message: "Заполни все поля" });

  if (findUserByEmail(email)) return res.json({ success: false, message: "Пользователь уже существует" });

  const user = { email, username, password, balance: 0, is_verified: 0 };
  users.push(user);
  sessions[email] = true; // автоматически логиним
  res.json({ success: true, message: "Аккаунт создан", user: formatUser(user) });
});

// Вход
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user || user.password !== password) return res.json({ success: false, message: "Неверный логин или пароль" });

  sessions[email] = true;
  res.json({ success: true, user: formatUser(user) });
});

// Проверка текущего пользователя
app.get("/api/me", (req, res) => {
  const email = Object.keys(sessions)[0]; // для простоты берем первый активный
  if (!email || !sessions[email]) return res.json({ loggedIn: false });
  const user = findUserByEmail(email);
  res.json({ loggedIn: true, user: formatUser(user) });
});

// Выход
app.post("/api/logout", (req, res) => {
  const email = Object.keys(sessions)[0];
  if (email) delete sessions[email];
  res.json({ success: true });
});

// Обновление баланса
app.post("/api/set-balance", (req, res) => {
  const { balance } = req.body;
  const email = Object.keys(sessions)[0];
  if (!email) return res.json({ success: false, message: "Не авторизован" });
  const user = findUserByEmail(email);
  user.balance = balance;
  res.json({ success: true, user: formatUser(user) });
});

// Верификация (для примера просто ставим флаг)
app.post("/api/verify", (req, res) => {
  const { email } = req.body;
  const user = findUserByEmail(email);
  if (!user) return res.json({ success: false, message: "Пользователь не найден" });
  user.is_verified = 1;
  res.json({ success: true, message: "Аккаунт верифицирован" });
});

// Переслать код (фейк)
app.post("/api/resend-code", (req, res) => {
  res.json({ success: true, message: "Код отправлен повторно" });
});

// ---------------- Запуск ----------------
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});