// لوحة المدير العام: إدارة الشركات والاشتراكات
const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireRole, hash } = require('../auth');

router.use(requireAuth, requireRole('SUPER_ADMIN'));

// إحصائيات المنصة
router.get('/stats', async (req, res) => {
  const [companies, active, users, orders] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
    prisma.order.count(),
  ]);
  res.json({ companies, active, users, orders });
});

// قائمة الشركات
router.get('/companies', async (req, res) => {
  const companies = await prisma.company.findMany({
    include: { _count: { select: { users: true, containers: true, orders: true } } },
    orderBy: { id: 'desc' },
  });
  res.json(companies);
});

// إنشاء شركة جديدة + مدير لها (اشتراك سنة افتراضياً)
router.post('/companies', async (req, res) => {
  const { name, phone, months = 12, ownerName, ownerPhone, ownerPassword } = req.body;
  if (!name || !ownerPhone || !ownerPassword)
    return res.status(400).json({ error: 'اسم الشركة وجوال المدير وكلمة مروره مطلوبة' });
  const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + Number(months));
  try {
    const company = await prisma.company.create({
      data: {
        name, phone, expiresAt, status: 'ACTIVE',
        branches: { create: { name: 'الفرع الرئيسي' } },
        users: { create: { name: ownerName || 'مدير الشركة', phone: ownerPhone, password: await hash(ownerPassword), role: 'OWNER' } },
      },
    });
    res.json(company);
  } catch (e) {
    res.status(400).json({ error: e.code === 'P2002' ? 'رقم الجوال مسجل مسبقاً' : 'تعذر إنشاء الشركة' });
  }
});

// تمديد الاشتراك بعدد أشهر
router.post('/companies/:id/extend', async (req, res) => {
  const c = await prisma.company.findUnique({ where: { id: +req.params.id } });
  if (!c) return res.status(404).json({ error: 'الشركة غير موجودة' });
  const base = c.expiresAt > new Date() ? new Date(c.expiresAt) : new Date();
  base.setMonth(base.getMonth() + Number(req.body.months || 12));
  const updated = await prisma.company.update({ where: { id: c.id }, data: { expiresAt: base, status: 'ACTIVE' } });
  res.json(updated);
});

// إيقاف / إعادة تفعيل — البيانات تبقى كما هي
router.post('/companies/:id/toggle', async (req, res) => {
  const c = await prisma.company.findUnique({ where: { id: +req.params.id } });
  if (!c) return res.status(404).json({ error: 'الشركة غير موجودة' });
  const updated = await prisma.company.update({
    where: { id: c.id },
    data: { status: c.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' },
  });
  res.json(updated);
});

module.exports = router;
