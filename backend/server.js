const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = 5000;
const SECRET_KEY = 'foto-salon-secret-key-2025';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const db = new sqlite3.Database('./database.sqlite');


db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'client',
    fullName TEXT,
    phone TEXT,
    email TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price REAL,
    duration INTEGER,
    category TEXT,
    image TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    serviceId INTEGER,
    status TEXT DEFAULT 'pending',
    orderDate TEXT,
    completionDate TEXT,
    totalPrice REAL,
    notes TEXT,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (serviceId) REFERENCES services(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    imageUrl TEXT,
    category TEXT,
    createdAt TEXT
  )`);

  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, password, role, fullName) 
          VALUES (1, 'admin', ?, 'admin', 'Администратор')`, [adminPassword]);
  
  const clientPassword = bcrypt.hashSync('client123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, password, role, fullName) 
          VALUES (2, 'client', ?, 'client', 'Клиент')`, [clientPassword]);

  db.run(`INSERT OR IGNORE INTO services (id, name, description, price, duration, category) VALUES
    (1, 'Студийная фотосессия', 'Профессиональная фотосессия в нашей студии с профессиональным фотографом', 5000, 60, 'Фотосессия'),
    (2, 'Обработка фото', 'Профессиональная ретушь и цветокоррекция до 20 фотографий', 2000, 120, 'Обработка'),
    (3, 'Свадебная съемка', 'Полное свадебное сопровождение, 8 часов съемки', 25000, 480, 'События'),
    (4, 'Печать фотографий', 'Печать фотографий формата 10x15 на профессиональной бумаге', 500, 30, 'Печать'),
    (5, 'Фотокнига', 'Создание фотокниги на 20 разворотов', 3500, 180, 'Печать'),
    (6, 'Портфолио модель', 'Создание портфолио для моделей и актеров', 8000, 120, 'Фотосессия')
  `);
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Недействительный токен' });
    req.user = user;
    next();
  });
};

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });


app.post('/api/register', (req, res) => {
  const { username, password, fullName, phone, email } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.run(`INSERT INTO users (username, password, fullName, phone, email, role)
          VALUES (?, ?, ?, ?, ?, 'client')`,
    [username, hashedPassword, fullName, phone, email],
    function(err) {
      if (err) {
        res.status(400).json({ error: 'Пользователь уже существует' });
      } else {
        res.json({ id: this.lastID, message: 'Регистрация успешна' });
      }
    });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }
    
    if (bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName } });
    } else {
      res.status(400).json({ error: 'Неверный пароль' });
    }
  });
});

app.get('/api/services', (req, res) => {
  db.all(`SELECT * FROM services`, (err, services) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(services);
    }
  });
});

app.post('/api/orders', authenticateToken, (req, res) => {
  const { serviceId, notes } = req.body;
  const orderDate = new Date().toISOString();
  
  db.get(`SELECT price FROM services WHERE id = ?`, [serviceId], (err, service) => {
    if (err || !service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }
    
    db.run(`INSERT INTO orders (userId, serviceId, orderDate, totalPrice, notes, status)
            VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, serviceId, orderDate, service.price, notes],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({ id: this.lastID, message: 'Заказ создан' });
        }
      });
  });
});

app.get('/api/orders', authenticateToken, (req, res) => {
  let query = `
    SELECT o.*, s.name as serviceName, s.duration 
    FROM orders o
    JOIN services s ON o.serviceId = s.id
  `;
  
  if (req.user.role !== 'admin') {
    query += ` WHERE o.userId = ${req.user.id}`;
  }
  
  db.all(query, (err, orders) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(orders);
    }
  });
});

app.put('/api/orders/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  
  const { status } = req.body;
  db.run(`UPDATE orders SET status = ?, completionDate = ? WHERE id = ?`,
    [status, status === 'completed' ? new Date().toISOString() : null, req.params.id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: 'Статус обновлен' });
      }
    });
});

app.get('/api/portfolio', (req, res) => {
  db.all(`SELECT * FROM portfolio`, (err, portfolio) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(portfolio);
    }
  });
});

app.post('/api/portfolio', authenticateToken, upload.single('image'), (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  
  const { title, description, category } = req.body;
  const imageUrl = `/uploads/${req.file.filename}`;
  const createdAt = new Date().toISOString();
  
  db.run(`INSERT INTO portfolio (title, description, imageUrl, category, createdAt)
          VALUES (?, ?, ?, ?, ?)`,
    [title, description, imageUrl, category, createdAt],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ id: this.lastID, imageUrl });
      }
    });
});

app.get('/api/admin/stats', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  
  db.get(`SELECT COUNT(*) as totalOrders FROM orders`, (err, orders) => {
    db.get(`SELECT COUNT(*) as totalUsers FROM users WHERE role = 'client'`, (err, users) => {
      db.get(`SELECT SUM(totalPrice) as totalRevenue FROM orders WHERE status = 'completed'`, (err, revenue) => {
        res.json({
          totalOrders: orders?.totalOrders || 0,
          totalUsers: users?.totalUsers || 0,
          totalRevenue: revenue?.totalRevenue || 0
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});