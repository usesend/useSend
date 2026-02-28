-- AlterTable
ALTER TABLE "ContactBook" ADD COLUMN     "variables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
