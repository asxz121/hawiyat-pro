const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { verifyToken, checkPermission } = require('../middleware/auth');

// ==========================================
// مسارات المحاسبة والمصروفات
// ==========================================

router.get('/expenses', verifyToken, checkPermission('accounting'), async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { date: 'desc' }
    });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب المصروفات' });
  }
});

router.post('/expenses', verifyToken, checkPermission('accounting'), async (req, res) => {
  try {
    const newExpense = await prisma.expense.create({
      data: { ...req.body, companyId: req.user.companyId }
    });
    res.json(newExpense);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في إضافة المصروف' });
  }
});

module.exports = router;
