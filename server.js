const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = 3000;

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "secret123",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// статические файлы (твой сайт)
app.use(express.static(path.join(__dirname, "public")));

// база данных
const db = new sqlite3.Database("./database.db");

// генерация кода
function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// главная страница
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ==========================
// РЕГИСТРАЦИЯ
// ==========================
app.post("/api/register", async (req, res) => {
  console.log("REGISTER BODY:", req.body);
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.json({
      success: false,
      message: "Заполните все поля."
    });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const code = genCode();

    db.run(
      `INSERT INTO users (email, username, password_hash, verification_code)
       VALUES (?, ?, ?, ?)`,
      [email, username, hash, code],
      function(err) {
        if (err) {
          console.log("ОШИБКА SQLITE:", err.message);
          return res.json({
            success: false,
            message: "Ошибка: " + err.message
          });
        }

        req.session.userId = this.lastID;

        res.json({
          success: true,
          message: "Вы не подтвердили почту. Вам выдано 1000 монет и включён демо-режим. Вам доступны только режимы «Апгрейдер» и «Краш». Чтобы открыть все режимы, подтвердите почту.",
          code: code
        });
      }
    );
  } catch (e) {
    res.json({
      success: false,
      message: "Ошибка сервера."
    });
  }
});


// ==========================
// ПОДТВЕРЖДЕНИЕ ПОЧТЫ
// ==========================
app.post("/api/verify", (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.json({
      success: false,
      message: "Введите почту и код."
    });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err || !user) {
      return res.json({
        success: false,
        message: "Пользователь не найден."
      });
    }

    if (user.verification_code !== code) {
      return res.json({
        success: false,
        message: "Неверный код."
      });
    }

    db.run(
      `UPDATE users SET is_verified = 1, verification_code = NULL WHERE email = ?`,
      [email],
      (updateErr) => {
        if (updateErr) {
          return res.json({
            success: false,
            message: "Ошибка подтверждения."
          });
        }

        res.json({
          success: true,
          message: "Почта подтверждена 🎉"
        });
      }
    );
  });
});


// ==========================
// ЛОГИН
// ==========================
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({
      success: false,
      message: "Введите почту и пароль."
    });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) {
      return res.json({
        success: false,
        message: "Аккаунт не найден."
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.json({
        success: false,
        message: "Неверный пароль."
      });
    }

    req.session.userId = user.id;

    res.json({
      success: true,
      message: "Вход выполнен успешно.",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        balance: user.balance,
        is_verified: user.is_verified
      }
    });
  });
});


app.post("/api/resend-code", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      success: false,
      message: "Вы не вошли в аккаунт."
    });
  }

  const newCode = Math.floor(100000 + Math.random() * 900000).toString();

  db.run(
    `UPDATE users SET verification_code = ? WHERE id = ?`,
    [newCode, req.session.userId],
    function(err) {
      if (err) {
        return res.json({
          success: false,
          message: "Не удалось обновить код."
        });
      }

      res.json({
        success: true,
        message: `Новый код отправлен. Тестовый код: ${newCode}`,
        code: newCode
      });
    }
  );
});


// ==========================
// ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
// ==========================
app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      loggedIn: false
    });
  }

  db.get(
    `SELECT id, email, username, balance, is_verified FROM users WHERE id = ?`,
    [req.session.userId],
    (err, user) => {
      if (err || !user) {
        return res.json({
          loggedIn: false
        });
      }

      res.json({
        loggedIn: true,
        user
      });
    }
  );
});

app.get("/api/debug-users", (req, res) => {
  db.all(
    `SELECT id, email, username, is_verified, balance FROM users`,
    [],
    (err, rows) => {
      if (err) {
        return res.json({
          success: false,
          message: err.message
        });
      }

      res.json({
        success: true,
        users: rows
      });
    }
  );
});



app.post("/api/set-balance", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      success: false,
      message: "Вы не вошли в аккаунт."
    });
  }

  const balance = Math.max(0, Math.floor(Number(req.body.balance) || 0));

  db.run(
    `UPDATE users SET balance = ? WHERE id = ?`,
    [balance, req.session.userId],
    function(err) {
      if (err) {
        return res.json({
          success: false,
          message: "Не удалось сохранить баланс."
        });
      }

      db.get(
        `SELECT id, email, username, balance, is_verified FROM users WHERE id = ?`,
        [req.session.userId],
        (err2, user) => {
          if (err2 || !user) {
            return res.json({
              success: false,
              message: "Пользователь не найден."
            });
          }

          res.json({
            success: true,
            user
          });
        }
      );
    }
  );
});



// ==========================
// ВЫХОД
// ==========================
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true,
      message: "Вы вышли из аккаунта."
    });
  });
});


// ==========================
// ЗАПУСК СЕРВЕРА
// ==========================
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});