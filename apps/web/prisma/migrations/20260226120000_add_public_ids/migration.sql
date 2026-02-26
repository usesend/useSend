-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "publicId" TEXT;

-- AlterTable
ALTER TABLE "Domain" ADD COLUMN "publicId" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "publicId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "publicId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_publicId_key" ON "ApiKey"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_publicId_key" ON "Domain"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_publicId_key" ON "Team"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");
