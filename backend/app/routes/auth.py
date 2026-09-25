"""Sign-in: Google / LinkedIn via the fake shim (Stories 3, 4), email magic link
(Story 5). Every failure maps to one of the four fallback screens (Story 6);
no raw error text ever reaches the browser.

Epic 1 addendum (email path only): the magic link is used once, to prove the
email. /verify marks the token used but leaves the coach 'pending' and sends
them to Set password; saving a password (dev_local_credentials) is what makes
the account 'active'. Returning email coaches log in with email + password.
One email = one account: signing up again with a registered email is refused."""
import time
from urllib.parse import urlencode

import psycopg
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from .. import db, dev_credentials, logger, repositories as repo, storage
from ..auth_shim import ExchangeError, exchange_code
from ..config import settings
from ..constants import PROVIDERS
from ..errors import AppError
from ..mailer import send_magic_link
from ..session import (clear_password_setup, clear_session, get_password_setup_coach_id, new_state,
                       set_oauth_state, set_password_setup, set_session, take_oauth_state)
from ..validation import normalize_email, normalize_name, resolve_org, validate_new_password

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
    """Page 1 email sign-up. Also used by "Resend link" on the Check-your-email
    screen (resend=true), which is only allowed for a still-pending email coach."""
    body = await request.json()
    email = normalize_email(body.get("email"))
    name = normalize_name(body.get("name"), required=False)
    resend = body.get("resend") is True
    coach_type, org_id = resolve_org(body.get("org"))

    existing = repo.coach_by_email(email)
    if existing and existing["auth_provider"] != "email":
        raise AppError(409, "This email is already registered.", "account_conflict")
    if existing and existing["status"] == "deactivated":
        raise AppError(403, "This account is not available.", "account_unavailable")
    if existing and existing["status"] == "active":
        # One email = one account. A registered coach logs in instead.
        raise AppError(409, "An account with this email already exists. Please log in instead.", "email_registered")
    if existing and not resend:
        # Registered but the sign-up link hasn't been used yet.
        raise AppError(409, "This email is already registered but not verified yet. Check your inbox for the "
                            "sign-in link, or resend it.", "email_pending")
    if resend and not existing:
        raise AppError(400, "Please sign up first.", "not_registered")

    if time.time() - _recent.get(email, 0) < _RESEND_WINDOW:  # double-submit guard
        return {"ok": True, "email": email}

    if existing:  # resend for a pending email coach
        coach_id = existing["coach_id"]
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
    # Addendum Story 1: token is now used, status stays 'pending'. Next: Set password.
    resp = RedirectResponse("/set-password", status_code=302)
    clear_session(resp)
    set_password_setup(resp, coach_id)
    return resp


def _setup_coach(request: Request) -> dict:
    """The pending email coach allowed to set a password right now, or 401."""
    coach_id = get_password_setup_coach_id(request)
    coach = repo.coach_by_id(coach_id) if coach_id else None
    if (not coach or coach["auth_provider"] != "email" or coach["status"] != "pending"
            or dev_credentials.has_password(coach_id)):
        raise AppError(401, "This link has already been used. Please log in or request a new link.", "setup_expired")
    return coach


@router.get("/api/v1/auth/password-setup")
def password_setup(request: Request):
    coach = _setup_coach(request)
    return {"email": coach["coach_email"], "name": coach["coach_name"]}


@router.post("/api/v1/auth/set-password")
async def set_password(request: Request):
    body = await request.json()
    coach = _setup_coach(request)
    password = validate_new_password(body.get("password"), body.get("confirm_password"))
    password_hash = dev_credentials.hash_password(password)
    with db.transaction() as conn:
        locked = repo.lock_coach(conn, coach["coach_id"])
        if not locked or locked["status"] != "pending":
            raise AppError(401, "This link has already been used. Please log in or request a new link.", "setup_expired")
        if not dev_credentials.insert_credentials(conn, coach["coach_id"], password_hash):
            raise AppError(409, "A password is already set for this account. Please log in.", "password_exists")
        repo.activate_coach(conn, coach["coach_id"])  # only now: pending -> active
    logger.info("password set, coach activated", coach_id=coach["coach_id"])
    resp = JSONResponse({"ok": True, "redirect": "/personalize"})
    clear_password_setup(resp)
    set_session(resp, coach["coach_id"])
    return resp


_LOGIN_FAILED = "Email or password is incorrect."


@router.post("/api/v1/auth/login")
async def login(request: Request):
    """Addendum Story 2. Wrong email or password -> plain 401 shown on the Login
    screen itself (not a fallback screen). Right -> straight to Portfolio."""
    body = await request.json()
    email = normalize_email(body.get("email"))
    password = str(body.get("password") or "")
    coach = repo.coach_by_email(email)
    stored = None
    if coach and coach["auth_provider"] == "email" and coach["status"] == "active":
        stored = dev_credentials.password_hash_for(coach["coach_id"])
    if not password or not dev_credentials.verify_or_dummy(password, stored):
        logger.info("email login failed")
        raise AppError(401, _LOGIN_FAILED, "invalid_credentials")
    resp = JSONResponse({"ok": True, "redirect": "/portfolio"})
    clear_password_setup(resp)
    set_session(resp, coach["coach_id"])
    return resp


@router.get("/auth/logout")
def logout():
    resp = RedirectResponse("/join", status_code=302)
    clear_session(resp)
    return resp
