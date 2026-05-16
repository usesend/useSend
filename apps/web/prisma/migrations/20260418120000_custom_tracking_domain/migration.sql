-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "customTrackingHostname" TEXT,
ADD COLUMN     "customTrackingPublicKey" TEXT,
ADD COLUMN     "customTrackingDkimSelector" TEXT DEFAULT 'utrack',
ADD COLUMN     "customTrackingDkimStatus" TEXT,
ADD COLUMN     "customTrackingStatus" "DomainStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "trackingConfigGeneral" TEXT,
ADD COLUMN     "trackingConfigClick" TEXT,
ADD COLUMN     "trackingConfigOpen" TEXT,
ADD COLUMN     "trackingConfigFull" TEXT;
