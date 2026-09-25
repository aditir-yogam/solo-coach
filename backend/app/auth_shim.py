"""Local fake authorize endpoint + stubbed code exchange (Stories 3, 4, 6).

Stands in for the real Cognito + Google/LinkedIn round-trip. Nothing here talks
to Google or LinkedIn.

  GET  /auth-shim/authorize?provider=google|linkedin&redirect_uri=..&state=..[&simulate=error]
       -> local "login" page: Continue / Cancel / Simulate exchange failure
  POST /auth-shim/decision -> back to redirect_uri with ?code=.. or ?error=access_denied
  exchange_code(provider, code) -> hardcoded fixture claims {sub, email, name, picture}
"""
import secrets
import time
from html import escape
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Form, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

from .config import settings

router = APIRouter()

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SIMULATED_FAILURE_CODE = "simulated-exchange-failure"
_CODE_TTL = 300


def fixture_claims(provider: str) -> dict:
    base = settings.auth_shim_photo_base
    if provider == "google":
        return {"sub": "google-fake-001", "email": "jordan@example.com", "name": "Jordan Blake",
                "picture": f"{base}/auth-shim/photos/jordan.jpg"}
    return {"sub": "linkedin-fake-001", "email": "priya@example.com", "name": "Priya Raman",
            "picture": f"{base}/auth-shim/photos/priya.jpg"}


_codes: dict[str, tuple[str, float]] = {}  # code -> (provider, expires_at)


class ExchangeError(Exception):
    pass


def exchange_code(provider: str, code: str) -> dict:
    """Stubbed exchange. Single-use codes; the simulated-failure code (or any
    unknown/expired code) raises, which the callback turns into the
    provider/config error screen."""
    entry = _codes.pop(code, None)
    if code == SIMULATED_FAILURE_CODE:
        raise ExchangeError("simulated token exchange failure")
    if entry is None or entry[0] != provider or entry[1] < time.time():
        raise ExchangeError("unknown or expired authorization code")
    return dict(fixture_claims(provider))


def _allowed_redirect(uri: str) -> bool:
    try:
        target, app = urlsplit(uri), urlsplit(settings.app_base_url)
    except ValueError:
        return False
    return (target.scheme, target.netloc) == (app.scheme, app.netloc) and target.path.startswith("/auth/")


def _page(provider: str, redirect_uri: str, state: str, simulate: bool) -> str:
    c = fixture_claims(provider)
    label = "Google" if provider == "google" else "LinkedIn"
    brand = "#1A73E8" if provider == "google" else "#0A66C2"
    photo = "jordan.jpg" if provider == "google" else "priya.jpg"
    hidden = "".join(f'<input type="hidden" name="{k}" value="{escape(v)}">' for k, v in
                     {"provider": provider, "redirect_uri": redirect_uri, "state": state,
                      "simulate": "error" if simulate else ""}.items())
    sim_link = f"/auth-shim/authorize?{urlencode({'provider': provider, 'redirect_uri': redirect_uri, 'state': state, 'simulate': 'error'})}"
    notice = ('<div class="warn">Simulation on: continuing will make the token exchange fail.</div>' if simulate else "")
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in with {label} (local fake)</title><style>
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f3f4;
font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#202124;padding:24px}}
.card{{background:#fff;width:100%;max-width:420px;border-radius:14px;padding:32px;box-shadow:0 2px 10px rgba(0,0,0,.08)}}
.badge{{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:#FFF4E5;color:#9A5B00;border-radius:999px;padding:4px 10px;margin-bottom:16px}}
h1{{font-size:22px;margin:0 0 6px}}p{{margin:0 0 20px;color:#5f6368;font-size:14px}}
.who{{display:flex;gap:14px;align-items:center;margin-bottom:8px}}.who img{{width:56px;height:56px;border-radius:50%;object-fit:cover}}
.btn{{width:100%;padding:12px;border-radius:8px;font-size:14.5px;font-weight:600;cursor:pointer;margin-top:10px;border:1px solid #dadce0;background:#fff}}
.primary{{background:{brand};color:#fff;border-color:{brand};margin-top:18px}}
.warn{{background:#FDF0EF;color:#B3261E;border-radius:8px;padding:10px 12px;font-size:13px;margin-top:14px}}
a.sim{{display:block;text-align:center;margin-top:16px;font-size:13px;color:#b3261e}}.note{{font-size:12px;color:#80868b;margin-top:16px;line-height:1.5}}
</style></head><body><div class="card">
<span class="badge">Local fake {label} — not real OAuth</span>
<h1>Sign in with {label}</h1><p><strong>Coaching Platform</strong> wants your name, email address and profile photo.</p>
<div class="who"><img src="/auth-shim/photos/{photo}" alt=""><div><strong>{escape(c['name'])}</strong><br>
<span style="color:#5f6368;font-size:13px">{escape(c['email'])} · {escape(c['sub'])}</span></div></div>{notice}
<form method="post" action="/auth-shim/decision">{hidden}<button class="btn primary" name="decision" value="approve">Continue as {escape(c['name'])}</button></form>
<form method="post" action="/auth-shim/decision">{hidden}<button class="btn" name="decision" value="cancel">Cancel</button></form>
{'' if simulate else f'<a class="sim" href="{escape(sim_link)}">Simulate exchange failure (?simulate=error)</a>'}
<div class="note">Local development shim. It stands in for the Cognito + {label} round-trip so the app's redirect, callback and fallback handling can be demonstrated end-to-end.</div>
</div></body></html>"""


@router.get("/auth-shim/authorize", response_class=HTMLResponse)
def authorize(provider: str, redirect_uri: str, state: str = "", simulate: str = ""):
    if provider not in ("google", "linkedin") or not _allowed_redirect(redirect_uri):
        raise HTTPException(400, "invalid_request")
    return HTMLResponse(_page(provider, redirect_uri, state, simulate == "error"))


@router.post("/auth-shim/decision")
def decision(provider: str = Form(...), redirect_uri: str = Form(...), state: str = Form(""),
             decision: str = Form(...), simulate: str = Form("")):
    if provider not in ("google", "linkedin") or not _allowed_redirect(redirect_uri):
        raise HTTPException(400, "invalid_request")
    params = {"state": state}
    if decision == "approve":
        if simulate == "error":
            params["code"] = SIMULATED_FAILURE_CODE
        else:
            code = secrets.token_urlsafe(24)
            _codes[code] = (provider, time.time() + _CODE_TTL)
            params["code"] = code
    else:
        params["error"] = "access_denied"
    sep = "&" if "?" in redirect_uri else "?"
    return RedirectResponse(f"{redirect_uri}{sep}{urlencode(params)}", status_code=302)


@router.get("/auth-shim/photos/{name}")
def photo(name: str):
    if name not in ("jordan.jpg", "priya.jpg"):
        raise HTTPException(404)
    return FileResponse(FIXTURES_DIR / name, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
