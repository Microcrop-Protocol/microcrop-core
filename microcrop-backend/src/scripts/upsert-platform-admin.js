import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME || 'Admin';
  const lastName = process.env.ADMIN_LAST_NAME || 'User';

  if (!email || !password) {
    console.error('Usage: ADMIN_EMAIL=x ADMIN_PASSWORD=x node src/scripts/upsert-platform-admin.js');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: 'PLATFORM_ADMIN',
      isActive: true,
      emailVerified: true,
    },
    create: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'PLATFORM_ADMIN',
      isActive: true,
      emailVerified: true,
    },
  });

  console.log(`Platform admin upserted: ${user.email} (${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
