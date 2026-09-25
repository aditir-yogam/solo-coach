"""Sign-in: Google / LinkedIn via the fake shim (Stories 3, 4), email magic link
(Story 5). Every failure maps to one of the four fallback screens (Story 6);
no raw error text ever reaches the browser."""
import time
from urllib.parse import urlencode

import psycopg
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from .. import logger, repositories as repo, storage
from ..auth_shim import ExchangeError, exchange_code
from ..config import settings
from ..constants import PROVIDERS
from ..errors import AppError
from ..mailer import send_magic_link
from ..session import clear_session, new_state, set_oauth_state, set_session, take_oauth_state
from ..validation import normalize_email, normalize_name, resolve_org

router = APIRouter()


def fallback(reason: str, provider: str | None = None) -> RedirectResponse:
    qs = {"reason": reason, **({"provider": provider} if provider else {})}
    return RedirectResponse(f"/signin/error?{urlencode(qs)}", status_code=302)


def _download_photo(url: str) -> bytes | None:
    import httpx

    try:
        res = httpx.get(url, timeout=10)
        if res.status_code == 200 and res.headers.get("content-type", "").startswith("image/") and 0 < len(res.content) <= settings.max_photo_bytes:
            return res.content
        logger.warn("photo download rejected", status=res.status_code)
    except httpx.HTTPError as exc:
        logger.warn("photo download failed", error=type(exc).__name__)
    return None


@router.get("/auth/{provider}/start")
def start(provider: str, org: str = "", simulate: str = ""):
    if provider not in PROVIDERS:
        return fallback("provider")
    try:
        resolve_org(org)
    except AppError:
        return fallback("provider", provider)
    if not settings.auth_shim_url:
        logger.error("AUTH_SHIM_URL is not configured")
        return fallback("provider", provider)
    state = new_state()
    params = {"provider": provider, "redirect_uri": f"{settings.app_base_url}/auth/{provider}/callback", "state": state}
    if simulate == "error":
        params["simulate"] = "error"
    resp = RedirectResponse(f"{settings.auth_shim_url}?{urlencode(params)}", status_code=302)
    set_oauth_state(resp, {"provider": provider, "state": state, "org": org})
    return resp


@router.get("/auth/{provider}/callback")
def callback(provider: str, request: Request, code: str = "", state: str = "", error: str = ""):
    if provider not in PROVIDERS:
        return fallback("provider")
    probe = RedirectResponse("/", status_code=302)
    saved = take_oauth_state(request, probe) or {}
    try:
        if error:
            return fallback("cancelled" if error == "access_denied" else "provider", provider)
        if not code or not state or saved.get("provider") != provider or saved.get("state") != state:
            logger.warn("oauth state mismatch or missing code", provider=provider)
            return fallback("provider", provider)
        try:
            claims = exchange_code(provider, code)
        except ExchangeError as exc:
            logger.warn("token exchange failed", provider=provider, error=str(exc))
            return fallback("provider", provider)

        coach_type, org_id = resolve_org(saved.get("org"))
        email = normalize_email(claims["email"])
        existing = repo.coach_by_email(email)
        if existing and existing["auth_provider"] != provider:
            logger.info("account conflict", provider=provider, existing_provider=existing["auth_provider"])
            return fallback("conflict", provider)
        if existing and existing["status"] == "deactivated":
            return fallback("provider", provider)

        if existing:  # returning coach, same provider: sign in, don't insert a duplicate
            repo.refresh_social_login(existing["coach_id"], claims["sub"])
            coach_id = existing["coach_id"]
        else:
            coach_id = repo.new_coach_id()
            key = f"{storage.coach_prefix({'coach_id': coach_id, 'org_id': org_id})}/photo.jpg"
            photo = _download_photo(claims["picture"])
            photo_key = None
            if photo:
                try:
                    storage.put_object(key, photo, "image/jpeg")
                    photo_key = key
                except Exception as exc:  # noqa: BLE001 — sign-in still succeeds, Portfolio shows "Add photo"
                    logger.error("photo upload to MinIO failed", error=type(exc).__name__)
            repo.insert_coach(coach_id=coach_id, coach_type=coach_type, org_id=org_id,
                              name=normalize_name(claims.get("name"), required=False), email=email, status="active",
                              auth_provider=provider, cognito_sub=claims["sub"], photo_s3_key=photo_key)
        resp = RedirectResponse("/personalize", status_code=302)
        set_session(resp, coach_id)
        resp.delete_cookie("sc_oauth_state", path="/")
        return resp
    except Exception as exc:  # noqa: BLE001
        logger.error("provider callback failed", provider=provider, error=type(exc).__name__)
        return fallback("provider", provider)


_recent: dict[str, float] = {}
_RESEND_WINDOW = 15.0


@router.post("/api/v1/auth/magic-link")
async def request_magic_link(request: Request):
    body = await request.json()
    email = normalize_email(body.get("email"))
    name = normalize_name(body.get("name"), required=False)
    coach_type, org_id = resolve_org(body.get("org"))

    if time.time() - _recent.get(email, 0) < _RESEND_WINDOW:  # double-submit guard
        return {"ok": True, "email": email}

    existing = repo.coach_by_email(email)
    if existing and existing["auth_provider"] != "email":
        raise AppError(409, "This email is already registered.", "account_conflict")
    if existing and existing["status"] == "deactivated":
        raise AppError(403, "This account is not available.", "account_unavailable")
    if existing:
        coach_id = existing["coach_id"]
        if existing["status"] == "pending" and name:
            repo.set_pending_name(coach_id, name)
    else:
        if not name:
            raise AppError(400, "Please enter your full name.", "name_required")
        coach_id = repo.new_coach_id()
        repo.insert_coach(coach_id=coach_id, coach_type=coach_type, org_id=org_id, name=name, email=email,
                          status="pending", auth_provider="email", cognito_sub=None)

    raw = repo.generate_token()
    repo.insert_token(repo.hash_token(raw), coach_id, settings.magic_link_ttl_hours)
    link = f"{settings.app_base_url}/verify?{urlencode({'token': raw})}"
    try:
        send_magic_link(email, name or (existing or {}).get("coach_name"), link)
    except Exception as exc:  # noqa: BLE001
        logger.error("magic link email failed", error=type(exc).__name__)
        raise AppError(503, "We couldn't send your sign-in email right now. Please try again in a minute.", "email_unavailable") from None
    _recent[email] = time.time()
    return {"ok": True, "email": email}


@router.get("/verify")
def verify(token: str = ""):
    try:
        status, coach_id = repo.consume_token(token)
    except psycopg.Error as exc:
        logger.error("verify failed", error=type(exc).__name__)
        return fallback("provider", "email")
    if status == "not_found":
        return fallback("provider", "email")
    if status in ("used", "expired"):
        return fallback("expired", "email")
    resp = RedirectResponse("/personalize", status_code=302)
    set_session(resp, coach_id)
    return resp


@router.get("/auth/logout")
def logout():
    resp = RedirectResponse("/join", status_code=302)
    clear_session(resp)
    return resp
