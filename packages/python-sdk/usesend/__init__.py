"""Python client for the UseSend API."""

from .usesend import UseSend, UseSendHTTPError
from .domains import Domains  # type: ignore
from .campaigns import Campaigns  # type: ignore
from . import types

__all__ = ["UseSend", "UseSendHTTPError", "types", "Domains", "Campaigns"]
