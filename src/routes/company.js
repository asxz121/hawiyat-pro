// عمليات الشركة: حاويات، طلبات، تنبيهات، مستخدمون — v2.2
const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireRole, requireActiveCompany, hash } = require('../auth');

router.use(requireAuth, requireActiveCompany);
const scope = (req) => ({ companyId: req.user.companyId });

// ===== الحاويات =====
router.get('/containers', async (req, res) => {
  res.json(await prisma.container.findMany({
    where: scope(req),
    include: { orders: { where: { status: { in: ['ASSIGNED','EN_ROUTE','NEW'] } }, take: 1, orderBy: { id: "desc" } } },
    orderBy: { code: 'asc' },
  }));
});

router.post('/containers', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { code, size, notes } = req.body;
  if (!code || !size) return res.status(400).json({ error: 'رقم الحاوية والحجم مطلوبان' });
  try {
    res.json(await prisma.container.create({ data: { ...scope(req), code, size, notes: notes || null } }));
  } catch {
    res.status(400).json({ error: 'رقم الحاوية مستخدم مسبقاً' });
  }
});

router.patch('/containers/:id/status', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER', 'DRIVER'), async (req, res) => {
  const c = await prisma.container.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!c) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  res.json(await prisma.container.update({ where: { id: c.id }, data: { status: req.body.status } }));
});

// ===== الطلبات =====
router.get('/orders', async (req, res) => {
  // السائق يرى طلباته المسندة فقط
  const where = scope(req);
  if (req.user.role === 'DRIVER') {
    where.assignedTo = req.user.id;
    where.status = { in: ['ASSIGNED', 'EN_ROUTE', 'NEW'] };
  }
  res.json(await prisma.order.findMany({
    where,
    include: { container: true },
    orderBy: { id: 'desc' },
  }));
});

router.post('/orders', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { customerName, phone1, type, size, phoneSite, phone3, lat, lng, address, contractNo, dueDate, price, notes, containerId } = req.body;
  if (!customerName || !phone1) return res.status(400).json({ error: 'اسم العميل ورقمه مطلوبان' });
  const order = await prisma.order.create({
    data: {
      ...scope(req), customerName, phone1,
      type: type || 'DROP', size, phoneSite, phone3,
      lat: lat ? +lat : null, lng: lng ? +lng : null,
      address, contractNo: contractNo || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      price: price ? +price : null, notes,
      containerId: containerId ? +containerId : null,
      createdBy: req.user.id,
    },
  });
  res.json(order);
});

router.patch('/orders/:id', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER', 'DRIVER'), async (req, res) => {
  const o = await prisma.order.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود' });
  // السائق يعدل فقط طلباته
  if (req.user.role === 'DRIVER' && o.assignedTo !== req.user.id)
    return res.status(403).json({ error: 'هذا الطلب ليس مسنداً لك' });
  const { status, alertMuted } = req.body;
  res.json(await prisma.order.update({
    where: { id: o.id },
    data: {
      ...(status && { status }),
      ...(alertMuted !== undefined && { alertMuted }),
      updatedBy: req.user.id,
    },
  }));
});

// ===== التنبيهات =====
router.get('/alerts', async (req, res) => {
  res.json(await prisma.alert.findMany({
    where: { ...scope(req), acknowledged: false }, orderBy: { id: 'desc' }, take: 50,
  }));
});
router.post('/alerts/:id/ack', async (req, res) => {
  const a = await prisma.alert.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!a) return res.status(404).json({ error: 'التنبيه غير موجود' });
  res.json(await prisma.alert.update({ where: { id: a.id }, data: { acknowledged: true } }));
});

// ===== مستخدمو الشركة =====
router.get('/users', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  res.json(await prisma.user.findMany({
    where: scope(req),
    select: { id: true, name: true, phone: true, role: true, language: true, active: true, createdAt: true },
    orderBy: { id: 'asc' },
  }));
});

router.post('/users', requireRole('OWNER'), async (req, res) => {
  const { name, phone, password, role, language } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'الاسم والجوال وكلمة المرور مطلوبة' });
  if (role === 'SUPER_ADMIN') return res.status(403).json({ error: 'غير مسموح' });

  // ✅ منع تكرار الجوال
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return res.status(400).json({ error: 'رقم الجوال مسجل مسبقاً لدى مستخدم آخر' });

  try {
    const u = await prisma.user.create({
      data: {
        ...scope(req), name, phone,
        password: await hash(password),
        role: role || 'DISPATCHER',
        language: language || 'ar',
      },
    });
    res.json({ id: u.id, name: u.name, phone: u.phone, role: u.role });
  } catch {
    res.status(400).json({ error: 'رقم الجوال مسجل مسبقاً' });
  }
});

// ✅ قائمة السائقين الفعليين من جدول المستخدمين
router.get('/drivers', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const drivers = await prisma.user.findMany({
    where: { ...scope(req), role: 'DRIVER', active: true },
    select: { id: true, name: true, phone: true, role: true },
    orderBy: { name: 'asc' },
  });
  res.json(drivers);
});

// ===== إسناد طلب لسائق =====
router.post('/orders/:id/assign', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { driverId } = req.body;
  const o = await prisma.order.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود' });

  // التحقق أن السائق المختار فعلاً دور DRIVER في نفس الشركة
  if (driverId) {
    const driver = await prisma.user.findFirst({
      where: { id: +driverId, companyId: req.user.companyId, role: 'DRIVER', active: true },
    });
    if (!driver) return res.status(400).json({ error: 'السائق غير موجود أو غير نشط' });
  }

  res.json(await prisma.order.update({
    where: { id: o.id },
    data: {
      assignedTo: driverId ? +driverId : null,
      status: driverId ? 'ASSIGNED' : 'NEW',
      updatedBy: req.user.id,
    },
  }));
});

// ===== السائق: طلباته المسندة فقط =====
router.get('/driver/orders', requireRole('DRIVER'), async (req, res) => {
  const orders = await prisma.order.findMany({
    where: {
      companyId: req.user.companyId,
      assignedTo: req.user.id,
      status: { in: ['ASSIGNED', 'EN_ROUTE', 'NEW'] },
    },
    include: { container: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

// السائق يحدث حالة الطلب
router.post('/driver/orders/:id/action', requireRole('DRIVER'), async (req, res) => {
  const { action, lat, lng, note, photos } = req.body;
  const o = await prisma.order.findFirst({
    where: { id: +req.params.id, companyId: req.user.companyId, assignedTo: req.user.id },
  });
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود أو ليس مسنداً لك' });

  let newStatus = o.status;
  if (action === 'enroute') newStatus = 'EN_ROUTE';
  else if (action === 'done') newStatus = 'DONE';
  else return res.status(400).json({ error: 'إجراء غير صحيح' });

  // حفظ الصور
  let savedPhotos = [];
  if (action === 'done' && Array.isArray(photos) && photos.length > 0) {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, '../../public/uploads/orders', String(o.id));
    fs.mkdirSync(dir, { recursive: true });
    photos.slice(0,5).forEach((b64,i) => {
      try {
        const data = b64.replace(/^data:image[/]\w+;base64,/, '');
        const fname = Date.now() + '_' + i + '.jpg';
        fs.writeFileSync(path.join(dir,fname), Buffer.from(data,'base64'));
        savedPhotos.push('/uploads/orders/' + o.id + '/' + fname);
      } catch(e){}
    });
  }
  const updated = await prisma.order.update({
    where: { id: o.id },
    data: {
      status: newStatus,
      updatedBy: req.user.id,
      ...(lat && lng && { lat: +lat, lng: +lng }),
      ...(note && { notes: note }),
      ...(savedPhotos.length > 0 && { photos: savedPhotos }),
    },
  });
  res.json(updated);
});

// السائق يرسل موقعه
router.post('/driver/location', requireRole('DRIVER'), async (req, res) => {
  const { lat, lng, orderId } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'الموقع مطلوب' });
  if (orderId) {
    const o = await prisma.order.findFirst({
      where: { id: +orderId, companyId: req.user.companyId, assignedTo: req.user.id },
    });
    if (o) {
      await prisma.order.update({
        where: { id: o.id },
        data: { lat: +lat, lng: +lng, updatedBy: req.user.id },
      });
    }
  }
  res.json({ ok: true, lat, lng, time: new Date() });
});

// ✅ السائق يسجل المبلغ المحصّل
router.post('/orders/:id/collect', requireRole('DRIVER'), async (req, res) => {
  const { amount, method } = req.body;
  if (!amount) return res.status(400).json({ error: 'المبلغ مطلوب' });
  const o = await prisma.order.findFirst({
    where: { id: +req.params.id, companyId: req.user.companyId, assignedTo: req.user.id },
  });
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود أو ليس مسنداً لك' });
  res.json(await prisma.order.update({
    where: { id: o.id },
    data: {
      collectedAmount: +amount,
      collectedAt: new Date(),
      collectedBy: req.user.id,
      paymentMethod: method || 'cash',
    },
  }));
});

// ===== المحاسب يؤكد استلام المبلغ =====
router.post('/orders/:id/confirm-payment', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const { note, method } = req.body;
  const o = await prisma.order.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.json(await prisma.order.update({
    where: { id: o.id },
    data: {
      accountingNote: note || null,
      accountingAt: new Date(),
      accountingBy: req.user.id,
      paymentMethod: method || o.paymentMethod || 'cash',
    },
  }));
});

// ===== التقارير اليومية =====
router.get('/daily-reports', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const { days = 30 } = req.query;
  const from = new Date();
  from.setDate(from.getDate() - +days);
  const orders = await prisma.order.findMany({
    where: { ...scope(req), createdAt: { gte: from } },
    orderBy: { createdAt: 'desc' },
  });
  const byDay = {};
  orders.forEach(o => {
    const day = new Date(o.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (!byDay[day]) byDay[day] = { date: o.createdAt, orders: 0, cash: 0, transfer: 0, total: 0, confirmed: 0 };
    byDay[day].orders++;
    if (o.collectedAmount) {
      if (o.paymentMethod === 'transfer') byDay[day].transfer += o.collectedAmount;
      else byDay[day].cash += o.collectedAmount;
      byDay[day].total += o.collectedAmount;
    }
    if (o.accountingAt) byDay[day].confirmed += o.collectedAmount || 0;
  });
  res.json(Object.entries(byDay).map(([date, d]) => ({ date, ...d })));
});

router.get('/financial-summary', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayOrders, allOrders] = await Promise.all([
    prisma.order.findMany({ where: { ...scope(req), createdAt: { gte: today } } }),
    prisma.order.findMany({ where: scope(req) }),
  ]);
  const todayCash = todayOrders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + (o.collectedAmount || 0), 0);
  const todayTransfer = todayOrders.filter(o => o.paymentMethod === 'transfer').reduce((s, o) => s + (o.collectedAmount || 0), 0);
  const pending = allOrders.filter(o => o.collectedAmount && !o.accountingAt).reduce((s, o) => s + (o.collectedAmount || 0), 0);
  res.json({
    todayCash, todayTransfer,
    todayTotal: todayCash + todayTransfer,
    todayOrders: todayOrders.length,
    pendingCollection: pending,
    totalCollected: allOrders.reduce((s, o) => s + (o.collectedAmount || 0), 0),
  });
});

// ===== المستودعات =====
router.get('/warehouses', async (req, res) => {
  const warehouses = await prisma.warehouse.findMany({
    where: scope(req),
    include: { containers: { select: { id: true, status: true } } },
    orderBy: { id: 'asc' },
  });
  res.json(warehouses.map(w => ({
    ...w,
    totalContainers: w.containers.length,
    available: w.containers.filter(c => c.status === 'IN_DEPOT').length,
    rented: w.containers.filter(c => c.status === 'ON_SITE').length,
    maintenance: w.containers.filter(c => c.status === 'MAINTENANCE').length,
  })));
});

router.post('/warehouses', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  const { name, address, lat, lng, capacity } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم المستودع مطلوب' });
  res.json(await prisma.warehouse.create({
    data: { ...scope(req), name, address, lat: lat ? +lat : null, lng: lng ? +lng : null, capacity: capacity ? +capacity : 0 },
  }));
});

router.patch('/warehouses/:id', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  const w = await prisma.warehouse.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!w) return res.status(404).json({ error: 'المستودع غير موجود' });
  const { name, address, lat, lng, capacity } = req.body;
  res.json(await prisma.warehouse.update({
    where: { id: w.id },
    data: {
      ...(name && { name }), ...(address && { address }),
      ...(lat && { lat: +lat }), ...(lng && { lng: +lng }),
      ...(capacity && { capacity: +capacity }),
    },
  }));
});

router.patch('/containers/:id/warehouse', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const c = await prisma.container.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!c) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  res.json(await prisma.container.update({
    where: { id: c.id },
    data: { warehouseId: req.body.warehouseId ? +req.body.warehouseId : null },
  }));
});

// استخراج إحداثيات من رابط
router.post('/extract-location', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER', 'DRIVER'), async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'الرابط مطلوب' });

  // ✅ فك الروابط المختصرة (maps.app.goo.gl / goo.gl / bit.ly)
  if (url.includes('goo.gl') || url.includes('bit.ly') || url.includes('maps.app')) {
    try {
      const https = require('https');
      url = await new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
          resolve(r.headers.location || url);
        }).on('error', () => resolve(url));
      });
    } catch(e) {}
  }

  let lat = null, lng = null;
  const patterns = [
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
    /place\/.*\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\?q=(-?\d+\.?\d*)%2C(-?\d+\.?\d*)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) { lat = +match[1]; lng = +match[2]; break; }
  }
  if (lat && lng) res.json({ lat, lng, found: true });
  else res.json({ found: false, message: 'لم يتم استخراج الموقع — حاول نسخ الرابط الكامل من قوقل ماب' });
});

// ===== تعديل مستخدم =====
router.patch('/users/:id', requireRole('OWNER'), async (req, res) => {
  const { role, password, active, name } = req.body;
  const u = await prisma.user.findFirst({ where: { id: +req.params.id, companyId: req.user.companyId } });
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const data = {};
  if (name) data.name = name;
  if (role) data.role = role;
  if (active !== undefined) data.active = active;
  if (password) {
    const bcrypt = require('bcryptjs');
    data.password = await bcrypt.hash(password, 10);
  }
  res.json(await prisma.user.update({
    where: { id: u.id }, data,
    select: { id: true, name: true, role: true, active: true },
  }));
});

// ===== حذف مستخدم =====
router.delete('/users/:id', requireRole('OWNER'), async (req, res) => {
  const u = await prisma.user.findFirst({ where: { id: +req.params.id, companyId: req.user.companyId } });
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (u.role === 'OWNER') return res.status(403).json({ error: 'لا يمكن حذف مدير الشركة' });
  await prisma.user.delete({ where: { id: u.id } });
  res.json({ ok: true });
});

module.exports = router;
