// عمليات الشركة: حاويات، طلبات بالمواقع، تنبيهات، مستخدمون
const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireRole, requireActiveCompany, hash } = require('../auth');

router.use(requireAuth, requireActiveCompany);
const scope = (req) => ({ companyId: req.user.companyId }); // عزل بيانات كل شركة

// ===== الحاويات =====
router.get('/containers', async (req, res) => {
  res.json(await prisma.container.findMany({ where: scope(req), orderBy: { code: 'asc' } }));
});
router.post('/containers', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { code, size } = req.body;
  if (!code || !size) return res.status(400).json({ error: 'رقم الحاوية والحجم مطلوبان' });
  try {
    res.json(await prisma.container.create({ data: { ...scope(req), code, size, notes: req.body.notes } }));
  } catch { res.status(400).json({ error: 'رقم الحاوية مستخدم مسبقاً' }); }
});
router.patch('/containers/:id/status', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER', 'DRIVER'), async (req, res) => {
  const c = await prisma.container.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!c) return res.status(404).json({ error: 'الحاوية غير موجودة' });
  res.json(await prisma.container.update({ where: { id: c.id }, data: { status: req.body.status } }));
});

// ===== الطلبات (مع الموقع وثلاثة أرقام تواصل) =====
router.get('/orders', async (req, res) => {
  res.json(await prisma.order.findMany({
    where: scope(req), include: { container: true }, orderBy: { id: 'desc' },
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
// «تم الاطلاع» — يوقف تكرار التنبيه
router.post('/alerts/:id/ack', async (req, res) => {
  const a = await prisma.alert.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!a) return res.status(404).json({ error: 'التنبيه غير موجود' });
  res.json(await prisma.alert.update({ where: { id: a.id }, data: { acknowledged: true } }));
});

// ===== مستخدمو الشركة =====
router.get('/users', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  res.json(await prisma.user.findMany({
    where: scope(req), select: { id: true, name: true, phone: true, role: true, language: true, active: true },
  }));
});
router.post('/users', requireRole('OWNER'), async (req, res) => {
  const { name, phone, password, role, language } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'الاسم والجوال وكلمة المرور مطلوبة' });
  if (role === 'SUPER_ADMIN') return res.status(403).json({ error: 'غير مسموح' });
  try {
    const u = await prisma.user.create({
      data: { ...scope(req), name, phone, password: await hash(password), role: role || 'DISPATCHER', language: language || 'ar' },
    });
    res.json({ id: u.id, name: u.name, phone: u.phone, role: u.role });
  } catch { res.status(400).json({ error: 'رقم الجوال مسجل مسبقاً' }); }
});


// ===== السائق: طلباته المسندة فقط =====
router.get('/driver/orders', requireRole('DRIVER'), async (req, res) => {
  // السائق يرى فقط الطلبات المسندة لشركته وغير المنتهية
  const orders = await prisma.order.findMany({
    where: {
      companyId: req.user.companyId,
      status: { in: ['ASSIGNED', 'EN_ROUTE', 'NEW'] },
    },
    include: { container: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

// السائق يحدث حالة طلبه: EN_ROUTE أو DONE
router.post('/driver/orders/:id/action', requireRole('DRIVER'), async (req, res) => {
  const { action, lat, lng, note } = req.body;
  const o = await prisma.order.findFirst({
    where: { id: +req.params.id, companyId: req.user.companyId },
  });
  if (!o) return res.status(404).json({ error: 'الطلب غير موجود' });

  let newStatus = o.status;
  if (action === 'enroute') newStatus = 'EN_ROUTE';
  else if (action === 'done') newStatus = 'DONE';
  else return res.status(400).json({ error: 'إجراء غير صحيح' });

  const updated = await prisma.order.update({
    where: { id: o.id },
    data: {
      status: newStatus,
      updatedBy: req.user.id,
      // إذا أرسل السائق موقعه نحفظه
      ...(lat && lng && { lat: +lat, lng: +lng }),
      ...(note && { notes: note }),
    },
  });
  res.json(updated);
});

// السائق يرسل موقعه الحالي
router.post('/driver/location', requireRole('DRIVER'), async (req, res) => {
  const { lat, lng, orderId } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'الموقع مطلوب' });
  if (orderId) {
    const o = await prisma.order.findFirst({
      where: { id: +orderId, companyId: req.user.companyId },
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

module.exports = router;
