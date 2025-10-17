"""Campaign resource client using TypedDict shapes (no Pydantic)."""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from .types import (
    APIError,
    Campaign,
    CampaignCreate,
    CampaignCreateResponse,
    CampaignSchedule,
    CampaignScheduleResponse,
    CampaignActionResponse,
)


class Campaigns:
    """Client for `/campaigns` endpoints."""

    def __init__(self, usesend: "UseSend") -> None:
        self.usesend = usesend

    def create(
        self, payload: CampaignCreate
    ) -> Tuple[Optional[CampaignCreateResponse], Optional[APIError]]:
        data, err = self.usesend.post(
            "/campaigns",
            payload,
        )
        return (data, err)  # type: ignore[return-value]

    def get(
        self, campaign_id: str
    ) -> Tuple[Optional[Campaign], Optional[APIError]]:
        data, err = self.usesend.get(
            f"/campaigns/{campaign_id}"
        )
        return (data, err)  # type: ignore[return-value]

    def schedule(
        self, campaign_id: str, payload: CampaignSchedule
    ) -> Tuple[Optional[CampaignScheduleResponse], Optional[APIError]]:
        data, err = self.usesend.post(
            f"/campaigns/{campaign_id}/schedule",
            payload,
        )
        return (data, err)  # type: ignore[return-value]

    def pause(
        self, campaign_id: str
    ) -> Tuple[Optional[CampaignActionResponse], Optional[APIError]]:
        data, err = self.usesend.post(
            f"/campaigns/{campaign_id}/pause",
            {},
        )
        return (data, err)  # type: ignore[return-value]

    def resume(
        self, campaign_id: str
    ) -> Tuple[Optional[CampaignActionResponse], Optional[APIError]]:
        data, err = self.usesend.post(
            f"/campaigns/{campaign_id}/resume",
            {},
        )
        return (data, err)  # type: ignore[return-value]


from .usesend import UseSend  # noqa: E402  pylint: disable=wrong-import-position