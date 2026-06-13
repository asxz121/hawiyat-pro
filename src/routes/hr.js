// الموارد البشرية والأسطول — حاويات برو v2
const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireRole, requireActiveCompany } = require('../auth');

router.use(requireAuth, requireActiveCompany);
const scope = (req) => ({ companyId: req.user.companyId });

// ===== الموظفون =====
// مدير الحركة والموزع والمحاسب والسائق لا يرون الموظفين
router.get('/employees', requireRole('OWNER','BRANCH_MGR','TRAFFIC_MGR'), async (req, res) => {
  res.json(await prisma.employee.findMany({
    where: scope(req),
    orderBy: { id: 'asc' },
  }));
});

router.post('/employees', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  const { name, role, phone, shift, salary, extra, hiredAt } = req.body;
  if (!name || !salary) return res.status(400).json({ error: 'الاسم والراتب مطلوبان' });
  const emp = await prisma.employee.create({
    data: {
      ...scope(req), name, role: role || 'عامل',
      phone: phone || null, shift: shift || 'MORNING',
      salary: +salary, extra: extra ? +extra : 0,
      hiredAt: hiredAt || null,
    },
  });
  res.json(emp);
});

router.patch('/employees/:id', requireRole('OWNER', 'BRANCH_MGR'), async (req, res) => {
  const emp = await prisma.employee.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  const { name, role, phone, shift, salary, extra, hiredAt, status } = req.body;
  res.json(await prisma.employee.update({
    where: { id: emp.id },
    data: {
      ...(name && { name }),
      ...(role && { role }),
      ...(phone !== undefined && { phone }),
      ...(shift && { shift }),
      ...(salary && { salary: +salary }),
      ...(extra !== undefined && { extra: +extra }),
      ...(hiredAt !== undefined && { hiredAt }),
      ...(status && { status }),
    },
  }));
});

router.delete('/employees/:id', requireRole('OWNER'), async (req, res) => {
  const emp = await prisma.employee.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });
  await prisma.employee.update({ where: { id: emp.id }, data: { status: 'INACTIVE' } });
  res.json({ ok: true });
});

// ===== الحضور والانصراف =====
router.get('/attendance', async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const employees = await prisma.employee.findMany({
    where: { ...scope(req), status: 'ACTIVE' },
    orderBy: { id: 'asc' },
  });

  const records = await prisma.attendance.findMany({
    where: {
      ...scope(req),
      date: { gte: today, lt: tomorrow },
    },
  });

  const result = employees.map(emp => {
    const rec = records.find(r => r.employeeId === emp.id);
    return {
      ...emp,
      attendance: rec || { checkIn: null, checkOut: null, status: 'none' },
    };
  });

  res.json(result);
});

router.post('/attendance/checkin', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'معرف الموظف مطلوب' });

  const emp = await prisma.employee.findFirst({ where: { id: +employeeId, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.attendance.findFirst({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: today, lt: tomorrow } },
  });

  const now = new Date().toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
  const shiftStart = emp.shift === 'MORNING' ? 8 : emp.shift === 'EVENING' ? 16 : 0;
  const currentHour = new Date().getHours();
  const isLate = currentHour > shiftStart + 0;
  const status = isLate ? 'late' : 'in';

  if (existing) {
    res.json(await prisma.attendance.update({
      where: { id: existing.id },
      data: { checkIn: now, status },
    }));
  } else {
    res.json(await prisma.attendance.create({
      data: { ...scope(req), employeeId: +employeeId, checkIn: now, status },
    }));
  }
});

router.post('/attendance/checkout', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR', 'DISPATCHER'), async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ error: 'معرف الموظف مطلوب' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.attendance.findFirst({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: today, lt: tomorrow } },
  });

  if (!existing) return res.status(404).json({ error: 'لا يوجد سجل حضور اليوم' });

  const now = new Date().toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
  res.json(await prisma.attendance.update({
    where: { id: existing.id },
    data: { checkOut: now, status: 'out' },
  }));
});

router.post('/attendance/absent', requireRole('OWNER', 'BRANCH_MGR', 'TRAFFIC_MGR'), async (req, res) => {
  const { employeeId } = req.body;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.attendance.findFirst({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: today, lt: tomorrow } },
  });

  if (existing) {
    res.json(await prisma.attendance.update({ where: { id: existing.id }, data: { status: 'absent' } }));
  } else {
    res.json(await prisma.attendance.create({
      data: { ...scope(req), employeeId: +employeeId, status: 'absent' },
    }));
  }
});

// ===== الرواتب =====
router.get('/payroll', requireRole('OWNER', 'ACCOUNTANT'), async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7).replace('-', '/');

  const employees = await prisma.employee.findMany({
    where: { ...scope(req), status: 'ACTIVE' },
  });

  // احتساب أيام الغياب هذا الشهر
  const [year, mon] = month.split('/').map(Number);
  const startOfMonth = new Date(year, mon - 1, 1);
  const endOfMonth = new Date(year, mon, 1);

  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      ...scope(req),
      date: { gte: startOfMonth, lt: endOfMonth },
      status: 'absent',
    },
  });

  const absentMap = {};
  attendanceRecords.forEach(r => {
    absentMap[r.employeeId] = (absentMap[r.employeeId] || 0) + 1;
  });

  // التحقق من الرواتب المصروفة
  const paidRecords = await prisma.payroll.findMany({
    where: { ...scope(req), month },
  });
  const paidMap = {};
  paidRecords.forEach(r => { paidMap[r.employeeId] = r; });

  const result = employees.map(emp => {
    const absentDays = absentMap[emp.id] || 0;
    const dayRate = Math.round(emp.salary / 30);
    const deduction = absentDays * dayRate;
    const netSalary = emp.salary + emp.extra - deduction;
    const paidRecord = paidMap[emp.id];
    return {
      ...emp, absentDays, deduction, netSalary,
      paid: paidRecord?.paid || false,
      payrollId: paidRecord?.id || null,
    };
  });

  res.json(result);
});

router.post('/payroll/pay', requireRole('OWNER', 'ACCOUNTANT'), async (req, res) => {
  const { employeeId, month } = req.body;
  const emp = await prisma.employee.findFirst({ where: { id: +employeeId, ...scope(req) } });
  if (!emp) return res.status(404).json({ error: 'الموظف غير موجود' });

  const [year, mon] = (month || new Date().toISOString().slice(0, 7).replace('-', '/')).split('/').map(Number);
  const startOfMonth = new Date(year, mon - 1, 1);
  const endOfMonth = new Date(year, mon, 1);

  const absentCount = await prisma.attendance.count({
    where: { employeeId: +employeeId, ...scope(req), date: { gte: startOfMonth, lt: endOfMonth }, status: 'absent' },
  });

  const dayRate = Math.round(emp.salary / 30);
  const deduction = absentCount * dayRate;
  const netSalary = emp.salary + emp.extra - deduction;

  const existing = await prisma.payroll.findFirst({ where: { employeeId: +employeeId, ...scope(req), month } });
  if (existing) {
    res.json(await prisma.payroll.update({ where: { id: existing.id }, data: { paid: true } }));
  } else {
    res.json(await prisma.payroll.create({
      data: {
        ...scope(req), employeeId: +employeeId, month,
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
      ...scope(req), type: type || 'شاحنة',
      plate, driverId: driverId ? +driverId : null,
      odometer: odo, lastOilAt: odo,
    },
  }));
});

router.patch('/vehicles/:id/odometer', requireRole('OWNER', 'BRANCH_MGR', 'DISPATCHER'), async (req, res) => {
  const v = await prisma.vehicle.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });
  const newOdo = +req.body.odometer;
  if (newOdo < v.odometer) return res.status(400).json({ error: 'القراءة الجديدة يجب أن تكون أكبر من الحالية' });
  res.json(await prisma.vehicle.update({ where: { id: v.id }, data: { odometer: newOdo } }));
});

router.post('/vehicles/:id/oilchange', requireRole('OWNER', 'BRANCH_MGR', 'DISPATCHER'), async (req, res) => {
  const v = await prisma.vehicle.findFirst({ where: { id: +req.params.id, ...scope(req) } });
  if (!v) return res.status(404).json({ error: 'السيارة غير موجودة' });
  await prisma.vehicle.update({ where: { id: v.id }, data: { lastOilAt: v.odometer } });
  await prisma.maintenance.create({
    data: {
      ...scope(req), vehicleId: v.id,
      type: 'تغيير زيت وفلتر',
      details: `عند قراءة ${v.odometer} كم`,
      cost: req.body.cost ? +req.body.cost : 420,
    },
  });
  res.json({ ok: true });
});

// ===== الصيانة =====
router.get('/maintenance', async (req, res) => {
  res.json(await prisma.maintenance.findMany({
    where: scope(req),
    include: { vehicle: { select: { plate: true, type: true } } },
    orderBy: { date: 'desc' },
    take: 50,
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
    data: { ...scope(req), vehicleId: +vehicleId, type, details, cost: +cost },
  }));
});

module.exports = router;
