export const GRADUAL_DELIVERY_MIN_PERCENTAGE = 1;
export const GRADUAL_DELIVERY_MAX_PERCENTAGE = 50;

export const GRADUAL_DELIVERY_INTERVAL_MINUTES = {
  minute: 1,
  hour: 60,
} as const;

export type GradualDeliveryInterval =
  keyof typeof GRADUAL_DELIVERY_INTERVAL_MINUTES;

export function calculateGradualDelivery({
  audienceSize,
  batchPercentage,
  intervalMinutes,
  startsAt,
}: {
  audienceSize: number;
  batchPercentage: number;
  intervalMinutes: number;
  startsAt: Date;
}) {
  if (!Number.isInteger(audienceSize) || audienceSize < 0) {
    throw new Error("Audience size must be a non-negative integer");
  }

  if (
    !Number.isInteger(batchPercentage) ||
    batchPercentage < GRADUAL_DELIVERY_MIN_PERCENTAGE ||
    batchPercentage > GRADUAL_DELIVERY_MAX_PERCENTAGE
  ) {
    throw new Error(
      `Batch percentage must be between ${GRADUAL_DELIVERY_MIN_PERCENTAGE} and ${GRADUAL_DELIVERY_MAX_PERCENTAGE}`,
    );
  }

  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error("Delivery interval must be a positive number of minutes");
  }

  const batchSize =
    audienceSize === 0
      ? 0
      : Math.max(1, Math.ceil((audienceSize * batchPercentage) / 100));
  const totalBatches =
    batchSize === 0 ? 0 : Math.ceil(audienceSize / batchSize);
  const durationMinutes = Math.max(0, totalBatches - 1) * intervalMinutes;
  const completesAt = new Date(
    startsAt.getTime() + durationMinutes * 60 * 1000,
  );

  return {
    batchSize,
    totalBatches,
    durationMinutes,
    completesAt,
  };
}
