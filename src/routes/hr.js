const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { verifyToken, checkPermission } = require('../middleware/auth');

const todayRange = () => {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  return { today, tomorrow };
};

// ===== الموظفون =====
router.get('/employees', verifyToken, checkPermission('employees'), async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.user.companyId },
      include: { attendance: true }
    });
    res.json(employees);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الموظفين' }); }
});

router.post('/employees', verifyToken, checkPermission('employees'), async (req, res) => {
  try {
    const b = req.body;
    const data = {
      name: b.name, role: b.role || 'عامل', phone: b.phone || null,
      shift: b.shift || 'MORNING', salary: parseFloat(b.salary) || 0,
      extra: parseFloat(b.extra) || 0, hiredAt: b.hiredAt || null,
      companyId: req.user.companyId, createdBy: req.user.id
    };
    const newEmp = await prisma.employee.create({ data });
    res.json(newEmp);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة الموظف' }); }
});

// ===== الحضور =====
router.get('/attendance', verifyToken, checkPermission('attendance'), async (req, res) => {
  try {
    const { today, tomorrow } = todayRange();
    const employees = await prisma.employee.findMany({
      where: { companyId: req.user.companyId },
      include: { attendance: { where: { date: { gte: today, lt: tomorrow } }, take: 1, orderBy: { date: 'desc' } } }
    });
    const result = employees.map(e => ({
      id: e.id, name: e.name, shift: e.shift,
      attendance: e.attendance && e.attendance[0] ? {
        status: e.attendance[0].status, checkIn: e.attendance[0].checkIn, checkOut: e.attendance[0].checkOut
      } : { status: 'none' }
    }));
    res.json(result);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الحضور' }); }
});

async function getOrCreateToday(employeeId, companyId, userId) {
  const { today, tomorrow } = todayRange();
  let rec = await prisma.attendance.findFirst({ where: { employeeId, date: { gte: today, lt: tomorrow } } });
  if (!rec) rec = await prisma.attendance.create({ data: { employeeId, companyId, status: 'none', createdBy: userId } });
  return rec;
}

router.post('/attendance/checkin', verifyToken, checkPermission('attendance'), async (req, res) => {
  try {
    const employeeId = parseInt(req.body.employeeId);
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const rec = await getOrCreateToday(employeeId, req.user.companyId, req.user.id);
    await prisma.attendance.update({ where: { id: rec.id }, data: { checkIn: now, status: 'in' } });
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تسجيل الحضور' }); }
});

router.post('/attendance/checkout', verifyToken, checkPermission('attendance'), async (req, res) => {
  try {
    const employeeId = parseInt(req.body.employeeId);
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const rec = await getOrCreateToday(employeeId, req.user.companyId, req.user.id);
    await prisma.attendance.update({ where: { id: rec.id }, data: { checkOut: now, status: 'out' } });
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تسجيل الانصراف' }); }
});

router.post('/attendance/absent', verifyToken, checkPermission('attendance'), async (req, res) => {
  try {
    const employeeId = parseInt(req.body.employeeId);
    const rec = await getOrCreateToday(employeeId, req.user.companyId, req.user.id);
    await prisma.attendance.update({ where: { id: rec.id }, data: { status: 'absent' } });
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في تسجيل الغياب' }); }
});

// ===== الرواتب =====
router.get('/payroll', verifyToken, checkPermission('payroll'), async (req, res) => {
  try {
    const payroll = await prisma.payroll.findMany({
      where: { companyId: req.user.companyId, ...(req.query.month ? { month: req.query.month } : {}) },
      include: { employee: true }
    });
    res.json(payroll);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الرواتب' }); }
});

router.post('/payroll/pay', verifyToken, checkPermission('payroll'), async (req, res) => {
  try {
    const id = parseInt(req.body.id || req.body.payrollId);
    const rec = await prisma.payroll.findFirst({ where: { id, companyId: req.user.companyId } });
    if (!rec) return res.status(404).json({ error: 'سجل الراتب غير موجود' });
    const updated = await prisma.payroll.update({ where: { id }, data: { paid: true } });
    res.json(updated);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في دفع الراتب' }); }
});

router.post('/payroll/cancel', verifyToken, checkPermission('payroll'), async (req, res) => {
  try {
    const id = parseInt(req.body.id || req.body.payrollId);
    const rec = await prisma.payroll.findFirst({ where: { id, companyId: req.user.companyId } });
    if (!rec) return res.status(404).json({ error: 'سجل الراتب غير موجود' });
    const updated = await prisma.payroll.update({ where: { id }, data: { paid: false } });
    res.json(updated);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إلغاء دفع الراتب' }); }
});

// ===== المركبات =====
router.get('/vehicles', verifyToken, checkPermission('vehicles'), async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { companyId: req.user.companyId },
      include: { driver: { select: { id: true, name: true } } }
    });
    res.json(vehicles);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب المركبات' }); }
});

router.post('/vehicles', verifyToken, checkPermission('vehicles'), async (req, res) => {
  try {
    const b = req.body;
    const data = {
      type: b.type, plate: b.plate, driverId: b.driverId ? parseInt(b.driverId) : null,
      odometer: parseFloat(b.odometer) || 0, lastOilAt: parseFloat(b.lastOilAt) || 0,
      oilInterval: parseFloat(b.oilInterval) || 5000, companyId: req.user.companyId, createdBy: req.user.id
    };
    const v = await prisma.vehicle.create({ data });
    res.json(v);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة المركبة' }); }
});

// ===== الصيانة =====
router.get('/maintenance', verifyToken, checkPermission('maintenance'), async (req, res) => {
  try {
    const items = await prisma.maintenance.findMany({
      where: { companyId: req.user.companyId },
      include: { vehicle: { select: { id: true, plate: true, type: true } } },
      orderBy: { date: 'desc' }
    });
    res.json(items);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب الصيانة' }); }
});

router.post('/maintenance', verifyToken, checkPermission('maintenance'), async (req, res) => {
  try {
    const b = req.body;
    const data = {
      vehicleId: parseInt(b.vehicleId), type: b.type, details: b.details || null,
      cost: parseFloat(b.cost) || 0, status: b.status || 'مكتملة',
      companyId: req.user.companyId, createdBy: req.user.id
    };
    const m = await prisma.maintenance.create({ data });
    res.json(m);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة الصيانة' }); }
});

// ===== معاملات الموظفين المالية =====
router.get('/transactions', verifyToken, checkPermission('payroll'), async (req, res) => {
  try {
    const where = { companyId: req.user.companyId };
    if (req.query.employeeId) where.employeeId = parseInt(req.query.employeeId);
    if (req.query.month) where.month = req.query.month;
    const items = await prisma.employeeTransaction.findMany({
      where, include: { employee: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }
    });
    res.json(items);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في جلب المعاملات' }); }
});

router.post('/transactions', verifyToken, checkPermission('payroll'), async (req, res) => {
  try {
    const b = req.body;
    const data = {
      employeeId: parseInt(b.employeeId), type: b.type, amount: parseFloat(b.amount) || 0,
      days: b.days != null ? parseFloat(b.days) : null, month: b.month || null,
      note: b.note || null, companyId: req.user.companyId, createdBy: req.user.id
    };
    const t = await prisma.employeeTransaction.create({ data });
    res.json(t);
  } catch (error) { console.error(error); res.status(500).json({ error: 'خطأ في إضافة المعاملة' }); }
});

module.exports = router;
