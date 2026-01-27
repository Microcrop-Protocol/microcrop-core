import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateApiKey() {
  return `org_live_${crypto.randomBytes(32).toString('hex')}`;
}

function generateApiSecret() {
  return crypto.randomBytes(48).toString('hex');
}

async function main() {
  // Clean existing data
  await prisma.dailyPlatformStats.deleteMany();
  await prisma.dailyOrganizationStats.deleteMany();
  await prisma.satelliteData.deleteMany();
  await prisma.weatherEvent.deleteMany();
  await prisma.syncState.deleteMany();
  await prisma.uSSDSession.deleteMany();
  await prisma.platformFee.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.damageAssessment.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.plot.deleteMany();
  await prisma.farmer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const hashedPassword = await bcrypt.hash('Password123!', 12);

  // Create Organizations
  const kiambuSecret = generateApiSecret();
  const nakuruSecret = generateApiSecret();

  const kiambu = await prisma.organization.create({
    data: {
      name: 'Kiambu Farmers Cooperative',
      registrationNumber: 'COOP/2024/001',
      type: 'COOPERATIVE',
      brandName: 'Kiambu Farmers Insurance',
      ussdShortCode: '*384*100#',
      apiKey: generateApiKey(),
      apiSecret: await bcrypt.hash(kiambuSecret, 12),
      contactPerson: 'John Kamau',
      contactEmail: 'admin@kiambucooperative.org',
      contactPhone: '+254712345678',
      county: 'Kiambu',
      adminWallet: '0x1234567890abcdef1234567890abcdef12345678',
      isActive: true,
    },
  });

  const nakuru = await prisma.organization.create({
    data: {
      name: 'Nakuru Agricultural NGO',
      registrationNumber: 'NGO/2024/002',
      type: 'NGO',
      brandName: 'Nakuru Crop Protection',
      ussdShortCode: '*384*200#',
      apiKey: generateApiKey(),
      apiSecret: await bcrypt.hash(nakuruSecret, 12),
      contactPerson: 'Mary Wanjiku',
      contactEmail: 'admin@nakurungo.org',
      contactPhone: '+254722345678',
      county: 'Nakuru',
      adminWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isActive: true,
    },
  });

  // Create Platform Admin
  const platformAdmin = await prisma.user.create({
    data: {
      email: 'admin@microcrop.com',
      password: hashedPassword,
      firstName: 'Platform',
      lastName: 'Admin',
      role: 'PLATFORM_ADMIN',
      isActive: true,
      emailVerified: true,
    },
  });

  // Create Org Admins
  const kiambuAdmin = await prisma.user.create({
    data: {
      email: 'admin@kiambucooperative.org',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Kamau',
      role: 'ORG_ADMIN',
      organizationId: kiambu.id,
      isActive: true,
      emailVerified: true,
    },
  });

  const nakuruAdmin = await prisma.user.create({
    data: {
      email: 'admin@nakurungo.org',
      password: hashedPassword,
      firstName: 'Mary',
      lastName: 'Wanjiku',
      role: 'ORG_ADMIN',
      organizationId: nakuru.id,
      isActive: true,
      emailVerified: true,
    },
  });

  // Create Farmers for Kiambu
  const farmer1 = await prisma.farmer.create({
    data: {
      organizationId: kiambu.id,
      phoneNumber: '+254700100001',
      nationalId: '30000001',
      firstName: 'Jane',
      lastName: 'Mwangi',
      county: 'Kiambu',
      subCounty: 'Kikuyu',
      ward: 'Kinoo',
      village: 'Kinoo Village',
      kycStatus: 'APPROVED',
      kycApprovedBy: kiambuAdmin.id,
      kycApprovedAt: new Date(),
    },
  });

  const farmer2 = await prisma.farmer.create({
    data: {
      organizationId: kiambu.id,
      phoneNumber: '+254700100002',
      nationalId: '30000002',
      firstName: 'Peter',
      lastName: 'Njoroge',
      county: 'Kiambu',
      subCounty: 'Thika',
      ward: 'Township',
      kycStatus: 'APPROVED',
      kycApprovedBy: kiambuAdmin.id,
      kycApprovedAt: new Date(),
    },
  });

  // Create Farmer for Nakuru
  const farmer3 = await prisma.farmer.create({
    data: {
      organizationId: nakuru.id,
      phoneNumber: '+254700200001',
      nationalId: '40000001',
      firstName: 'Grace',
      lastName: 'Akinyi',
      county: 'Nakuru',
      subCounty: 'Nakuru Town East',
      ward: 'Biashara',
      kycStatus: 'APPROVED',
      kycApprovedBy: nakuruAdmin.id,
      kycApprovedAt: new Date(),
    },
  });

  // Create Plots
  await prisma.plot.create({
    data: {
      farmerId: farmer1.id,
      organizationId: kiambu.id,
      name: 'North Field',
      latitude: -1.286389,
      longitude: 36.817223,
      acreage: 2.5,
      cropType: 'MAIZE',
      plantingDate: new Date('2026-01-15'),
    },
  });

  await prisma.plot.create({
    data: {
      farmerId: farmer2.id,
      organizationId: kiambu.id,
      name: 'East Plot',
      latitude: -1.0332,
      longitude: 37.0693,
      acreage: 1.8,
      cropType: 'BEANS',
    },
  });

  await prisma.plot.create({
    data: {
      farmerId: farmer3.id,
      organizationId: nakuru.id,
      name: 'Lake View Farm',
      latitude: -0.3031,
      longitude: 36.0800,
      acreage: 3.0,
      cropType: 'WHEAT',
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed data created:');
  // eslint-disable-next-line no-console
  console.log(`  Organizations: ${kiambu.name}, ${nakuru.name}`);
  // eslint-disable-next-line no-console
  console.log(`  Users: ${platformAdmin.email}, ${kiambuAdmin.email}, ${nakuruAdmin.email}`);
  // eslint-disable-next-line no-console
  console.log(`  Farmers: ${farmer1.firstName}, ${farmer2.firstName}, ${farmer3.firstName}`);
  // eslint-disable-next-line no-console
  console.log(`  Kiambu API Key: ${kiambu.apiKey}`);
  // eslint-disable-next-line no-console
  console.log(`  Nakuru API Key: ${nakuru.apiKey}`);
  // eslint-disable-next-line no-console
  console.log('  Default password for all users: Password123!');
}

main()
  .catch((e) => {
    console.error(e); // eslint-disable-line no-console
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
