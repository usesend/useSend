import type { CampaignScheduleInput } from "~/server/public-api/schemas/campaign-schema";
import type { CampaignDeliveryInput as ServiceCampaignDeliveryInput } from "~/server/service/campaign-service";

export function toServiceDelivery(
  delivery: CampaignScheduleInput["delivery"],
): ServiceCampaignDeliveryInput | undefined {
  if (!delivery) {
    return undefined;
  }

  if (delivery.strategy === "all_at_once") {
    return { strategy: "ALL_AT_ONCE" };
  }

  return {
    strategy: "GRADUAL",
    batchPercentage: delivery.batchPercentage,
    interval: delivery.interval,
  };
}
