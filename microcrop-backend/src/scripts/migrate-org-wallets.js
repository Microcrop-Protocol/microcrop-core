/**
 * One-time migration script: Create Privy wallets for existing organizations
 * that have a deployed pool but no Privy wallet.
 *
 * Usage: node src/scripts/migrate-org-wallets.js
 */

import 'dotenv/config';
import prisma from '../config/database.js';
import { createOrgWallet } from '../blockchain/wallet-manager.js';
import * as poolWriter from '../blockchain/writers/pool.writer.js';

async function migrate() {
  const orgs = await prisma.organization.findMany({
    where: {
      poolAddress: { not: null },
      privyWalletId: null,
    },
  });

  console.log(`Found ${orgs.length} organizations to migrate`);

  for (const org of orgs) {
    try {
      console.log(`Migrating org: ${org.name} (${org.id})`);

      // 1. Create Privy wallet
      const wallet = await createOrgWallet();
      console.log(`  Created wallet: ${wallet.address}`);

      // 2. Whitelist on pool
      try {
        await poolWriter.addDepositor(org.poolAddress, wallet.address);
        console.log(`  Whitelisted on pool: ${org.poolAddress}`);
      } catch (err) {
        console.warn(`  Warning: Failed to whitelist (may be public pool): ${err.message}`);
      }

      // 3. Update DB
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          privyWalletId: wallet.walletId,
          walletAddress: wallet.address,
        },
      });

      console.log(`  Migration complete for ${org.name}`);
    } catch (error) {
      console.error(`  Failed to migrate ${org.name}: ${error.message}`);
    }
  }

  console.log('Migration finished');
  await prisma.$disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
