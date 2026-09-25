"""Coach-scoped API under /api/v1/app. Every route requires a signed session,
and the {coach_id} in the path must be that session's coach."""
import io
import json

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, Response, UploadFile
from PIL import Image, UnidentifiedImageError

from .. import logger, repositories as repo, storage
from ..config import settings
from ..errors import AppError
from ..services.resume import is_pdf
from ..services.story import has_any_material, run_story_generation
from ..session import clear_session, get_session_coach_id
from ..validation import clean_text, normalize_quick_answers, normalize_website_url, validate_portfolio_patch

router = APIRouter(prefix="/api/v1/app")


def session_coach(request: Request, response: Response) -> dict:
    coach_id = get_session_coach_id(request)
    coach = repo.coach_by_id(coach_id) if coach_id else None
    if not coach or coach["status"] != "active":
        if coach_id:
            clear_session(response)
        raise AppError(401, "Please sign in to continue.", "not_signed_in")
    return coach


def own_coach(coach_id: str, coach: dict = Depends(session_coach)) -> dict:
    if coach_id != coach["coach_id"]:
        raise AppError(403, "You can only access your own profile.", "forbidden")
    return coach


@router.get("/me")
def me(coach: dict = Depends(session_coach)):
    return {k: coach[k] for k in ("coach_id", "coach_type", "org_id", "coach_name", "coach_email", "auth_provider",
                                  "story_text", "website_url", "bio_status")}


def _list(value: str | None):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else [parsed]
    except ValueError:
        return [value]


# Page 2 submission (Story 8) — Continue and Skip behave the same.
@router.post("/coaches/{coach_id}/personalize")
async def personalize(
    coach: dict = Depends(own_coach),
    mode: str = Form("auto"),
    narrative: str = Form(""),
    website_url: str = Form(""),
    niches: str = Form(""),
    credentials: str = Form(""),
    clients_coached: str = Form(""),
    resume: UploadFile | None = File(None),
):
    narrative = clean_text(narrative)
    if len(narrative) > 1000:
        raise AppError(400, "Please keep this to a sentence or two (under 1,000 characters).", "narrative_too_long")

    fields: dict = {}
    if narrative:  # step 1
        fields["story_text"] = narrative

    resume_bytes = None
    if mode == "auto":
        url = normalize_website_url(website_url)  # step 2
        if url:
            fields["website_url"] = url
        if resume is not None and resume.filename:
            resume_bytes = await resume.read(settings.max_resume_bytes + 1)
            if len(resume_bytes) > settings.max_resume_bytes:
                raise AppError(400, "That PDF is larger than 5 MB. Please upload a smaller file.", "resume_too_large")
            if not is_pdf(resume_bytes):
                raise AppError(400, "Please upload your resume as a PDF file.", "resume_not_pdf")
    elif mode == "quick":  # step 4
        fields.update(normalize_quick_answers(_list(niches), _list(credentials), clients_coached))
    else:
        raise AppError(400, "Invalid request.", "invalid_mode")

    if resume_bytes:  # step 3
        key = f"{storage.coach_prefix(coach)}/resume.pdf"
        try:
            storage.put_object(key, resume_bytes, "application/pdf")
        except Exception as exc:  # noqa: BLE001
            logger.error("resume upload failed", error=type(exc).__name__)
            raise AppError(503, "We couldn't store your resume right now. Please try again in a minute.", "storage_unavailable") from None
        fields["resume_s3_key"] = key

    updated = repo.update_coach_fields(coach["coach_id"], fields)
    return {"generate": has_any_material(updated)}  # step 5 — the client then calls /story/generate


# generate_coach_story (Story 9)
@router.post("/coaches/{coach_id}/story/generate", status_code=202)
def generate_story(background: BackgroundTasks, coach: dict = Depends(own_coach)):
    if not has_any_material(coach):
        raise AppError(400, "Add a narrative, website, resume or quick answers first.", "no_material")
    if not repo.claim_processing(coach["coach_id"]):
        return {"bio_status": "processing", "started": False}  # already running: no second run, no extra logs
    background.add_task(run_story_generation, coach["coach_id"])
    return {"bio_status": "processing", "started": True}


def portfolio_json(coach: dict) -> dict:
    photo_url = None
    if coach.get("photo_s3_key"):
        try:
            photo_url = storage.presign_get(coach["photo_s3_key"])  # fresh on every call
        except Exception as exc:  # noqa: BLE001
            logger.warn("could not presign photo", error=type(exc).__name__)
    last = repo.latest_story_run(coach["coach_id"])
    return {
        "coach_id": coach["coach_id"],
        "coach_name": coach["coach_name"],
        "headline": coach["headline"],
        "coaching_niche": coach["coaching_niche"] or [],
        "credential": coach["credential"] or [],
        "story_heading": coach["story_heading"],
        "coach_story": coach["coach_story"],
        "bio_status": coach["bio_status"],
        "linkedin_handle": coach["linkedin_handle"],
        "coach_email": coach["coach_email"],
        "photo_presigned_url": photo_url,
        # extras used by the UI
        "last_story_run": {"status": last["status"], "created_at": last["created_at"].isoformat()} if last else None,
        "can_generate": has_any_material(coach),
    }


# get_coach_portfolio (Story 10)
@router.get("/coaches/{coach_id}/portfolio")
def get_portfolio(response: Response, coach: dict = Depends(own_coach)):
    response.headers["Cache-Control"] = "no-store"
    return portfolio_json(coach)


# PATCH edit endpoint (Story 12)
@router.patch("/coaches/{coach_id}")
async def patch_coach(request: Request, response: Response, coach: dict = Depends(own_coach)):
    try:
        body = await request.json()
    except ValueError:
        raise AppError(400, "Invalid request.", "invalid_body") from None
    updates = validate_portfolio_patch(body, f"{storage.coach_prefix(coach)}/photo.jpg")
    if "coach_story" in updates and coach["bio_status"] == "processing":
        raise AppError(409, "Your story is still being generated. Try again in a few seconds.", "story_processing")
    if updates.get("coach_email") and updates["coach_email"] != (coach["coach_email"] or "").lower():
        if repo.email_taken_by_other(updates["coach_email"], coach["coach_id"]):
            raise AppError(409, "That email is already used by another account.", "email_taken")
    updated = repo.update_coach_fields(coach["coach_id"], updates)
    response.headers["Cache-Control"] = "no-store"
    return portfolio_json(updated)


# Photo upload (Story 11): bytes -> MinIO photo.jpg; the client then PATCHes photo_s3_key.
@router.post("/coaches/{coach_id}/photo")
async def upload_photo(coach: dict = Depends(own_coach), file: UploadFile = File(...)):
    data = await file.read(settings.max_photo_bytes + 1)
    if len(data) > settings.max_photo_bytes:
        raise AppError(400, "That image is larger than 5 MB. Please choose a smaller one.", "photo_too_large")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise AppError(400, "Please choose a JPG, PNG or WebP image.", "photo_invalid") from None
    img = img.convert("RGB")  # always store a real JPEG at photo.jpg
    img.thumbnail((1600, 1600))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    key = f"{storage.coach_prefix(coach)}/photo.jpg"
    try:
        storage.put_object(key, out.getvalue(), "image/jpeg")
    except Exception as exc:  # noqa: BLE001
        logger.error("photo upload failed", error=type(exc).__name__)
        raise AppError(503, "We couldn't save your photo right now. Please try again.", "storage_unavailable") from None
    return {"photo_s3_key": key}
