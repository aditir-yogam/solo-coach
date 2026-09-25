"""Session = a signed, httpOnly cookie holding the coach_id. Coach-scoped
endpoints never trust a coach id from the client: the {coach_id} in the URL must
match the signed session."""
import secrets

from fastapi import Request, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer

from .config import settings
from .validation import is_uuid

SESSION_COOKIE = "sc_session"
STATE_COOKIE = "sc_oauth_state"
_SESSION_AGE = 7 * 24 * 3600
_STATE_AGE = 600

_session = URLSafeTimedSerializer(settings.session_secret, salt="coach-session")
_state = URLSafeTimedSerializer(settings.session_secret, salt="oauth-state")


def set_session(response: Response, coach_id: str):
    response.set_cookie(SESSION_COOKIE, _session.dumps(coach_id), max_age=_SESSION_AGE, httponly=True, samesite="lax", path="/")


def clear_session(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")


def get_session_coach_id(request: Request) -> str | None:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    try:
        value = _session.loads(raw, max_age=_SESSION_AGE)
    except BadSignature:
        return None
    return value if is_uuid(value) else None


def new_state() -> str:
    return secrets.token_urlsafe(18)


def set_oauth_state(response: Response, data: dict):
    response.set_cookie(STATE_COOKIE, _state.dumps(data), max_age=_STATE_AGE, httponly=True, samesite="lax", path="/")


def take_oauth_state(request: Request, response: Response) -> dict | None:
    raw = request.cookies.get(STATE_COOKIE)
    response.delete_cookie(STATE_COOKIE, path="/")
    if not raw:
        return None
    try:
        data = _state.loads(raw, max_age=_STATE_AGE)
    except BadSignature:
        return None
    return data if isinstance(data, dict) else None
