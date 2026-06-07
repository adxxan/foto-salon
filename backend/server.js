const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = 'foto-salon-secret-key-2025';

app.use(cookieParser());
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Слишком много запросов, попробуйте позже' }
});
app.use('/api/', limiter);

const db = new Database('./database.sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'client',
    fullName TEXT,
    phone TEXT,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price REAL,
    duration INTEGER,
    category TEXT,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    serviceId INTEGER,
    status TEXT DEFAULT 'pending',
    orderDate TEXT,
    bookingDate TEXT,
    completionDate TEXT,
    totalPrice REAL,
    notes TEXT,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (serviceId) REFERENCES services(id)
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    imageUrl TEXT,
    category TEXT,
    createdAt TEXT
  );
`);

const adminPassword = bcrypt.hashSync('admin123', 10);
const clientPassword = bcrypt.hashSync('client123', 10);

db.prepare(`INSERT OR IGNORE INTO users (id, username, password, role, fullName) VALUES (1, 'admin', ?, 'admin', 'Администратор')`).run(adminPassword);
db.prepare(`INSERT OR IGNORE INTO users (id, username, password, role, fullName) VALUES (2, 'client', ?, 'client', 'Клиент')`).run(clientPassword);

db.prepare(`INSERT OR IGNORE INTO services (id, name, description, price, duration, category) VALUES
  (1, 'Студийная фотосессия', 'Профессиональная фотосессия в нашей студии с профессиональным фотографом', 5000, 60, 'Фотосессия'),
  (2, 'Обработка фото', 'Профессиональная ретушь и цветокоррекция до 20 фотографий', 2000, 120, 'Обработка'),
  (3, 'Свадебная съемка', 'Полное свадебное сопровождение, 8 часов съемки', 25000, 480, 'События'),
  (4, 'Печать фотографий', 'Печать фотографий формата 10x15 на профессиональной бумаге', 500, 30, 'Печать'),
  (5, 'Фотокнига', 'Создание фотокниги на 20 разворотов', 3500, 180, 'Печать'),
  (6, 'Портфолио модель', 'Создание портфолио для моделей и актеров', 8000, 120, 'Фотосессия')
`).run();

const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
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

  try {
    const result = db.prepare(`INSERT INTO users (username, password, fullName, phone, email, role)
      VALUES (?, ?, ?, ?, ?, 'client')`).run(username, hashedPassword, fullName, phone, email);
    res.json({ id: result.lastInsertRowid, message: 'Регистрация успешна' });
  } catch (err) {
    res.status(400).json({ error: 'Пользователь уже существует' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);

  if (!user) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }

  if (bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 86400000
    }).json({ user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName } });
  } else {
    res.status(400).json({ error: 'Неверный пароль' });
  }
});

app.get('/api/services', (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services').all();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', authenticateToken, (req, res) => {
  const { serviceId, notes, bookingDate } = req.body;
  const orderDate = new Date().toISOString();

  const createOrder = () => {
    const service = db.prepare('SELECT price FROM services WHERE id = ?').get(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const result = db.prepare(`INSERT INTO orders (userId, serviceId, orderDate, bookingDate, totalPrice, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')`).run(req.user.id, serviceId, orderDate, bookingDate || null, service.price, notes);
    res.json({ id: result.lastInsertRowid, message: 'Заказ создан' });
  };

  if (bookingDate) {
    const existing = db.prepare(`SELECT * FROM orders WHERE bookingDate = ? AND status != 'cancelled'`).get(bookingDate);
    if (existing) {
      return res.status(409).json({ error: 'Это время уже занято, выберите другое' });
    }
  }
  createOrder();
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

  try {
    const orders = db.prepare(query).all();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  const { status } = req.body;
  const completionDate = status === 'completed' ? new Date().toISOString() : null;
  db.prepare(`UPDATE orders SET status = ?, completionDate = ? WHERE id = ?`).run(status, completionDate, req.params.id);
  res.json({ message: 'Статус обновлен' });
});

app.get('/api/portfolio', (req, res) => {
  try {
    const portfolio = db.prepare('SELECT * FROM portfolio').all();
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/portfolio', authenticateToken, upload.single('image'), (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  const { title, description, category } = req.body;
  const imageUrl = `/uploads/${req.file.filename}`;
  const createdAt = new Date().toISOString();
  try {
    const result = db.prepare(`INSERT INTO portfolio (title, description, imageUrl, category, createdAt)
      VALUES (?, ?, ?, ?, ?)`).run(title, description, imageUrl, category, createdAt);
    res.json({ id: result.lastInsertRowid, imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Статистика (только админ)
app.get('/api/admin/stats', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "client"').get().count;
  const revenueRow = db.prepare('SELECT SUM(totalPrice) as total FROM orders WHERE status = "completed"').get();
  const totalRevenue = revenueRow.total || 0;

  res.json({
    totalOrders,
    totalUsers,
    totalRevenue
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});