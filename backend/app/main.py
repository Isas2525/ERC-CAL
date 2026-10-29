"""FastAPI application: API routes + static frontend.

Run:  uvicorn app.main:app --reload   (from the backend/ directory)
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .brands import all_brands
from .db import CodeStore
from .fallback import build_providers, query_providers
from .schemas import (
    BrandOut,
    ErrorResponse,
    LookupRequest,
    LookupResponse,
    StoreRequest,
    StoreResponse,
)
from .validation import ValidationError, normalize_identifier, resolve_brand, validate_code

log = logging.getLogger("erc_cal")

FRONTEND_DIR = Path(
    os.environ.get("ERC_CAL_FRONTEND", Path(__file__).resolve().parents[2] / "frontend")
)


def create_app(store: CodeStore | None = None) -> FastAPI:
    """App factory. Tests pass an in-memory ``CodeStore``."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = store or CodeStore()
        app.state.providers = build_providers()
        yield
        if store is None:
            app.state.store.close()

    app = FastAPI(
        title="ERC-CAL",
        description="Look up stored infotainment unlock codes for your own vehicles.",
        version="1.0.0",
        lifespan=lifespan,
    )

    # --- Error handling ---------------------------------------------------

    @app.exception_handler(ValidationError)
    async def _validation_error(_: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(error=exc.message, field=exc.field).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def _request_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Collapse pydantic's nested error list into one readable sentence.
        first = exc.errors()[0] if exc.errors() else {}
        loc = [str(p) for p in first.get("loc", []) if p != "body"]
        field = loc[0] if loc else None
        msg = first.get("msg", "Invalid request.")
        text = f"{field}: {msg}" if field else msg
        return JSONResponse(
            status_code=422, content=ErrorResponse(error=text, field=field).model_dump()
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error")
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(error="Something went wrong on the server. Please try again.").model_dump(),
        )

    # --- API --------------------------------------------------------------

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "codes_stored": app.state.store.count()}

    @app.get("/api/brands", response_model=list[BrandOut])
    def brands() -> list[BrandOut]:
        return [
            BrandOut(
                key=b.key,
                name=b.name,
                icon=b.icon,
                identifier_label=b.identifier_label,
                identifier_noun=b.identifier_noun,
                placeholder=b.placeholder,
                pattern=b.pattern,
                min_len=b.min_len,
                max_len=b.max_len,
                requirement=b.requirement,
                retrieval_steps=list(b.retrieval_steps),
                note=b.note,
            )
            for b in all_brands()
        ]

    @app.post(
        "/api/lookup",
        response_model=LookupResponse,
        responses={422: {"model": ErrorResponse}},
    )
    def lookup(req: LookupRequest) -> LookupResponse:
        brand = resolve_brand(req.brand)
        identifier = normalize_identifier(brand, req.identifier)

        record = app.state.store.get(brand.key, identifier)
        if record:
            return LookupResponse(
                found=True,
                brand=brand.key,
                identifier=identifier,
                code=record.code,
                source="local",
                model=record.model,
                model_year=record.model_year,
                notes=record.notes,
                message="Unlock code found.",
            )

        hit = query_providers(app.state.providers, brand.key, identifier)
        if hit:
            code, provider = hit
            app.state.store.upsert(brand.key, identifier, code, notes=f"via {provider}")
            return LookupResponse(
                found=True,
                brand=brand.key,
                identifier=identifier,
                code=code,
                source=provider,
                message=f"Unlock code found via {provider}.",
            )

        return LookupResponse(
            found=False,
            brand=brand.key,
            identifier=identifier,
            message=(
                f"Nothing is stored for {brand.name} {brand.identifier_noun} {identifier}. "
                "Check it was typed exactly as shown, or add the code you were "
                "issued using 'Save a code'."
            ),
        )

    @app.post(
        "/api/codes",
        response_model=StoreResponse,
        responses={422: {"model": ErrorResponse}},
    )
    def store_code(req: StoreRequest) -> StoreResponse:
        brand = resolve_brand(req.brand)
        identifier = normalize_identifier(brand, req.identifier)
        code = validate_code(req.code)
        record, created = app.state.store.upsert(
            brand.key,
            identifier,
            code,
            model=(req.model or "").strip() or None,
            model_year=req.model_year,
            notes=(req.notes or "").strip() or None,
        )
        return StoreResponse(
            created=created,
            brand=record.brand,
            identifier=record.identifier,
            code=record.code,
            message="Code saved." if created else "Code updated.",
        )

    @app.delete("/api/codes/{brand_key}/{identifier}", responses={404: {"model": ErrorResponse}})
    def delete_code(brand_key: str, identifier: str):
        brand = resolve_brand(brand_key)
        ident = normalize_identifier(brand, identifier)
        deleted = app.state.store.delete(brand.key, ident)
        if not deleted:
            return JSONResponse(
                status_code=404,
                content=ErrorResponse(error="No stored code to delete.").model_dump(),
            )
        return {"deleted": True}

    # --- Frontend ---------------------------------------------------------

    if FRONTEND_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

        @app.get("/", include_in_schema=False)
        def index() -> FileResponse:
            return FileResponse(FRONTEND_DIR / "index.html")

    return app


app = create_app()
