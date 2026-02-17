import { paths } from "../types/schema";
import { ErrorResponse } from "../types";
import { UseSend } from "./usesend";

type EmailTimeSeriesQuery =
  paths["/v1/analytics/email-time-series"]["get"]["parameters"]["query"];

type EmailTimeSeriesResponseSuccess =
  paths["/v1/analytics/email-time-series"]["get"]["responses"]["200"]["content"]["application/json"];

type EmailTimeSeriesResponse = {
  data: EmailTimeSeriesResponseSuccess | null;
  error: ErrorResponse | null;
};

type ReputationMetricsQuery =
  paths["/v1/analytics/reputation-metrics"]["get"]["parameters"]["query"];

type ReputationMetricsResponseSuccess =
  paths["/v1/analytics/reputation-metrics"]["get"]["responses"]["200"]["content"]["application/json"];

type ReputationMetricsResponse = {
  data: ReputationMetricsResponseSuccess | null;
  error: ErrorResponse | null;
};

export class Analytics {
  constructor(private readonly usesend: UseSend) {
    this.usesend = usesend;
  }

  async emailTimeSeries(
    query?: EmailTimeSeriesQuery,
  ): Promise<EmailTimeSeriesResponse> {
    const params = new URLSearchParams();
    if (query?.days) params.set("days", query.days);
    if (query?.domainId) params.set("domainId", query.domainId);

    const qs = params.toString();
    const path = `/analytics/email-time-series${qs ? `?${qs}` : ""}`;

    return this.usesend.get<EmailTimeSeriesResponseSuccess>(path);
  }

  async reputationMetrics(
    query?: ReputationMetricsQuery,
  ): Promise<ReputationMetricsResponse> {
    const params = new URLSearchParams();
    if (query?.domainId) params.set("domainId", query.domainId);

    const qs = params.toString();
    const path = `/analytics/reputation-metrics${qs ? `?${qs}` : ""}`;

    return this.usesend.get<ReputationMetricsResponseSuccess>(path);
  }
}
