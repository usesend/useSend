-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "domainIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
