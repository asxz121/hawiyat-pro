const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error'],
});

// إعادة الاتصال عند الانقطاع
prisma.$connect().catch(e => console.error('DB connection error:', e));

module.exports = prisma;
