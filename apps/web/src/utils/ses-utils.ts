import { SesSettingsService } from "~/server/service/ses-settings-service";

export type DomainConfigurationSetPick = {
  clickTracking: boolean;
  openTracking: boolean;
  region: string;
  trackingConfigGeneral: string | null;
  trackingConfigClick: string | null;
  trackingConfigOpen: string | null;
  trackingConfigFull: string | null;
};

export async function getConfigurationSetName(
  domain: DomainConfigurationSetPick | null,
  regionFallback: string,
) {
  const region = domain?.region ?? regionFallback;
  const setting = await SesSettingsService.getSetting(region);

  if (!setting) {
    throw new Error(`No SES setting found for region: ${region}`);
  }

  const useCustom =
    domain &&
    domain.trackingConfigGeneral &&
    domain.trackingConfigClick &&
    domain.trackingConfigOpen &&
    domain.trackingConfigFull;

  if (useCustom) {
    if (domain.clickTracking && domain.openTracking) {
      return domain.trackingConfigFull;
    }
    if (domain.clickTracking) {
      return domain.trackingConfigClick;
    }
    if (domain.openTracking) {
      return domain.trackingConfigOpen;
    }
    return domain.trackingConfigGeneral;
  }

  if (domain?.clickTracking && domain?.openTracking) {
    return setting.configFull;
  }
  if (domain?.clickTracking) {
    return setting.configClick;
  }
  if (domain?.openTracking) {
    return setting.configOpen;
  }

  return setting.configGeneral;
}
