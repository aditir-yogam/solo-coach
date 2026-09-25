import ipaddress
import re
from urllib.parse import urlsplit, urlunsplit

from .constants import CLIENT_COUNT_OPTIONS, CREDENTIAL_OPTIONS, EDITABLE_FIELDS, NICHE_OPTIONS, ORG_CODES
from .errors import AppError

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def is_uuid(v) -> bool:
    return isinstance(v, str) and bool(UUID_RE.match(v))


def clean_line(v) -> str:
    return re.sub(r"\s+", " ", _CTRL.sub(" ", str(v or ""))).strip()


def clean_text(v) -> str:
    t = _CTRL.sub("", str(v or "").replace("\r\n", "\n").replace("\r", "\n"))
    t = re.sub(r"[ \t]+\n", "\n", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def normalize_email(v) -> str:
    email = clean_line(v).lower()
    if not email:
        raise AppError(400, "Please enter your email address.", "email_required")
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise AppError(400, "Please enter a valid email address.", "email_invalid")
    return email


def normalize_name(v, required: bool = True) -> str | None:
    name = clean_line(v)
    if not name:
        if required:
            raise AppError(400, "Please enter your full name.", "name_required")
        return None
    if len(name) > 100:
        raise AppError(400, "Name must be 100 characters or fewer.", "name_too_long")
    return name


def resolve_org(code) -> tuple[str, str | None]:
    """Tenancy detection (Story 2). No code -> ('SO', None); known code -> ('IN', org_id)."""
    code = clean_line(code).lower()
    if not code:
        return "SO", None
    if code not in ORG_CODES:
        raise AppError(400, "That sign-up link isn't recognised.", "org_invalid")
    return "IN", ORG_CODES[code]


_URL_ERR = "That website address doesn't look right. Try something like https://yourcoachingsite.com"


def normalize_website_url(v) -> str | None:
    raw = clean_line(v)
    if not raw:
        return None
    if not re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.I):
        raw = f"https://{raw}"
    try:
        parts = urlsplit(raw)
    except ValueError:
        raise AppError(400, _URL_ERR, "website_invalid") from None
    host = (parts.hostname or "").lower()
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        is_ip = False
    if (
        parts.scheme not in ("http", "https")
        or "." not in host
        or host == "localhost"
        or host.endswith((".local", ".internal"))
        or is_ip
        or parts.username
        or parts.password
        or len(raw) > 2048
    ):
        raise AppError(400, _URL_ERR, "website_invalid")
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))


def pick_from_list(values, allowed, label) -> list[str]:
    if values is None or values == "":
        values = []
    if not isinstance(values, list):
        values = [values]
    chosen = {str(v) for v in values}
    if chosen - set(allowed):
        raise AppError(400, f"Unknown {label} option.", f"{label}_invalid")
    return [o for o in allowed if o in chosen]  # stable wireframe order


def normalize_quick_answers(niches, credentials, clients) -> dict:
    niche = pick_from_list(niches, NICHE_OPTIONS, "niche")
    credential = pick_from_list(credentials, CREDENTIAL_OPTIONS, "credential")
    clients = clean_line(clients) or None
    if clients is not None and clients not in CLIENT_COUNT_OPTIONS:
        raise AppError(400, "Unknown client count option.", "client_count_invalid")
    return {"coaching_niche": niche or None, "credential": credential or None, "clients_coached": clients}


def normalize_linkedin_handle(v) -> str | None:
    raw = clean_line(v)
    if not raw:
        return None
    raw = re.sub(r"^https?://", "", raw, flags=re.I)
    raw = re.sub(r"^www\.", "", raw, flags=re.I).rstrip("/")
    m = re.match(r"^linkedin\.com/in/([^/?#]+)$", raw, re.I)
    handle = (m.group(1) if m else raw).lstrip("@")
    if not re.match(r"^[A-Za-z0-9\-_%.]{3,100}$", handle):
        raise AppError(400, "Enter a LinkedIn handle like linkedin.com/in/your-name.", "linkedin_invalid")
    return f"linkedin.com/in/{handle}"


def validate_portfolio_patch(body, allowed_photo_key: str) -> dict:
    """Only the seven Story 12 fields are accepted; anything else is rejected."""
    if not isinstance(body, dict):
        raise AppError(400, "Invalid request.", "invalid_body")
    if not body:
        raise AppError(400, "Nothing to update.", "empty_patch")
    unknown = [k for k in body if k not in EDITABLE_FIELDS]
    if unknown:
        raise AppError(400, f"Field not editable: {', '.join(unknown)}", "field_not_editable")

    out: dict = {}
    for key, value in body.items():
        if value is not None and not isinstance(value, str):
            raise AppError(400, f"Invalid value for {key}.", "invalid_value")
        if key == "coach_name":
            name = clean_line(value)
            if not name:
                raise AppError(400, "Name cannot be empty.", "name_required")
            if len(name) > 100:
                raise AppError(400, "Name must be 100 characters or fewer.", "name_too_long")
            out[key] = name
        elif key == "headline":
            h = clean_line(value)
            if len(h) > 140:
                raise AppError(400, "Headline must be 140 characters or fewer.", "headline_too_long")
            out[key] = h or None
        elif key == "story_heading":
            h = clean_line(value)
            if not h:
                raise AppError(400, "Story heading cannot be empty.", "heading_required")
            if len(h) > 80:
                raise AppError(400, "Story heading must be 80 characters or fewer.", "heading_too_long")
            out[key] = h
        elif key == "coach_story":
            s = clean_text(value)
            if not s:
                raise AppError(400, "Your story cannot be empty.", "story_required")
            if len(s) > 6000:
                raise AppError(400, "Your story must be 6,000 characters or fewer.", "story_too_long")
            out[key] = s
        elif key == "linkedin_handle":
            out[key] = normalize_linkedin_handle(value)
        elif key == "coach_email":
            out[key] = normalize_email(value)
        elif key == "photo_s3_key":
            # Only this coach's own photo object may be referenced.
            if value != allowed_photo_key:
                raise AppError(400, "Invalid photo reference.", "photo_key_invalid")
            out[key] = value
    return out
