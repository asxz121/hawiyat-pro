// الموارد البشرية والأسطول — حاويات برو v2.2
const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireRole, requireActiveCompany } = require('../auth');

router.use(requireAuth, requireActiveCompany);
const scope = (req) => ({ companyId: req.user.companyId });

// ===== الموظفون =====
router.get('/employees', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'ACCOUNTANT'), async (req, res) => {
  res.json(await prisma.employee.findMany({
    where: scope(req),
    orderBy: { id: 'asc' },
  }));
});

router.post('/employees', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  const { name, role, phone, shift, salary, commission, housingAllowance, transportAllowance, extra, hiredAt } = req.body;
  if (!name || !salary) return res.status(400).json({ error: 'الاسم والراتب مطلوبان' });
  // إجمالي البدلات = عمولة + سكن + مواصلات + إضافي
  const totalExtra = (+commission || 0) + (+housingAllowance || 0) + (+transportAllowance || 0) + (+extra || 0);
  const emp = await prisma.employee.create({
    data: {
      ...scope(req),
      name,
      role: role || 'عامل',
      phone: phone || null,
      shift: shift || 'MORNING',
      salary: +salary,
      extra: totalExtra,
      hiredAt: hiredAt || null,
      createdBy: req.user.id,
    },
  });
  res.json(emp);
});

router.patch('/employees/:id', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  const emp = await prisma.employee.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const { name, role, phone, shift, salary, commission, housingAllowance, transportAllowance, extra, hiredAt, status } = req.body;
  const data = {};
  if (name) data.name = name;
  if (role) data.role = role;
  if (phone !== undefined) data.phone = phone;
  if (shift) data.shift = shift;
  if (salary) data.salary = +salary;
  if (status) data.status = status;
  if (hiredAt !== undefined) data.hiredAt = hiredAt;
  // إعادة حساب البدلات إذا أُرسلت
  if (commission !== undefined || housingAllowance !== undefined || transportAllowance !== undefined || extra !== undefined) {
    data.extra = (+commission || 0) + (+housingAllowance || 0) + (+transportAllowance || 0) + (+extra || 0);
  }
  res.json(await prisma.employee.update({ where: { id: emp.id }, data }));
});

router.delete('/employees/:id', requireRole('OWNER'), async (req, res) => {
  const emp = await prisma.employee.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  await prisma.employee.update({ where: { id: emp.id }, data: { status: 'INACTIVE' } });
  res.json({ ok: true });
});

// ===== الحضور =====
router.get('/attendance', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const employees = await prisma.employee.findMany({
    where: { ...scope(req), status: 'ACTIVE' },
    orderBy: { id: 'asc' },
  });

  const records = await prisma.attendance.findMany({
    where: { ...scope(req), date: { gte: today, lt: tomorrow } },
  });

  res.json(employees.map(emp => {
    const rec = records.find(r => r.employeeId === emp.id);
    return { ...emp, attendance: rec || { checkIn: null, checkOut: null, status: 'none' } };
  }));
});

router.post('/attendance/checkin', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'معرف الموظف مطلوب' });
  const emp = await prisma.employee.findFirst({ where: { id: +employeeId, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const existing = await prisma.attendance.findFirst({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: today, lt: tomorrow } },
  });
  const now = new Date().toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
  const shiftStart = emp.shift === 'MORNING' ? 8 : emp.shift === 'EVENING' ? 16 : 0;
  const isLate = new Date().getHours() > shiftStart;
  const status = isLate ? 'late' : 'in';
  if (existing) {
    res.json(await prisma.attendance.update({ where: { id: existing.id }, data: { checkIn: now, status } }));
  } else {
    res.json(await prisma.attendance.create({
      data: { ...scope(req), employeeId: +employeeId, checkIn: now, status, createdBy: req.user.id },
    }));
  }
});

router.post('/attendance/checkout', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { employeeId } = req.body;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const existing = await prisma.attendance.findFirst({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: today, lt: tomorrow } },
  });
  if (!existing) return res.status(404).json({ error: 'لا يوجد سجل حضور اليوم' });
  const now = new Date().toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
  res.json(await prisma.attendance.update({ where: { id: existing.id }, data: { checkOut: now, status: 'out' } }));
});

router.post('/attendance/absent', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR'), async (req, res) => {
  const { employeeId } = req.body;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const existing = await prisma.attendance.findFirst({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: today, lt: tomorrow } },
  });
  if (existing) {
    res.json(await prisma.attendance.update({ where: { id: existing.id }, data: { status: 'absent' } }));
  } else {
    res.json(await prisma.attendance.create({ data: { ...scope(req), employeeId: +employeeId, status: 'absent' } }));
  }
});

// ===== الرواتب =====
router.get('/payroll', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7).replace('-', '/');
  const employees = await prisma.employee.findMany({ where: { ...scope(req), status: 'ACTIVE' } });
  const [year, mon] = month.split('/').map(Number);
  const startOfMonth = new Date(year, mon - 1, 1);
  const endOfMonth = new Date(year, mon, 1);

  const attendanceRecords = await prisma.attendance.findMany({
    where: { ...scope(req), date: { gte: startOfMonth, lt: endOfMonth }, status: 'absent' },
  });
  const absentMap = {};
  attendanceRecords.forEach(r => { absentMap[r.employeeId] = (absentMap[r.employeeId] || 0) + 1; });

  // المعاملات المالية هذا الشهر
  const transactions = await prisma.employeeTransaction.findMany({
    where: { ...scope(req), month },
  });
  const transMap = {};
  transactions.forEach(t => {
    if (!transMap[t.employeeId]) transMap[t.employeeId] = [];
    transMap[t.employeeId].push(t);
  });

  const paidRecords = await prisma.payroll.findMany({ where: { ...scope(req), month } });
  const paidMap = {};
  paidRecords.forEach(r => { paidMap[r.employeeId] = r; });

  const result = employees.map(emp => {
    const absentDays = absentMap[emp.id] || 0;
    const dayRate = Math.round(emp.salary / 30);
    const deduction = absentDays * dayRate;
    const empTrans = transMap[emp.id] || [];
    let bonusAmt = 0, overtime = 0, penalties = 0, advances = 0;
    empTrans.forEach(t => {
      if (t.type === 'BONUS_AMOUNT') bonusAmt += t.amount;
      else if (t.type === 'BONUS_DAYS') bonusAmt += (t.days || 0) * dayRate;
      else if (t.type === 'OVERTIME') overtime += t.amount;
      else if (t.type === 'PENALTY') penalties += t.amount;
      else if (t.type === 'DEDUCTION') penalties += t.amount;
      else if (t.type === 'ADVANCE') advances += t.amount;
      else if (t.type === 'ADVANCE_REPAY') advances -= t.amount;
    });
    const netSalary = emp.salary + emp.extra + bonusAmt + overtime - deduction - penalties;
    const paidRecord = paidMap[emp.id];
    return {
      ...emp, absentDays, deduction, netSalary, bonusAmt, overtime, penalties, advances,
      paid: paidRecord?.paid || false,
      payrollId: paidRecord?.id || null,
    };
  });
  res.json(result);
});

router.post('/payroll/pay', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const { employeeId, month } = req.body;
  const emp = await prisma.employee.findFirst({ where: { id: +employeeId, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const m = month || new Date().toISOString().slice(0, 7).replace('-', '/');
  const [year, mon] = m.split('/').map(Number);
  const startOfMonth = new Date(year, mon - 1, 1);
  const endOfMonth = new Date(year, mon, 1);
  const absentCount = await prisma.attendance.count({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: startOfMonth, lt: endOfMonth }, status: 'absent' },
  });
  const dayRate = Math.round(emp.salary / 30);
  const deduction = absentCount * dayRate;
  const netSalary = emp.salary + emp.extra - deduction;
  const existing = await prisma.payroll.findFirst({ where: { employeeId: +employeeId, ...scope(req), month: m } });
  if (existing) {
    res.json(await prisma.payroll.update({ where: { id: existing.id }, data: { paid: true } }));
  } else {
    res.json(await prisma.payroll.create({
      data: {
        ...scope(req), employeeId: +employeeId, month: m,
        baseSalary: emp.salary, extra: emp.extra,
        absentDays: absentCount, deduction, netSalary, paid: true,
      },
    }));
  }
});

// ===== الأسطول =====
router.get('/vehicles', async (req, res) => {
  res.json(await prisma.vehicle.findMany({
    where: scope(req),
    include: { driver: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' },
  }));
});

router.post('/vehicles', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  const { type, plate, driverId, odometer } = req.body;
  if (!plate) return res.status(400).json({ error: 'رقم اللوحة مطلوب' });
  const odo = odometer ? +odometer : 0;
  res.json(await prisma.vehicle.create({
    data: {
      ...scope(req),
      type: type || 'شاحنة',
      plate,
      driverId: driverId ? +driverId : null,
      odometer: odo,
      lastOilAt: odo,  // ✅ تسجيل أولي: العداد الأساسي = نقطة البداية
      createdBy: req.user.id,
    },
    include: { driver: { select: { id: true, name: true } } },
  }));
});

// ✅ تحديث العداد مع تجميد 24 ساعة (السائق) والمدير يتجاوز التجميد
router.patch('/vehicles/:id/odometer', async (req, res) => {
  const v = await prisma.vehicle.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });

  const newOdo = +req.body.odometer;
  if (!newOdo || isNaN(newOdo)) return res.status(400).json({ error: 'قراءة العداد غير صحيحة' });
  if (newOdo <= v.odometer) return res.status(400).json({ error: 'القراءة الجديدة يجب أن تكون أكبر من الحالية (' + v.odometer + ' كم)' });

  // ✅ المسافة المقطوعة = الجديد - القديم
  const driven = newOdo - v.odometer;

  // ✅ تجميد 24 ساعة للدور غير المدير
  const isManager = ['OWNER', 'BRANCH_MGR'].includes(req.user.role);
  if (!isManager) {
    // فحص آخر تحديث — نستخدم حقل updatedAt إن وجد أو نضيف metadata
    // نحفظ وقت آخر تحديث في notes بشكل مؤقت
    const lastUpdateMeta = v.notes ? v.notes.match(/ODOMETER_UPDATED:(\d+)/) : null;
    if (lastUpdateMeta) {
      const lastUpdate = new Date(+lastUpdateMeta[1]);
      const hoursSince = (Date.now() - lastUpdate.getTime()) / 3600000;
      if (hoursSince < 24) {
        return res.status(400).json({
          error: `لا يمكن تحديث العداد مرة أخرى قبل مرور 24 ساعة. آخر تحديث قبل ${Math.round(hoursSince)} ساعة`,
          frozenUntil: new Date(lastUpdate.getTime() + 86400000),
        });
      }
    }
  }

  // تحديث notes لحفظ وقت آخر تحديث
  const baseNotes = (v.notes || '').replace(/ODOMETER_UPDATED:\d+/, '').trim();
  const newNotes = `${baseNotes} ODOMETER_UPDATED:${Date.now()}`.trim();

  const updated = await prisma.vehicle.update({
    where: { id: v.id },
    data: { odometer: newOdo, notes: newNotes },
    include: { driver: { select: { id: true, name: true } } },
  });

  res.json({ ...updated, driven, previousOdometer: v.odometer });
});

router.post('/vehicles/:id/oilchange', requireRole('OWNER', 'BRANCH_MGR', 'DISPATCHER', 'DRIVER'), async (req, res) => {
  const v = await prisma.vehicle.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });
  await prisma.vehicle.update({ where: { id: v.id }, data: { lastOilAt: v.odometer } });
  await prisma.maintenance.create({
    data: {
      ...scope(req), vehicleId: v.id,
      type: 'تغيير زيت وفلتر',
      details: `عند قراءة ${v.odometer} كم`,
      cost: req.body.cost ? +req.body.cost : 420,
      createdBy: req.user.id,
    },
  });
  res.json({ ok: true, resetAt: v.odometer });
});

// ===== الصيانة =====
router.get('/maintenance', async (req, res) => {
  res.json(await prisma.maintenance.findMany({
    where: scope(req),
    include: { vehicle: { select: { plate: true, type: true } } },
    orderBy: { date: 'desc' },
    take: 100,
  }));
});

router.post('/maintenance', requireRole('OWNER', 'BRANCH_MGR', 'DISPATCHER'), async (req, res) => {
  const { vehicleId, type, details, cost } = req.body;
  if (!vehicleId || !cost) return res.status(400).json({ error: 'السيارة والتكلفة مطلوبان' });
  const v = await prisma.vehicle.findFirst({ where: { id: +vehicleId, ...scope(req) } });
  if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });
  if (type === 'تغيير زيت وفلتر') {
    await prisma.vehicle.update({ where: { id: v.id }, data: { lastOilAt: v.odometer } });
  }
  res.json(await prisma.maintenance.create({
    data: { ...scope(req), vehicleId: +vehicleId, type, details, cost: +cost, createdBy: req.user.id },
  }));
});

// ===== المعاملات المالية =====
router.get('/transactions', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const { employeeId, month } = req.query;
  const where = { ...scope(req) };
  if (employeeId) where.employeeId = +employeeId;
  if (month) where.month = month;
  res.json(await prisma.employeeTransaction.findMany({
    where,
    include: { employee: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }));
});

router.post('/transactions', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const { employeeId, type, amount, days, month, note } = req.body;
  if (!employeeId || !type) return res.status(400).json({ error: 'البيانات ناقصة' });
  if (!amount && !days) return res.status(400).json({ error: 'القيمة أو عدد الأيام مطلوب' });
  const emp = await prisma.employee.findFirst({ where: { id: +employeeId, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const t = await prisma.employeeTransaction.create({
    data: {
      ...scope(req),
      employeeId: +employeeId,
      type,
      amount: amount ? +amount : 0,
      days: days ? +days : null,
      month: month || new Date().toISOString().slice(0, 7).replace('-', '/'),
      note,
      createdBy: req.user.id,
    },
  });
  res.json(t);
});

router.delete('/transactions/:id', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const t = await prisma.employeeTransaction.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!t) return res.status(404).json({ error: 'المعاملة غير موجودة' });
  await prisma.employeeTransaction.delete({ where: { id: t.id } });
  res.json({ ok: true });
});

// ملخص مالي للموظف
router.get('/employees/:id/financial', requireRole('OWNER', 'ACCOUNTANT', 'BRANCH_MGR'), async (req, res) => {
  const emp = await prisma.employee.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const month = req.query.month || new Date().toISOString().slice(0, 7).replace('-', '/');
  const transactions = await prisma.employeeTransaction.findMany({
    where: { employeeId: emp.id, ...scope(req), month },
    orderBy: { createdAt: 'desc' },
  });
  const dayRate = Math.round(emp.salary / 30);
  let bonusAmount = 0, bonusDays = 0, deductions = 0, advances = 0, overtime = 0, penalties = 0;
  transactions.forEach(t => {
    if (t.type === 'BONUS_AMOUNT') bonusAmount += t.amount;
    else if (t.type === 'BONUS_DAYS') { bonusDays += t.days || 0; bonusAmount += (t.days || 0) * dayRate; }
    else if (t.type === 'DEDUCTION') deductions += t.amount;
    else if (t.type === 'ADVANCE') advances += t.amount;
    else if (t.type === 'ADVANCE_REPAY') advances -= t.amount;
    else if (t.type === 'OVERTIME') overtime += t.amount;
    else if (t.type === 'PENALTY') penalties += t.amount;
  });
  res.json({
    employee: emp, month, transactions, dayRate,
    bonusAmount, bonusDays, deductions, advances, overtime, penalties,
    netAdditions: bonusAmount + overtime,
    netDeductions: deductions + advances + penalties,
    netSalary: emp.salary + emp.extra + bonusAmount + overtime - deductions - penalties,
  });
});

module.exports = router;
