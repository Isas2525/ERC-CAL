"""End-to-end API tests against an in-memory database."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.db import CodeStore
from app.main import create_app


@pytest.fixture
def client():
    store = CodeStore(":memory:")
    with TestClient(create_app(store)) as c:
        yield c
    store.close()


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "codes_stored": 0}


def test_brands_payload(client):
    r = client.get("/api/brands")
    assert r.status_code == 200
    keys = [b["key"] for b in r.json()]
    assert keys == ["toyota", "lexus", "nissan", "honda", "mitsubishi", "clarion"]
    toyota = r.json()[0]
    assert toyota["min_len"] == toyota["max_len"] == 16
    assert toyota["retrieval_steps"]


def test_save_then_find_roundtrip(client):
    r = client.post("/api/codes", json={
        "brand": "toyota", "identifier": "1a2b 3c4d-5e6f.7a8b", "code": "abcd1234",
        "model": "Corolla", "model_year": 2019, "notes": "dealer invoice",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] is True
    assert body["identifier"] == "1A2B3C4D5E6F7A8B"
    assert body["code"] == "ABCD1234"

    # Same unit typed differently resolves to the same record.
    r = client.post("/api/lookup", json={"brand": "Toyota", "identifier": "1A2B3C4D5E6F7A8B"})
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is True
    assert body["code"] == "ABCD1234"
    assert body["source"] == "local"
    assert body["model"] == "Corolla" and body["model_year"] == 2019

    assert client.get("/api/health").json()["codes_stored"] == 1


def test_save_updates_existing(client):
    payload = {"brand": "nissan", "identifier": "BP1234567", "code": "1111"}
    assert client.post("/api/codes", json=payload).json()["created"] is True
    r = client.post("/api/codes", json={**payload, "code": "2222"})
    assert r.json()["created"] is False
    assert r.json()["message"] == "Code updated."
    found = client.post("/api/lookup", json={"brand": "nissan", "identifier": "bp1234567"}).json()
    assert found["code"] == "2222"


def test_lookup_not_found(client):
    r = client.post("/api/lookup", json={"brand": "honda", "identifier": "U1234567"})
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is False
    assert body["code"] is None
    assert body["message"].startswith("Nothing is stored for Honda radio serial U1234567.")


def test_brands_are_isolated(client):
    client.post("/api/codes", json={"brand": "nissan", "identifier": "AB12345", "code": "9999"})
    r = client.post("/api/lookup", json={"brand": "clarion", "identifier": "AB12345"})
    assert r.json()["found"] is False


@pytest.mark.parametrize("payload, field, fragment", [
    ({"brand": "", "identifier": "x"}, "brand", "choose a brand"),
    ({"brand": "ford", "identifier": "x"}, "brand", "Unsupported brand"),
    ({"brand": "toyota", "identifier": "   "}, "identifier", "Please enter the ERC code."),
    ({"brand": "nissan", "identifier": "BP12345\u00c9"}, "identifier", "Invalid character"),
    ({"brand": "toyota", "identifier": "1A2B3C"}, "identifier", "exactly 16"),
    ({"brand": "toyota", "identifier": "1A2B3C4D5E6F7A8G"}, "identifier", "Non-hexadecimal"),
    ({"brand": "toyota", "identifier": "1A2B3C4D5E6F7A8!"}, "identifier", "Invalid character"),
    ({"brand": "nissan", "identifier": "BP12"}, "identifier", "Too short"),
    ({"brand": "nissan", "identifier": "BP1234567890123"}, "identifier", "Too long"),
])
def test_lookup_validation_errors(client, payload, field, fragment):
    r = client.post("/api/lookup", json=payload)
    assert r.status_code == 422, r.text
    body = r.json()
    assert body["field"] == field
    assert fragment in body["error"]


def test_missing_field_is_readable(client):
    r = client.post("/api/lookup", json={"brand": "toyota"})
    assert r.status_code == 422
    body = r.json()
    assert body["field"] == "identifier"
    assert "required" in body["error"].lower()


@pytest.mark.parametrize("code, fragment", [
    ("", "Please enter the unlock code"),
    ("12 34", "only letters, digits and dashes"),
    ("X" * 33, "too long"),
    ("\uff11\uff12\uff13\uff14", "only letters, digits and dashes"),  # full-width digits
])
def test_save_code_validation(client, code, fragment):
    r = client.post("/api/codes", json={"brand": "honda", "identifier": "U1234567", "code": code})
    assert r.status_code == 422
    assert r.json()["field"] == "code"
    assert fragment in r.json()["error"]


def test_save_bad_year(client):
    r = client.post("/api/codes", json={
        "brand": "honda", "identifier": "U1234567", "code": "12345", "model_year": 1700,
    })
    assert r.status_code == 422
    assert r.json()["field"] == "model_year"


def test_delete(client):
    client.post("/api/codes", json={"brand": "mitsubishi", "identifier": "MIT12345", "code": "4321"})
    assert client.delete("/api/codes/mitsubishi/mit-12345").json() == {"deleted": True}
    r = client.delete("/api/codes/mitsubishi/MIT12345")
    assert r.status_code == 404


def test_fallback_provider_is_used_and_cached(client):
    class FakeProvider:
        name = "test-provider"
        calls = 0

        def lookup(self, brand, identifier):
            FakeProvider.calls += 1
            return "7777" if identifier == "PE1234567" else None

    client.app.state.providers = [FakeProvider()]
    r = client.post("/api/lookup", json={"brand": "clarion", "identifier": "PE1234567"}).json()
    assert r["found"] and r["code"] == "7777" and r["source"] == "test-provider"
    # Second lookup is served from the local cache, not the provider.
    r = client.post("/api/lookup", json={"brand": "clarion", "identifier": "PE1234567"}).json()
    assert r["source"] == "local"
    assert FakeProvider.calls == 1


def test_failing_provider_does_not_break_lookup(client):
    class Broken:
        name = "broken"

        def lookup(self, brand, identifier):
            raise RuntimeError("network down")

    client.app.state.providers = [Broken()]
    r = client.post("/api/lookup", json={"brand": "clarion", "identifier": "PE7654321"})
    assert r.status_code == 200
    assert r.json()["found"] is False


def test_frontend_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "ERC-CAL" in r.text
    assert client.get("/static/app.js").status_code == 200
