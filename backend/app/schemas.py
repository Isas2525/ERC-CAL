"""Pydantic request/response models for the API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BrandOut(BaseModel):
    key: str
    name: str
    icon: str
    identifier_label: str
    identifier_noun: str
    placeholder: str
    pattern: str
    min_len: int
    max_len: int
    requirement: str
    retrieval_steps: list[str]
    note: str


class LookupRequest(BaseModel):
    brand: str = Field(..., max_length=32)
    identifier: str = Field(..., max_length=128)


class LookupResponse(BaseModel):
    found: bool
    brand: str
    identifier: str          # normalized form actually looked up
    code: str | None = None
    source: str | None = None  # "local" or a fallback provider name
    model: str | None = None
    model_year: int | None = None
    notes: str | None = None
    message: str


class StoreRequest(BaseModel):
    brand: str = Field(..., max_length=32)
    identifier: str = Field(..., max_length=128)
    code: str = Field(..., max_length=64)
    model: str | None = Field(None, max_length=64)
    model_year: int | None = Field(None, ge=1980, le=2100)
    notes: str | None = Field(None, max_length=500)


class StoreResponse(BaseModel):
    created: bool
    brand: str
    identifier: str
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: str
    field: str | None = None
