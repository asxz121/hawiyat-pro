// المهام المجدولة: فحص الاشتراكات يومياً + استحقاق الحاويات كل 6 ساعات
const cron = require('node-cron');
const prisma = require('./db');
const fs = require('fs');
const path = require('path');

const DUE_HOURS = 48;      // التنبيه قبل الاستحقاق بيومين
const REPEAT_CRON = '0 */6 * * *'; // يتكرر كل 6 ساعات حتى «تم الاطلاع» أو الكتم

// هنا تربط لاحقاً واتساب أو إيميل — حالياً يسجل في الكونسول وجدول التنبيهات
async function notify(companyId, type, message, refOrderId = null) {
  await prisma.alert.create({ data: { companyId, type, message, refOrderId } });
  console.log(`[تنبيه][شركة ${companyId}] ${message}`);
}

// 1) استحقاق الحاويات: كل 6 ساعات
async function checkDueOrders() {
  const limit = new Date(Date.now() + DUE_HOURS * 3600 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      dueDate: { lte: limit, gte: new Date(Date.now() - 7 * 86400000) }, // المستحقة قريباً أو المتأخرة حتى أسبوع
      status: { in: ['NEW', 'ASSIGNED', 'EN_ROUTE'] },
      alertMuted: false, // المكتومة لا تنبّه
    },
    include: { container: true, company: { select: { status: true } } },
  });
  for (const o of orders) {
    if (o.company.status !== 'ACTIVE') continue;
    // لا نكرر إن وُجد تنبيه غير مطّلع عليه لنفس الطلب (سيظل ظاهراً)؛
    // وإن اطُّلع على السابق يُنشأ جديد في الدورة التالية — هذا هو التكرار كل 6 ساعات
    const open = await prisma.alert.findFirst({ where: { refOrderId: o.id, acknowledged: false } });
    if (open) continue;
    const late = o.dueDate < new Date();
    await notify(o.companyId, 'DUE_SOON',
      late
        ? `⚠ الحاوية ${o.container?.code || o.size || ''} لدى ${o.customerName} تجاوزت الاستحقاق — جدولة الرفع فوراً`
        : `حاوية ${o.container?.code || o.size || ''} لدى ${o.customerName} يستحق رفعها خلال يومين (${o.dueDate.toLocaleDateString('ar-SA')})`,
      o.id);
  }
}

// 2) الاشتراكات: يومياً الساعة 8 صباحاً
async function checkSubscriptions() {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);

  // قبل الانتهاء بأسبوع — تذكير سداد
  const expiring = await prisma.company.findMany({
    where: { status: 'ACTIVE', expiresAt: { gte: now, lte: weekAhead } },
  });
  for (const c of expiring)
    await notify(c.id, 'SUBSCRIPTION',
      `ينتهي اشتراك «${c.name}» في ${c.expiresAt.toLocaleDateString('ar-SA')} — فضلاً سدد قبل الإيقاف`);

  // المنتهية — إيقاف تلقائي مع حفظ البيانات
  const { count } = await prisma.company.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    data: { status: 'SUSPENDED' },
  });
  if (count) console.log(`[اشتراكات] تم إيقاف ${count} شركة منتهية الاشتراك (البيانات محفوظة)`);
}

// 3) حذف صور الطلبات الأقدم من 20 يوم
const PHOTO_MAX_DAYS = 20;
async function cleanOldPhotos() {
  const baseDir = path.join(__dirname, '..', 'public', 'uploads', 'orders');
  if (!fs.existsSync(baseDir)) return;
  const cutoff = Date.now() - PHOTO_MAX_DAYS * 86400000;
  let deleted = 0;
  const affectedOrders = new Set();

  for (const orderId of fs.readdirSync(baseDir)) {
    const orderDir = path.join(baseDir, orderId);
    let stat;
    try { stat = fs.statSync(orderDir); } catch { continue; }
    if (!stat.isDirectory()) continue;

    for (const file of fs.readdirSync(orderDir)) {
      const fp = path.join(orderDir, file);
      try {
        const fstat = fs.statSync(fp);
        if (fstat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          deleted++;
          affectedOrders.add(parseInt(orderId));
        }
      } catch {}
    }
    // حذف المجلد لو صار فارغاً
    try { if (fs.readdirSync(orderDir).length === 0) fs.rmdirSync(orderDir); } catch {}
  }

  // تنظيف مسارات الصور المحذوفة من الطلبات
  for (const oid of affectedOrders) {
    try {
      const o = await prisma.order.findUnique({ where: { id: oid }, select: { photos: true } });
      if (o && Array.isArray(o.photos) && o.photos.length) {
        const remaining = o.photos.filter(p => {
          const abs = path.join(__dirname, '..', 'public', p.replace(/^\//, ''));
          return fs.existsSync(abs);
        });
        if (remaining.length !== o.photos.length) {
          await prisma.order.update({ where: { id: oid }, data: { photos: remaining } });
        }
      }
    } catch (e) { console.error('تنظيف صور الطلب', oid, e.message); }
  }

  if (deleted) console.log(`[صور] حُذفت ${deleted} صورة أقدم من ${PHOTO_MAX_DAYS} يوم`);
}

function startJobs() {
  cron.schedule(REPEAT_CRON, checkDueOrders);
  cron.schedule('0 8 * * *', checkSubscriptions);
  cron.schedule('0 4 * * *', cleanOldPhotos);
  // تشغيل فوري عند الإقلاع حتى ترى التنبيهات في التجارب مباشرة
  checkDueOrders().catch(console.error);
  checkSubscriptions().catch(console.error);
  cleanOldPhotos().catch(console.error);
  console.log('✓ المهام المجدولة تعمل: الاستحقاق كل 6 ساعات، الاشتراكات 8ص، حذف الصور القديمة 4ص');
}

module.exports = { startJobs };
