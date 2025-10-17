import { UseSend } from "./usesend";
import { paths } from "../types/schema";
import { ErrorResponse } from "../types";

type CreateCampaignPayload =
  paths["/v1/campaigns"]["post"]["requestBody"]["content"]["application/json"];

type CreateCampaignResponse = {
  data: CreateCampaignResponseSuccess | null;
  error: ErrorResponse | null;
};

type CreateCampaignResponseSuccess =
  paths["/v1/campaigns"]["post"]["responses"]["200"]["content"]["application/json"];

type GetCampaignResponseSuccess =
  paths["/v1/campaigns/{campaignId}"]["get"]["responses"]["200"]["content"]["application/json"];

type GetCampaignResponse = {
  data: GetCampaignResponseSuccess | null;
  error: ErrorResponse | null;
};

type ScheduleCampaignPayload =
  paths["/v1/campaigns/{campaignId}/schedule"]["post"]["requestBody"]["content"]["application/json"];

type ScheduleCampaignResponseSuccess =
  paths["/v1/campaigns/{campaignId}/schedule"]["post"]["responses"]["200"]["content"]["application/json"];

type ScheduleCampaignResponse = {
  data: ScheduleCampaignResponseSuccess | null;
  error: ErrorResponse | null;
};

type CampaignActionResponseSuccess = { success: boolean };

type CampaignActionResponse = {
  data: CampaignActionResponseSuccess | null;
  error: ErrorResponse | null;
};

export class Campaigns {
  constructor(private readonly usesend: UseSend) {
    this.usesend = usesend;
  }

  async create(
    payload: CreateCampaignPayload,
  ): Promise<CreateCampaignResponse> {
    const data = await this.usesend.post<CreateCampaignResponseSuccess>(
      `/campaigns`,
      payload,
    );

    return data;
  }

  async get(campaignId: string): Promise<GetCampaignResponse> {
    const data = await this.usesend.get<GetCampaignResponseSuccess>(
      `/campaigns/${campaignId}`,
    );
    return data;
  }

  async schedule(
    campaignId: string,
    payload: ScheduleCampaignPayload,
  ): Promise<ScheduleCampaignResponse> {
    const data = await this.usesend.post<ScheduleCampaignResponseSuccess>(
      `/campaigns/${campaignId}/schedule`,
      payload,
    );

    return data;
  }

  async pause(campaignId: string): Promise<CampaignActionResponse> {
    const data = await this.usesend.post<CampaignActionResponseSuccess>(
      `/campaigns/${campaignId}/pause`,
      {},
    );

    return data;
  }

  async resume(campaignId: string): Promise<CampaignActionResponse> {
    const data = await this.usesend.post<CampaignActionResponseSuccess>(
      `/campaigns/${campaignId}/resume`,
      {},
    );

    return data;
  }
}
