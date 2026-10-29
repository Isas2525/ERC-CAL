"""Brand configuration — the single source of truth for the whole app.

Each brand entry drives three things at once:

1. Server-side input validation (``validation.py``).
2. The ``GET /api/brands`` payload the frontend renders (selector,
   retrieval guides, input hints, client-side validation regex).
3. How an identifier is *normalized* before it becomes a lookup key, so
   that the same physical serial typed with or without spaces/dashes
   resolves to the same stored record.

IMPORTANT — what this app is and is not
---------------------------------------
This is a *lookup / vault* tool. It returns an unlock code that the
owner has previously stored for a given head unit, recovered from their
own paperwork, a dealer, or a licensed source. It does **not** compute,
derive, or reverse-engineer any manufacturer anti-theft algorithm. The
``identifier`` a user types is only a database key; no cryptographic
transformation is performed on it anywhere in this codebase.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable


@dataclass(frozen=True)
class Brand:
    """Configuration for a single supported brand."""

    key: str                      # stable id, lowercase, used in URLs/DB
    name: str                     # human label for the UI
    icon: str                     # short initial for the selector chip
    identifier_label: str         # input label, e.g. "Radio serial number"
    identifier_noun: str          # short form for use mid-sentence, e.g. "radio serial"
    placeholder: str              # example shown in the input
    # Regex the normalized identifier must fully match. Kept deliberately
    # lenient — its job is to catch obvious mistakes (wrong length, stray
    # characters), not to encode proprietary format secrets.
    pattern: str
    pattern_flags: int = 0
    min_len: int = 1
    max_len: int = 64
    # Human-readable constraint string shown under the input and returned
    # in validation errors.
    requirement: str = ""
    # Step-by-step guide: how to find this identifier on the vehicle.
    retrieval_steps: tuple[str, ...] = ()
    # Optional note rendered as a callout in the guide.
    note: str = ""
    # Normalizer applied before validation + lookup. Defaults to
    # upper-casing and stripping spaces/dashes.
    normalizer: Callable[[str], str] = field(default=None, repr=False)  # type: ignore[assignment]

    def normalize(self, raw: str) -> str:
        if self.normalizer is not None:
            return self.normalizer(raw)
        return _default_normalize(raw)

    @property
    def compiled(self) -> re.Pattern[str]:
        return re.compile(self.pattern, self.pattern_flags)


def _default_normalize(raw: str) -> str:
    """Upper-case and drop spaces, dashes and dots — the usual noise in a
    hand-typed serial. Case and separators never distinguish two real
    units, so folding them makes lookups forgiving."""
    return re.sub(r"[\s\-\.]", "", raw or "").upper()


# --- Brand definitions -----------------------------------------------------
#
# Ordering here is the order the frontend renders the selector.

_BRANDS: tuple[Brand, ...] = (
    Brand(
        key="toyota",
        name="Toyota",
        icon="T",
        identifier_label="ERC code (16-char seed)",
        identifier_noun="ERC code",
        placeholder="1A2B3C4D5E6F7A8B",
        pattern=r"^[0-9A-F]{16}$",
        min_len=16,
        max_len=16,
        requirement="Exactly 16 hexadecimal characters (0-9, A-F).",
        retrieval_steps=(
            "Turn the ignition to ACC/ON so the infotainment screen powers up.",
            "If the unit is locked after a battery disconnect, it shows an "
            "'ERC' screen with a 16-character code.",
            "Write down the 16-character code exactly as shown — it is the "
            "key under which your unlock code is stored.",
            "Enter it here to retrieve the unlock code you saved for this unit.",
        ),
        note="The on-screen ERC seed changes each time the battery is "
             "disconnected. Store the unlock code you were issued against "
             "the seed you see, so you can find it again.",
    ),
    Brand(
        key="lexus",
        name="Lexus",
        icon="L",
        identifier_label="ERC code (16-char seed)",
        identifier_noun="ERC code",
        placeholder="9F8E7D6C5B4A3F2E",
        pattern=r"^[0-9A-F]{16}$",
        min_len=16,
        max_len=16,
        requirement="Exactly 16 hexadecimal characters (0-9, A-F).",
        retrieval_steps=(
            "Switch the ignition to ACC/ON and let the display boot.",
            "A locked unit shows the ERC screen with a 16-character code.",
            "Record the 16-character code exactly.",
            "Enter it here to retrieve your stored unlock code.",
        ),
        note="Lexus units use the same ERC-style 16-character seed as "
             "Toyota. The seed is regenerated on every battery disconnect.",
    ),
    Brand(
        key="nissan",
        name="Nissan",
        icon="N",
        identifier_label="Radio serial number",
        identifier_noun="radio serial",
        placeholder="BP1234567",
        pattern=r"^[0-9A-Z]{5,12}$",
        min_len=5,
        max_len=12,
        requirement="5-12 letters and digits (e.g. a 'BP...' serial).",
        retrieval_steps=(
            "Remove the head unit from the dash (or check the label on its "
            "case if already out).",
            "Find the serial on the manufacturer label — often prefixed "
            "'BP', 'LCN' or similar.",
            "Alternatively, some units show the serial via a button combo — "
            "check your owner's manual for the sequence.",
            "Enter the serial here to retrieve the unlock PIN you stored.",
        ),
        note="Many Nissan/Clarion units print the serial on a sticker on "
             "the chassis. You usually need the unit partially removed to "
             "read it.",
    ),
    Brand(
        key="honda",
        name="Honda",
        icon="H",
        identifier_label="Radio serial number",
        identifier_noun="radio serial",
        placeholder="U1234567",
        pattern=r"^[0-9A-Z]{6,12}$",
        min_len=6,
        max_len=12,
        requirement="6-12 letters and digits.",
        retrieval_steps=(
            "Turn the ignition on. If the radio shows 'CODE' or 'ERR', it "
            "is locked.",
            "Retrieve the serial: hold Preset 1 and 6 while turning the "
            "radio on (older units), or read it from the label on the case.",
            "The screen/label shows an 8-digit serial (often starts 'U').",
            "Enter the serial here to retrieve your stored unlock code.",
        ),
        note="Honda owners can also obtain their code from the official "
             "Honda radio-code service using the serial and their VIN. "
             "Store that code here for next time.",
    ),
    Brand(
        key="mitsubishi",
        name="Mitsubishi",
        icon="M",
        identifier_label="Radio serial number",
        identifier_noun="radio serial",
        placeholder="MIT123456",
        pattern=r"^[0-9A-Z]{5,14}$",
        min_len=5,
        max_len=14,
        requirement="5-14 letters and digits.",
        retrieval_steps=(
            "Remove the head unit or locate the serial sticker on its case.",
            "Read the serial number from the manufacturer label.",
            "Enter the serial here to retrieve the unlock code you stored.",
        ),
        note="Mitsubishi units vary by supplier (some are Clarion-based). "
             "The serial on the case label is the reliable key.",
    ),
    Brand(
        key="clarion",
        name="Clarion",
        icon="C",
        identifier_label="Unit serial number",
        identifier_noun="unit serial",
        placeholder="PE1234567",
        pattern=r"^[0-9A-Z]{5,14}$",
        min_len=5,
        max_len=14,
        requirement="5-14 letters and digits.",
        retrieval_steps=(
            "Locate the serial label on the unit chassis.",
            "Read the serial (often prefixed with two letters).",
            "Enter it here to retrieve your stored unlock code.",
        ),
        note="Clarion supplies head units to several brands, so the same "
             "serial format appears across different vehicles.",
    ),
)

BRANDS: dict[str, Brand] = {b.key: b for b in _BRANDS}


def all_brands() -> list[Brand]:
    return list(_BRANDS)


def get_brand(key: str) -> Brand | None:
    return BRANDS.get((key or "").strip().lower())
