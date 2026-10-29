"""Identifier validation.

Turns raw user input into a normalized lookup key, or raises a
``ValidationError`` whose message is safe and helpful to show a user.
"""

from __future__ import annotations

import string

from .brands import Brand, get_brand, all_brands

_ALNUM = frozenset(string.ascii_uppercase + string.digits)


class ValidationError(ValueError):
    """Raised for user-correctable input problems.

    ``field`` names the offending input so the frontend can highlight it.
    """

    def __init__(self, message: str, field: str = "identifier") -> None:
        super().__init__(message)
        self.message = message
        self.field = field


def resolve_brand(key: str | None) -> Brand:
    if not key or not key.strip():
        raise ValidationError("Please choose a brand.", field="brand")
    brand = get_brand(key)
    if brand is None:
        supported = ", ".join(b.name for b in all_brands())
        raise ValidationError(
            f"Unsupported brand '{key}'. Supported brands: {supported}.",
            field="brand",
        )
    return brand


def normalize_identifier(brand: Brand, raw: str | None) -> str:
    """Normalize and validate ``raw`` for ``brand``.

    Returns the normalized identifier. Raises ``ValidationError`` with a
    specific message describing exactly what is wrong.
    """
    if raw is None or not raw.strip():
        raise ValidationError(f"Please enter the {brand.identifier_noun}.")

    value = brand.normalize(raw)
    if not value:
        raise ValidationError(f"Please enter the {brand.identifier_noun}.")

    # Characters first: a bad character is a clearer message than a length
    # complaint when both are wrong.
    bad = sorted({c for c in value if c not in _ALNUM})
    if bad:
        shown = " ".join(repr(c) for c in bad)
        raise ValidationError(
            f"Invalid character(s) {shown}. {brand.requirement}"
        )

    if brand.min_len == brand.max_len and len(value) != brand.min_len:
        raise ValidationError(
            f"Expected exactly {brand.min_len} characters but got {len(value)}. "
            f"{brand.requirement}"
        )
    if len(value) < brand.min_len:
        raise ValidationError(
            f"Too short ({len(value)} characters, minimum {brand.min_len}). "
            f"{brand.requirement}"
        )
    if len(value) > brand.max_len:
        raise ValidationError(
            f"Too long ({len(value)} characters, maximum {brand.max_len}). "
            f"{brand.requirement}"
        )

    if not brand.compiled.fullmatch(value):
        # Length is fine, so the problem is the character class (e.g. a
        # non-hex letter in a hex-only field). Name the offenders.
        if brand.pattern.startswith("^[0-9A-F]"):
            non_hex = sorted({c for c in value if c not in "0123456789ABCDEF"})
            if non_hex:
                raise ValidationError(
                    f"Non-hexadecimal character(s) {' '.join(non_hex)}. "
                    f"{brand.requirement}"
                )
        raise ValidationError(f"Unrecognized format. {brand.requirement}")

    return value


def validate_code(raw: str | None) -> str:
    """Validate an unlock code being *stored* by the owner."""
    if raw is None or not raw.strip():
        raise ValidationError("Please enter the unlock code to store.", field="code")
    value = raw.strip().upper()
    if len(value) > 32:
        raise ValidationError("Unlock code is too long (max 32 characters).", field="code")
    if not all(c in _ALNUM or c == "-" for c in value):
        raise ValidationError(
            "Unlock code may contain only letters, digits and dashes.", field="code"
        )
    return value
