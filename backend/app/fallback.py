"""Fallback lookup providers.

When a code is not in the local database, the API can ask an external
provider, e.g. a licensed radio-code service you subscribe to, or your
own PostgreSQL instance. Providers implement ``FallbackProvider``.

None is configured by default. To add one, implement the protocol and
register it in ``build_providers()`` (typically gated on an env var such
as an API key). Results from a provider are cached into the local store
so the next lookup is instant and offline.
"""

from __future__ import annotations

import logging
import os
from typing import Protocol

log = logging.getLogger("erc_cal.fallback")


class FallbackProvider(Protocol):
    name: str

    def lookup(self, brand: str, identifier: str) -> str | None:
        """Return the unlock code, or ``None`` if this provider has none.

        Must not raise for "not found"; raise only for real failures
        (network, auth), which the caller logs and skips.
        """
        ...


def build_providers() -> list[FallbackProvider]:
    """Providers enabled for this process, in priority order.

    Example of wiring one in::

        if os.environ.get("MY_SERVICE_API_KEY"):
            providers.append(MyServiceProvider(os.environ["MY_SERVICE_API_KEY"]))
    """
    providers: list[FallbackProvider] = []
    if os.environ.get("ERC_CAL_DISABLE_FALLBACK") == "1":
        return providers
    return providers


def query_providers(
    providers: list[FallbackProvider], brand: str, identifier: str
) -> tuple[str, str] | None:
    """Try each provider in order. Returns ``(code, provider_name)`` or ``None``."""
    for provider in providers:
        try:
            code = provider.lookup(brand, identifier)
        except Exception:  # a failing provider must not break the lookup
            log.exception("fallback provider %s failed", provider.name)
            continue
        if code:
            return code, provider.name
    return None
