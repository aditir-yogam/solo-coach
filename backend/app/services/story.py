"""generate_coach_story (Story 9).

Source priority from the stored coach row: website_url (real Firecrawl) ->
resume_s3_key (local PDF text) -> niche/credential/clients_coached. story_text is
always included. A failed crawl is logged and falls through to the next source.

Per run: exactly one llm_use row (success or failure). A tool_use row only when
a website crawl was attempted. On any failure bio_status goes back to
'not_started'. Runs only start after repositories.claim_processing() moved the
coach into 'processing' atomically, so duplicate requests can't double-log."""
import re

from .. import logger, repositories as repo, storage
from . import firecrawl, llm, resume
from .prompt import build_prompt
from .words import cap_words, count_words, tidy_story

MIN_WEBSITE_CHARS = 200
MIN_RESUME_CHARS = 100

# Test hooks
deps = {"scrape": firecrawl.scrape, "extract_resume": None, "generate": llm.generate}


def _safe(err) -> str:
    msg = str(err) or type(err).__name__
    msg = re.sub(r"sk-ant-[A-Za-z0-9_-]+|gsk_[A-Za-z0-9]+|fc-[A-Za-z0-9]{8,}", "[redacted]", msg)
    return msg[:500]


def has_any_material(coach: dict) -> bool:
    """Story 8 step 5: generate unless ALL six fields are empty/null."""
    return any([coach.get("story_text"), coach.get("website_url"), coach.get("resume_s3_key"),
                coach.get("coaching_niche"), coach.get("credential"), coach.get("clients_coached")])


def quick_answers_text(coach: dict) -> str:
    """Niche + credential + clients_coached joined as plain text."""
    lines = []
    if coach.get("coaching_niche"):
        lines.append(f"Coaching niche(s): {', '.join(coach['coaching_niche'])}")
    if coach.get("credential"):
        lines.append(f"Credential: {', '.join(coach['credential'])}")
    if coach.get("clients_coached"):
        lines.append(f"Clients currently coaching: {coach['clients_coached']}")
    return "\n".join(lines)


def _extract_resume(key: str) -> str:
    if deps["extract_resume"]:
        return deps["extract_resume"](key)
    data = storage.get_object_bytes(key)
    if not resume.is_pdf(data):
        raise ValueError("stored resume is not a PDF")
    return resume.extract_text(data)


def resolve_source(coach: dict) -> tuple[str, str]:
    cid, org = coach["coach_id"], coach.get("org_id")
    if coach.get("website_url"):
        try:
            page = deps["scrape"](coach["website_url"])
            repo.insert_tool_use(coach_id=cid, org_id=org, credits_used=page["credits_used"], status="success")
            if len(page["text"]) >= MIN_WEBSITE_CHARS:
                return "website", f"Website: {coach['website_url']}\n\n{page['text']}"
            logger.warn("website returned too little text, falling back", coach_id=cid)
        except Exception as exc:  # noqa: BLE001 — Story 9: fall through, don't abort
            repo.insert_tool_use(coach_id=cid, org_id=org, credits_used=None, status="failure", error_message=_safe(exc))
            logger.warn("firecrawl failed, falling back", coach_id=cid, error=_safe(exc))
    if coach.get("resume_s3_key"):
        try:
            text = _extract_resume(coach["resume_s3_key"])
            if len(text) >= MIN_RESUME_CHARS:
                return "resume", text
            logger.warn("resume had too little text (scanned PDF?), falling back", coach_id=cid)
        except Exception as exc:  # noqa: BLE001
            logger.warn("resume extraction failed, falling back", coach_id=cid, error=_safe(exc))
    return "quick", quick_answers_text(coach)


def run_story_generation(coach_id: str) -> dict:
    """Background task body. Never raises."""
    provider, model = llm.provider_and_model()
    logged = False
    coach = None
    try:
        coach = repo.coach_by_id(coach_id)
        if coach is None:
            raise RuntimeError("coach not found")
        source, material = resolve_source(coach)
        system, user = build_prompt(coach.get("story_heading") or "How I Help", material, coach.get("story_text"))
        try:
            result = deps["generate"](system, user)
        except Exception as exc:
            repo.insert_llm_use(coach_id=coach_id, org_id=coach.get("org_id"), provider=provider, model=model,
                                status="failure", error_message=_safe(exc))
            logged = True
            raise
        story = cap_words(tidy_story(result["text"]), 200)
        words = count_words(story)
        empty = "model returned an empty story" if words == 0 else None
        repo.insert_llm_use(coach_id=coach_id, org_id=coach.get("org_id"), provider=result["provider"],
                            model=result["model"], input_tokens=result["input_tokens"],
                            output_tokens=result["output_tokens"], cost_usd=result["cost_usd"],
                            status="failure" if empty else "success", error_message=empty)
        logged = True
        if empty:
            raise RuntimeError(empty)
        repo.set_story_done(coach_id, story)
        logger.info("coach story generated", coach_id=coach_id, source=source, words=words, provider=result["provider"])
        return {"status": "success", "source": source, "words": words}
    except Exception as exc:  # noqa: BLE001
        logger.error("coach story generation failed", coach_id=coach_id, error=_safe(exc))
        try:
            if not logged:
                repo.insert_llm_use(coach_id=coach_id, org_id=(coach or {}).get("org_id"), provider=provider,
                                    model=model, status="failure", error_message=_safe(exc))
            repo.set_bio_not_started(coach_id)
        except Exception as log_exc:  # noqa: BLE001
            logger.error("could not record generation failure", coach_id=coach_id, error=_safe(log_exc))
        return {"status": "failure", "error": _safe(exc)}
