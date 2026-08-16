const jwt = require('jsonwebtoken');

// دوال الصلاحيات المسموحة
const PERMISSIONS = {
  OWNER:       ['dash','alerts','orders','containers','employees','shifts','attendance','payroll','vehicles','maintenance','reports','accounting','daily','warehouses','users'],
  BRANCH_MGR:  ['dash','alerts','orders','containers','employees','shifts','attendance','vehicles','maintenance'],
  TRAFFIC_MGR: ['dash','alerts','orders','containers','attendance','vehicles','maintenance','reports','warehouses'],
  DISPATCHER:  ['dash','alerts','orders','containers'],
  ACCOUNTANT:  ['dash','payroll','accounting','daily'],
  DRIVER:      ['dash','orders'],
};

// 1. Middleware للتحقق من توكن المستخدم
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يجب تسجيل الدخول' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // إضافة بيانات المستخدم إلى الطلب
    next();
  } catch (err) {
    return res.status(401).json({ error: 'توكن غير صالح أو منتهي الصلاحية' });
  }
};

// 2. Middleware للتحقق من الصلاحية (Role Based Access Control)
const checkPermission = (requiredPage) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    const allowedPages = PERMISSIONS[userRole] || [];
    
    if (!allowedPages.includes(requiredPage)) {
      return res.status(403).json({ error: 'ممنوع: ليس لديك صلاحية للوصول لهذا القسم' });
    }
    next();
  };
};

module.exports = { verifyToken, checkPermission };
