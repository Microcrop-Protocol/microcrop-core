import prisma from '../config/database.js';
import { KLIP_COUNTIES } from '../utils/ibli.constants.js';
import logger from '../utils/logger.js';

async function seedInsuranceUnits() {
  logger.info(`Seeding ${KLIP_COUNTIES.length} KLIP insurance units...`);

  let created = 0;
  let skipped = 0;

  for (const county of KLIP_COUNTIES) {
    const existing = await prisma.insuranceUnit.findUnique({
      where: { unitCode: county.unitCode },
    });

    if (existing) {
      logger.info(`Skipping ${county.unitCode} — already exists`);
      skipped++;
      continue;
    }

    await prisma.insuranceUnit.create({ data: county });
    logger.info(`Created insurance unit: ${county.county} (${county.unitCode})`);
    created++;
  }

  logger.info(`Seed complete: ${created} created, ${skipped} skipped`);
}

seedInsuranceUnits()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seed failed:', err);
    process.exit(1);
  });
