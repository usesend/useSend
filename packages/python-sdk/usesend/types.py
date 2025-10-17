"""TypedDict models for the UseSend API.

Lightweight, Pydantic-free types for editor autocomplete and static checks.
At runtime these are plain dicts and lists.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Union, TypedDict
from typing_extensions import NotRequired, Required, Literal

# ---------------------------------------------------------------------------
# Domains
# ---------------------------------------------------------------------------

DomainStatus = Literal[
    "NOT_STARTED",
    "PENDING",
    "SUCCESS",
    "FAILED",
    "TEMPORARY_FAILURE",
]

DNSRecordType = Literal["MX", "TXT"]


class DNSRecord(TypedDict, total=False):
    type: DNSRecordType
    name: str
    value: str
    ttl: str
    priority: Optional[str]
    status: DomainStatus
    recommended: Optional[bool]


DNSRecords = List[DNSRecord]


class Domain(TypedDict, total=False):
    id: float
    name: str
    teamId: float
    status: DomainStatus
    region: str
    clickTracking: bool
    openTracking: bool
    publicKey: str
    dkimStatus: Optional[str]
    spfDetails: Optional[str]
    createdAt: str
    updatedAt: str
    dmarcAdded: bool
    isVerifying: bool
    errorMessage: Optional[str]
    subdomain: Optional[str]
    verificationError: Optional[str]
    lastCheckedTime: Optional[str]
    dnsRecords: DNSRecords


DomainList = List[Domain]


class DomainCreate(TypedDict):
    name: str
    region: str


class DomainCreateResponse(TypedDict, total=False):
    id: float
    name: str
    teamId: float
    status: DomainStatus
    region: str
    clickTracking: bool
    openTracking: bool
    publicKey: str
    dkimStatus: Optional[str]
    spfDetails: Optional[str]
    createdAt: str
    updatedAt: str
    dmarcAdded: bool
    isVerifying: bool
    errorMessage: Optional[str]
    subdomain: Optional[str]
    verificationError: Optional[str]
    lastCheckedTime: Optional[str]
    dnsRecords: DNSRecords


class DomainVerifyResponse(TypedDict):
    message: str


class DomainDeleteResponse(TypedDict):
    id: int
    success: bool
    message: str


# ---------------------------------------------------------------------------
# Emails
# ---------------------------------------------------------------------------

EmailEventStatus = Literal[
    "SCHEDULED",
    "QUEUED",
    "SENT",
    "DELIVERY_DELAYED",
    "BOUNCED",
    "REJECTED",
    "RENDERING_FAILURE",
    "DELIVERED",
    "OPENED",
    "CLICKED",
    "COMPLAINED",
    "FAILED",
    "CANCELLED",
]


class EmailEvent(TypedDict, total=False):
    emailId: str
    status: EmailEventStatus
    createdAt: str
    data: Optional[Any]


Email = TypedDict(
    "Email",
    {
        "id": str,
        "teamId": float,
        "to": Union[str, List[str]],
        "replyTo": NotRequired[Union[str, List[str]]],
        "cc": NotRequired[Union[str, List[str]]],
        "bcc": NotRequired[Union[str, List[str]]],
        "from": str,
        "subject": str,
        "html": str,
        "text": str,
        "createdAt": str,
        "updatedAt": str,
        "emailEvents": List[EmailEvent],
    },
)


class EmailUpdate(TypedDict):
    # Accept datetime or ISO string; client will JSON-encode
    scheduledAt: Union[datetime, str]


class EmailUpdateResponse(TypedDict, total=False):
    emailId: Optional[str]


EmailLatestStatus = Literal[
    "SCHEDULED",
    "QUEUED",
    "SENT",
    "DELIVERY_DELAYED",
    "BOUNCED",
    "REJECTED",
    "RENDERING_FAILURE",
    "DELIVERED",
    "OPENED",
    "CLICKED",
    "COMPLAINED",
    "FAILED",
    "CANCELLED",
]


EmailListItem = TypedDict(
    "EmailListItem",
    {
        "id": str,
        "to": Union[str, List[str]],
        "replyTo": NotRequired[Union[str, List[str]]],
        "cc": NotRequired[Union[str, List[str]]],
        "bcc": NotRequired[Union[str, List[str]]],
        "from": str,
        "subject": str,
        "html": str,
        "text": str,
        "createdAt": str,
        "updatedAt": str,
        "latestStatus": EmailLatestStatus,
        "scheduledAt": str,
        "domainId": float,
    },
)


class EmailsList(TypedDict):
    data: List[EmailListItem]
    count: float


class Attachment(TypedDict):
    filename: str
    content: str


EmailCreate = TypedDict(
    "EmailCreate",
    {
        "to": Required[Union[str, List[str]]],
        "from": Required[str],
        "subject": NotRequired[str],
        "templateId": NotRequired[str],
        "variables": NotRequired[Dict[str, str]],
        "replyTo": NotRequired[Union[str, List[str]]],
        "cc": NotRequired[Union[str, List[str]]],
        "bcc": NotRequired[Union[str, List[str]]],
        "text": NotRequired[str],
        "html": NotRequired[str],
        "attachments": NotRequired[List[Attachment]],
        "scheduledAt": NotRequired[Union[datetime, str]],
        "inReplyToId": NotRequired[str],
        "headers": NotRequired[Dict[str, str]],
    },
)


class EmailCreateResponse(TypedDict, total=False):
    emailId: Optional[str]


EmailBatchItem = TypedDict(
    "EmailBatchItem",
    {
        "to": Required[Union[str, List[str]]],
        "from": Required[str],
        "subject": NotRequired[str],
        "templateId": NotRequired[str],
        "variables": NotRequired[Dict[str, str]],
        "replyTo": NotRequired[Union[str, List[str]]],
        "cc": NotRequired[Union[str, List[str]]],
        "bcc": NotRequired[Union[str, List[str]]],
        "text": NotRequired[str],
        "html": NotRequired[str],
        "attachments": NotRequired[List[Attachment]],
        "scheduledAt": NotRequired[Union[datetime, str]],
        "inReplyToId": NotRequired[str],
        "headers": NotRequired[Dict[str, str]],
    },
)


EmailBatch = List[EmailBatchItem]


class EmailBatchResponseItem(TypedDict):
    emailId: str


class EmailBatchResponse(TypedDict):
    data: List[EmailBatchResponseItem]


class EmailCancelResponse(TypedDict, total=False):
    emailId: Optional[str]


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------


class ContactCreate(TypedDict, total=False):
    email: str
    firstName: Optional[str]
    lastName: Optional[str]
    properties: Optional[Dict[str, str]]
    subscribed: Optional[bool]


class ContactCreateResponse(TypedDict, total=False):
    contactId: Optional[str]


class ContactListItem(TypedDict, total=False):
    id: str
    firstName: Optional[str]
    lastName: Optional[str]
    email: str
    subscribed: Optional[bool]
    properties: Dict[str, str]
    contactBookId: str
    createdAt: str
    updatedAt: str


ContactList = List[ContactListItem]


class ContactUpdate(TypedDict, total=False):
    firstName: Optional[str]
    lastName: Optional[str]
    properties: Optional[Dict[str, str]]
    subscribed: Optional[bool]


class ContactUpdateResponse(TypedDict, total=False):
    contactId: Optional[str]


class Contact(TypedDict, total=False):
    id: str
    firstName: Optional[str]
    lastName: Optional[str]
    email: str
    subscribed: Optional[bool]
    properties: Dict[str, str]
    contactBookId: str
    createdAt: str
    updatedAt: str


class ContactUpsert(TypedDict, total=False):
    email: str
    firstName: Optional[str]
    lastName: Optional[str]
    properties: Optional[Dict[str, str]]
    subscribed: Optional[bool]


class ContactUpsertResponse(TypedDict):
    contactId: str


class ContactDeleteResponse(TypedDict):
    success: bool


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------

Campaign = TypedDict(
    "Campaign",
    {
        "id": str,
        "name": str,
        "from": str,
        "subject": str,
        "previewText": Optional[str],
        "contactBookId": Optional[str],
        "html": Optional[str],
        "content": Optional[str],
        "status": str,
        "scheduledAt": Optional[str],
        "batchSize": int,
        "batchWindowMinutes": int,
        "total": int,
        "sent": int,
        "delivered": int,
        "opened": int,
        "clicked": int,
        "unsubscribed": int,
        "bounced": int,
        "hardBounced": int,
        "complained": int,
        "replyTo": List[str],
        "cc": List[str],
        "bcc": List[str],
        "createdAt": str,
        "updatedAt": str,
    },
)


CampaignCreate = TypedDict(
    "CampaignCreate",
    {
        "name": Required[str],
        "from": Required[str],
        "subject": Required[str],
        "previewText": NotRequired[str],
        "contactBookId": Required[str],
        "content": NotRequired[str],
        "html": NotRequired[str],
        "replyTo": NotRequired[Union[str, List[str]]],
        "cc": NotRequired[Union[str, List[str]]],
        "bcc": NotRequired[Union[str, List[str]]],
        "sendNow": NotRequired[bool],
        "scheduledAt": NotRequired[str],
        "batchSize": NotRequired[int],
    },
)


CampaignCreateResponse = TypedDict(
    "CampaignCreateResponse",
    {
        "id": str,
        "name": str,
        "from": str,
        "subject": str,
        "previewText": Optional[str],
        "contactBookId": Optional[str],
        "html": Optional[str],
        "content": Optional[str],
        "status": str,
        "scheduledAt": Optional[str],
        "batchSize": int,
        "batchWindowMinutes": int,
        "total": int,
        "sent": int,
        "delivered": int,
        "opened": int,
        "clicked": int,
        "unsubscribed": int,
        "bounced": int,
        "hardBounced": int,
        "complained": int,
        "replyTo": List[str],
        "cc": List[str],
        "bcc": List[str],
        "createdAt": str,
        "updatedAt": str,
    },
)


class CampaignSchedule(TypedDict, total=False):
    scheduledAt: Optional[str]
    batchSize: Optional[int]
    sendNow: Optional[bool]


class CampaignScheduleResponse(TypedDict, total=False):
    success: bool


class CampaignActionResponse(TypedDict, total=False):
    success: bool


# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------


class APIError(TypedDict):
    code: str
    message: str
