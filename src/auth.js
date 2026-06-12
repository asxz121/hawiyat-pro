// المصادقة والصلاحيات وعزل الشركات
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret';

// تسجيل الدخول برقم الجوال وكلمة المرور
async function login(req, res) {
  const { phone, password } = req.body;
  const user = await prisma.user.findUnique({ where: { phone }, include: { company: true } });
  if (!user || !user.active || !(await bcrypt.compare(password || '', user.password)))
    return res.status(401).json({ error: 'رقم الجوال أو كلمة المرور غير صحيحة' });

  // فحص حالة اشتراك الشركة (لا ينطبق على مدير المنصة)
  if (user.role !== 'SUPER_ADMIN') {
    const c = user.company;
    if (!c || c.status === 'SUSPENDED' || c.expiresAt < new Date())
      return res.status(403).json({ error: 'اشتراك الشركة موقوف أو منتهٍ — تواصل مع إدارة المنصة' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, companyId: user.companyId, branchId: user.branchId, name: user.name },
    SECRET, { expiresIn: '12h' }
  );
  res.json({ token, role: user.role, name: user.name, company: user.company?.name || null });
}

// وسيط: التحقق من الجلسة
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { return res.status(401).json({ error: 'انتهت الجلسة — سجّل الدخول مجدداً' }); }
}

// وسيط: حصر الوصول بأدوار محددة
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'لا تملك صلاحية لهذا الإجراء' });

// وسيط: التأكد أن اشتراك الشركة ما زال سارياً أثناء الاستخدام
async function requireActiveCompany(req, res, next) {
  if (req.user.role === 'SUPER_ADMIN') return next();
  const c = await prisma.company.findUnique({ where: { id: req.user.companyId } });
  if (!c || c.status === 'SUSPENDED' || c.expiresAt < new Date())
    return res.status(403).json({ error: 'تم إيقاف اشتراك الشركة' });
  next();
}

const hash = (pw) => bcrypt.hash(pw, 10);

module.exports = { login, requireAuth, requireRole, requireActiveCompany, hash };
