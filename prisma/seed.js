const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Seed Roles
  await prisma.role.createMany({
    data: [
      { rolename: 'admin' },
      { rolename: 'customer' },
    ],
    skipDuplicates: true,
  });

  // 2. Seed Memberships
  await prisma.membership.createMany({
    data: [
      { mname: 'Bronze', score: 0 },
      { mname: 'Silver', score: 100 },
      { mname: 'Gold', score: 500 },
    ],
    skipDuplicates: true,
  });

  console.log('Seed dữ liệu thành công!');
}

main()
  .catch((e) => {
    console.error('Lỗi chi tiết khi seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });