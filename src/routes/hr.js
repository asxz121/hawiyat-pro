const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { verifyToken, checkPermission } = require('../middleware/auth');

// ==========================================
// جميع مسارات الموارد البشرية (HR)
// ==========================================

// 1. جلب جميع الموظفين (يتطلب صلاحية dash أو employees)
router.get('/employees', verifyToken, checkPermission('employees'), async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.user.companyId },
      include: { attendance: true }
    });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب الموظفين' });
  }
});

// 2. إضافة موظف جديد
router.post('/employees', verifyToken, checkPermission('employees'), async (req, res) => {
  try {
    const newEmp = await prisma.employee.create({
      data: { ...req.body, companyId: req.user.companyId }
    });
    res.json(newEmp);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في إضافة الموظف' });
  }
});

// 3. جلب الحضور
router.get('/attendance', verifyToken, checkPermission('attendance'), async (req, res) => {
  try {
    const attendance = await prisma.attendance.findMany({
      where: { companyId: req.user.companyId },
      include: { employee: true }
    });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب الحضور' });
  }
});

// 4. تسجيل الحضور
router.post('/attendance/checkin', verifyToken, checkPermission('attendance'), async (req, res) => {
  try {
    const { employeeId } = req.body;
    const now = new Date().toLocaleTimeString('ar-SA');
    await prisma.attendance.upsert({
      where: { 
        employeeId_date: { 
          employeeId: parseInt(employeeId), 
          date: new Date(new Date().setHours(0,0,0,0)) 
        }
      },
      update: { checkIn: now, status: 'in' },
      create: { 
        employeeId: parseInt(employeeId), 
        companyId: req.user.companyId, 
        checkIn: now, 
        status: 'in' 
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في تسجيل الحضور' });
  }
});

// 5. جلب الرواتب
router.get('/payroll', verifyToken, checkPermission('payroll'), async (req, res) => {
  try {
    const payroll = await prisma.payroll.findMany({
      where: { companyId: req.user.companyId, month: req.query.month },
      include: { employee: true }
    });
    res.json(payroll);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب الرواتب' });
  }
});

module.exports = router;
