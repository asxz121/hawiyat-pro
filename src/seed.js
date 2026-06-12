// بيانات البداية: مدير المنصة + شركة تجريبية كاملة
require('dotenv').config();
const prisma = require('./db');
const { hash } = require('./auth');

async function main() {
  // مدير المنصة (أنت) — غيّر الرقم وكلمة المرور بعد أول دخول
  await prisma.user.upsert({
    where: { phone: '0500000000' },
    update: {},
    create: { name: 'مدير المنصة', phone: '0500000000', password: await hash('admin1234'), role: 'SUPER_ADMIN' },
  });

  // شركة تجريبية باشتراك سنة
  const expiresAt = new Date(); expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  let demo = await prisma.company.findFirst({ where: { name: 'شركة التجربة للحاويات' } });
  if (!demo) {
    demo = await prisma.company.create({
      data: {
        name: 'شركة التجربة للحاويات', status: 'ACTIVE', expiresAt, phone: '0551112222',
        branches: { create: { name: 'الفرع الرئيسي' } },
        users: { create: { name: 'مدير الشركة التجريبية', phone: '0511111111', password: await hash('owner1234'), role: 'OWNER' } },
        containers: { create: [
          { code: 'HW-101', size: '8 ياردة' },
          { code: 'HW-102', size: '12 ياردة' },
          { code: 'HW-205', size: '20 ياردة' },
        ]},
      },
    });
    // طلب يستحق غداً — لترى تنبيه «خلال يومين» يعمل فوراً
    const c = await prisma.container.findFirst({ where: { companyId: demo.id, code: 'HW-101' } });
    await prisma.order.create({
      data: {
        companyId: demo.id, containerId: c.id, type: 'DROP', status: 'ASSIGNED',
        customerName: 'مؤسسة البنيان', phone1: '0553334444', phoneSite: '0555556666',
        lat: 24.8485, lng: 46.6480, address: 'حي النرجس، الرياض',
        contractNo: 'CT-2026-001', dueDate: new Date(Date.now() + 86400000), price: 600,
      },
    });
  }

  console.log('✓ تم تجهيز البيانات:');
  console.log('  مدير المنصة → جوال: 0500000000 | كلمة المرور: admin1234');
  console.log('  مدير الشركة التجريبية → جوال: 0511111111 | كلمة المرور: owner1234');
}

main().finally(() => prisma.$disconnect());
