const express = require('express');
const router = express.Router();

// استيراد المسارات
const hrRoutes = require('./hr');
const accountingRoutes = require('./accounting');
const coRoutes = require('./co');
// const orderRoutes = require('./orders'); // سننشئها لاحقاً

// تعريف المسارات
router.use('/hr', hrRoutes);
router.use('/accounting', accountingRoutes);
router.use('/co', coRoutes);
// router.use('/orders', orderRoutes);

module.exports = router;
