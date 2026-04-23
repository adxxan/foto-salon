import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

function Login({ setUser }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '', fullName: '', phone: '', email: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (isLogin) {
        const response = await axios.post('http://localhost:5000/api/login', {
          username: formData.username,
          password: formData.password
        }, { withCredentials: true });
        
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
      } else {
        await axios.post('http://localhost:5000/api/register', formData);
        setIsLogin(true);
        setFormData({ username: '', password: '', fullName: '', phone: '', email: '' });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isLogin ? 'Вход в систему' : 'Регистрация'}</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Логин" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required />
          <input type="password" placeholder="Пароль" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
          {!isLogin && (
            <>
              <input type="text" placeholder="ФИО" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} required />
              <input type="tel" placeholder="Телефон" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </>
          )}
          {error && <div className="error">{error}</div>}
          <button type="submit">{isLogin ? 'Войти' : 'Зарегистрироваться'}</button>
        </form>
        <button className="switch-btn" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  );
}

function Home({ user }) {
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [bookingDate, setBookingDate] = useState('');

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    const response = await axios.get('http://localhost:5000/api/services');
    setServices(response.data);
  };

const createOrder = async () => {
  if (!bookingDate) {
    alert('Выберите дату и время');
    return;
  }
  await axios.post('http://localhost:5000/api/orders', 
    { serviceId: selectedService.id, notes, bookingDate },
    { withCredentials: true }
  );
  setShowModal(false);
  setNotes('');
  setBookingDate('');
  alert('Заказ успешно создан!');
};

  return (
    <div className="home">
      <section className="hero">
        <h1>Фотосалон "Момент"</h1>
        <p>Профессиональная фотосъемка, обработка и печать</p>
      </section>

      <section className="services">
        <h2>Наши услуги</h2>
        <div className="services-grid">
          {services.map(service => (
            <div key={service.id} className="service-card">
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <div className="price">{service.price} сом</div>
              <div className="duration">⏱ {service.duration} мин</div>
              {user && (
                <button onClick={() => { setSelectedService(service); setShowModal(true); }}>
                  Заказать
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {showModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Заказ услуги: {selectedService?.name}</h3>
            <input 
              type="datetime-local" 
              value={bookingDate} 
              onChange={(e) => setBookingDate(e.target.value)} 
              required 
              style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
            />
            <textarea placeholder="Ваши пожелания" value={notes} onChange={(e) => setNotes(e.target.value)}></textarea>
            <button onClick={createOrder}>Подтвердить заказ</button>
            <button onClick={() => setShowModal(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Profile({ user, showNotification }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetchOrders();
  }, []);

const fetchOrders = async () => {
  const response = await axios.get('http://localhost:5000/api/orders', {
    withCredentials: true
  });
  
  const savedStatuses = JSON.parse(localStorage.getItem('orderStatuses') || '{}');
  response.data.forEach(order => {
    if (savedStatuses[order.id] !== order.status) {
      const statusText = getStatusText(order.status);
      showNotification('Статус заказа изменён', `Заказ "${order.serviceName}" теперь: ${statusText}`);
      savedStatuses[order.id] = order.status;
    }
  });
  localStorage.setItem('orderStatuses', JSON.stringify(savedStatuses));
  
  setOrders(response.data);
};

  const getStatusText = (status) => {
    const statusMap = {
      pending: 'В обработке',
      processing: 'Выполняется',
      completed: 'Выполнен',
      cancelled: 'Отменен'
    };
    return statusMap[status] || status;
  };

  return (
    <div className="profile">
      <h2>Личный кабинет</h2>
      <div className="user-info">
        <p><strong>ФИО:</strong> {user?.fullName || 'Не указано'}</p>
        <p><strong>Логин:</strong> {user?.username}</p>
        <p><strong>Роль:</strong> {user?.role === 'admin' ? 'Администратор' : 'Клиент'}</p>
      </div>
      
      <h3>Мои заказы</h3>
      <div className="orders-table">
        <table>
          <thead>
            <tr>
              <th>Услуга</th>
              <th>Дата заказа</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Примечания</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id}>
                <td>{order.serviceName}</td>
                <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                <td>{order.totalPrice} сом</td>
                <td className={`status-${order.status}`}>{getStatusText(order.status)}</td>
                <td>{order.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminPanel({ user, showNotification }) {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [newPortfolio, setNewPortfolio] = useState({ title: '', description: '', category: '', image: null });
  const [portfolio, setPortfolio] = useState([]);

  useEffect(() => {
    fetchOrders();
    fetchStats();
    fetchPortfolio();
  }, []);

  const fetchOrders = async () => {
    const response = await axios.get('http://localhost:5000/api/orders', {
      withCredentials: true
    });
    setOrders(response.data);
  };

  const fetchStats = async () => {
    const response = await axios.get('http://localhost:5000/api/admin/stats', {
      withCredentials: true
    });
    setStats(response.data);
  };

  const fetchPortfolio = async () => {
    const response = await axios.get('http://localhost:5000/api/portfolio');
    setPortfolio(response.data);
  };

  const updateOrderStatus = async (orderId, status) => {
    await axios.put(`http://localhost:5000/api/orders/${orderId}`, 
      { status },
      { withCredentials: true }
    );
    const order = orders.find(o => o.id === orderId);
    if (order && showNotification) {
      showNotification('Статус заказа обновлён', `Заказ "${order.serviceName}" изменён на: ${status}`);
    }
    fetchOrders();
    fetchStats();
  };

  const addToPortfolio = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', newPortfolio.title);
    formData.append('description', newPortfolio.description);
    formData.append('category', newPortfolio.category);
    formData.append('image', newPortfolio.image);
    
    await axios.post('http://localhost:5000/api/portfolio', formData, {
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    fetchPortfolio();
    setNewPortfolio({ title: '', description: '', category: '', image: null });
  };

  // Подготовка данных для графика
  const chartData = orders.reduce((acc, order) => {
    const date = new Date(order.orderDate).toLocaleDateString();
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.orders += 1;
    } else {
      acc.push({ date, orders: 1 });
    }
    return acc;
  }, []).slice(-7);

  return (
    <div className="admin-panel">
      <h2>Панель администратора</h2>
      
      <div className="stats">
        <div className="stat-card">
          <h3>{stats.totalOrders || 0}</h3>
          <p>Всего заказов</p>
        </div>
        <div className="stat-card">
          <h3>{stats.totalUsers || 0}</h3>
          <p>Клиентов</p>
        </div>
        <div className="stat-card">
          <h3>{stats.totalRevenue || 0} сом</h3>
          <p>Выручка</p>
        </div>
      </div>

      <div className="admin-section">
        <h3>Динамика заказов (последние 7 дней)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="orders" fill="#ff6b6b" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-section">
        <h3>Управление заказами</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Услуга</th>
              <th>Клиент</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id}>
                <td>#{order.id}</td>
                <td>{order.serviceName}</td>
                <td>{order.userId}</td>
                <td>{order.totalPrice} сом</td>
                <td>{order.status}</td>
                <td>
                  <select onChange={(e) => updateOrderStatus(order.id, e.target.value)} value={order.status}>
                    <option value="pending">В обработке</option>
                    <option value="processing">Выполняется</option>
                    <option value="completed">Выполнен</option>
                    <option value="cancelled">Отменен</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-section">
        <h3>Добавить в портфолио</h3>
        <form onSubmit={addToPortfolio}>
          <input type="text" placeholder="Название" value={newPortfolio.title} onChange={(e) => setNewPortfolio({ ...newPortfolio, title: e.target.value })} required />
          <textarea placeholder="Описание" value={newPortfolio.description} onChange={(e) => setNewPortfolio({ ...newPortfolio, description: e.target.value })}></textarea>
          <input type="text" placeholder="Категория" value={newPortfolio.category} onChange={(e) => setNewPortfolio({ ...newPortfolio, category: e.target.value })} />
          <input type="file" accept="image/*" onChange={(e) => setNewPortfolio({ ...newPortfolio, image: e.target.files[0] })} required />
          <button type="submit">Добавить</button>
        </form>
      </div>

      <div className="admin-section">
        <h3>Портфолио</h3>
        <div className="portfolio-grid">
          {portfolio.map(item => (
            <div key={item.id} className="portfolio-item">
              <img src={`http://localhost:5000${item.imageUrl}`} alt={item.title} />
              <h4>{item.title}</h4>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));

  const showNotification = (title, body) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      });
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  if (!user) {
    return <Login setUser={setUser} />;
  }

  return (
    <Router>
      <div className="app">
        <nav className="navbar">
          <div className="nav-brand">Фотосалон "Момент"</div>
          <div className="nav-links">
            <Link to="/">Главная</Link>
            <Link to="/profile">Личный кабинет</Link>
            {user?.role === 'admin' && <Link to="/admin">Админ панель</Link>}
            <button onClick={handleLogout} className="logout-btn">Выйти</button>
          </div>
          <div className="user-info-nav">
            <span>{user?.fullName || user?.username}</span>
          </div>
        </nav>
        
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/profile" element={<Profile user={user} showNotification={showNotification} />} />
          <Route path="/admin" element={user?.role === 'admin' ? <AdminPanel user={user} showNotification={showNotification} /> : <Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;