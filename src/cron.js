// المهام المجدولة: فحص الاشتراكات يومياً + استحقاق الحاويات كل 6 ساعات
const cron = require('node-cron');
const prisma = require('./db');

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

function startJobs() {
  cron.schedule(REPEAT_CRON, checkDueOrders);
  cron.schedule('0 8 * * *', checkSubscriptions);
  // تشغيل فوري عند الإقلاع حتى ترى التنبيهات في التجارب مباشرة
  checkDueOrders().catch(console.error);
  checkSubscriptions().catch(console.error);
  console.log('✓ المهام المجدولة تعمل: الاستحقاق كل 6 ساعات، الاشتراكات يومياً 8 صباحاً');
}

module.exports = { startJobs };
