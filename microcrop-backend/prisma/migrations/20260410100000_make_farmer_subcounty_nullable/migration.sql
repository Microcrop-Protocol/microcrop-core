-- AlterTable: subCounty is optional during bulk farmer import (matches ward/village)
ALTER TABLE "Farmer" ALTER COLUMN "subCounty" DROP NOT NULL;
