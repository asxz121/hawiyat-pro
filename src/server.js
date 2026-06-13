// حاويات برو — الخادم الرئيسي
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { login } = require('./auth');
const { startJobs } = require('./cron');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// الواجهات البرمجية
app.post('/api/login', login);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/co', require('./routes/company'));
app.use('/api/hr', require('./routes/hr'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

// ===== Socket.IO للتتبع اللحظي =====
const SECRET = process.env.JWT_SECRET || 'dev-secret';

// تخزين مواقع السائقين: { companyId: { driverId: { lat, lng, name, orderId, time } } }
const driverLocations = {};

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('يلزم تسجيل الدخول'));
  try {
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch {
    next(new Error('انتهت الجلسة'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;
  const companyRoom = `company-${user.companyId}`;

  // انضمام لغرفة الشركة
  socket.join(companyRoom);

  console.log(`✓ اتصال: ${user.name} (${user.role}) — شركة ${user.companyId}`);

  // السائق يرسل موقعه
  socket.on('driver:location', (data) => {
    if (user.role !== 'DRIVER') return;
    const { lat, lng, orderId, containerCode, heading, speed } = data;
    if (!lat || !lng) return;

    if (!driverLocations[user.companyId]) driverLocations[user.companyId] = {};
    driverLocations[user.companyId][user.id] = {
      driverId: user.id,
      name: user.name,
      lat, lng, orderId,
      containerCode: containerCode || null,
      heading: heading || null,
      speed: speed || null,
      time: new Date(),
    };

    // إرسال الموقع لكل مدراء الشركة
    socket.to(companyRoom).emit('driver:moved', {
      driverId: user.id,
      name: user.name,
      lat, lng, orderId,
      containerCode: containerCode || null,
      heading: heading || null,
      speed: speed || null,
      time: new Date(),
    });
  });

  // مدير الحركة يطلب مواقع السائقين الحالية
  socket.on('tracking:request', () => {
    const locations = driverLocations[user.companyId] || {};
    socket.emit('tracking:snapshot', Object.values(locations));
  });

  // السائق يحدث حالة الطلب
  socket.on('driver:status', (data) => {
    if (user.role !== 'DRIVER') return;
    socket.to(companyRoom).emit('order:updated', {
      driverId: user.id,
      name: user.name,
      ...data,
    });
  });

  socket.on('disconnect', () => {
    // إزالة موقع السائق عند قطع الاتصال
    if (user.role === 'DRIVER' && driverLocations[user.companyId]) {
      delete driverLocations[user.companyId][user.id];
      socket.to(companyRoom).emit('driver:offline', { driverId: user.id, name: user.name });
    }
    console.log(`✗ قطع: ${user.name}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✓ حاويات برو يعمل على http://localhost:${PORT}`);
  startJobs();
});

module.exports = { io };
