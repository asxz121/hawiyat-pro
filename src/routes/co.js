const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { verifyToken, checkPermission } = require('../middleware/auth');

// ==========================================
// مسارات الشركة (الحاويات، الطلبات، المستودعات)
// ==========================================

// ----- الحاويات -----
router.get('/containers', verifyToken, checkPermission('containers'), async (req, res) => {
  try {
    const containers = await prisma.container.findMany({
      where: { companyId: req.user.companyId }
    });
    res.json(containers);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب الحاويات' });
  }
});

router.post('/containers', verifyToken, checkPermission('containers'), async (req, res) => {
  try {
    const newContainer = await prisma.container.create({
      data: { ...req.body, companyId: req.user.companyId }
    });
    res.json(newContainer);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في إضافة الحاوية' });
  }
});

// ----- الطلبات -----
router.get('/orders', verifyToken, checkPermission('orders'), async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { companyId: req.user.companyId },
      include: { container: true }, select: { id: true, status: true, customerName: true, lat: true, lng: true, assignedTo: true }
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب الطلبات' });
  }
});

router.post('/orders', verifyToken, checkPermission('orders'), async (req, res) => {
  try {
    const newOrder = await prisma.order.create({
      data: { ...req.body, companyId: req.user.companyId }
    });
    res.json(newOrder);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
  }
});

// ----- المستودعات -----
router.get('/warehouses', verifyToken, checkPermission('warehouses'), async (req, res) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: req.user.companyId },
      include: { containers: true }
    });
    res.json(warehouses);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب المستودعات' });
  }
});

router.post('/warehouses', verifyToken, checkPermission('warehouses'), async (req, res) => {
  try {
    const newWh = await prisma.warehouse.create({
      data: { ...req.body, companyId: req.user.companyId }
    });
    res.json(newWh);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في إضافة المستودع' });
  }
});

// ----- التنبيهات -----
router.get('/alerts', verifyToken, checkPermission('alerts'), async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { companyId: req.user.companyId, acknowledged: false },
      orderBy: { createdAt: 'desc' }
    });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب التنبيهات' });
  }
});

router.post('/alerts/:id/ack', verifyToken, checkPermission('alerts'), async (req, res) => {
  try {
    await prisma.alert.update({
      where: { id: parseInt(req.params.id) },
      data: { acknowledged: true }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في تأكيد التنبيه' });
  }
});

module.exports = router;

// ----- تحديث حالة الطلب (للسائق ومدير الحركة) -----
router.patch('/orders/:id', verifyToken, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const updateData = req.body;
    
    // التأكد من أن الطلب يخص نفس الشركة
    const existingOrder = await prisma.order.findFirst({
      where: { id: orderId, companyId: req.user.companyId }
    });
    
    if (!existingOrder) {
      return res.status(404).json({ error: 'الطلب غير موجود' });
    }

    // تحديث الطلب
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'خطأ في تحديث الطلب' });
  }
});

// ----- إسناد طلب لسائق -----
router.post('/orders/:id/assign', verifyToken, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { driverId } = req.body;

    const updatedOrder = await prisma.order.update({
      where: { id: orderId, companyId: req.user.companyId },
      data: { 
        assignedTo: driverId || null,
        status: driverId ? 'ASSIGNED' : 'NEW'
      }
    });

    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في إسناد الطلب' });
  }
});

// ----- جلب طلب واحد (مستخدم للخريطة) -----
router.get('/orders/:id', verifyToken, async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: parseInt(req.params.id), companyId: req.user.companyId },
      select: { id: true, lat: true, lng: true, customerName: true, status: true }
    });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'خطأ في جلب الطلب' });
  }
});

// ----- جلب الحاويات مع مواقعها للخريطة -----
