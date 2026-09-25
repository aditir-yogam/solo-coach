import pytest

from app.errors import AppError
from app.services.prompt import TEMPLATE_PATH, build_prompt
from app.services.resume import extract_text, is_pdf
from app.services.story import has_any_material, quick_answers_text
from app.services.words import cap_words, count_words, tidy_story
from app.validation import (normalize_linkedin_handle, normalize_quick_answers, normalize_website_url, resolve_org,
                            validate_portfolio_patch)

KEY = "coaches/11111111-1111-4111-8111-111111111111/photo.jpg"


def test_patch_accepts_only_the_seven_fields():
    with pytest.raises(AppError):
        validate_portfolio_patch({"bio_status": "done"}, KEY)
    with pytest.raises(AppError):
        validate_portfolio_patch({"coach_name": "A", "status": "active"}, KEY)
    with pytest.raises(AppError):
        validate_portfolio_patch({}, KEY)
    out = validate_portfolio_patch({"coach_name": "  Jordan   Blake ", "headline": "", "coach_email": "J@Example.com",
                                    "linkedin_handle": "https://www.linkedin.com/in/jordan-blake/", "photo_s3_key": KEY}, KEY)
    assert out == {"coach_name": "Jordan Blake", "headline": None, "coach_email": "j@example.com",
                   "linkedin_handle": "linkedin.com/in/jordan-blake", "photo_s3_key": KEY}


def test_patch_rejects_foreign_photo_keys_and_bad_values():
    for bad in ({"photo_s3_key": "coaches/other/photo.jpg"}, {"coach_email": "nope"}, {"coach_name": " "},
                {"story_heading": "x" * 81}, {"coach_story": 42}):
        with pytest.raises(AppError):
            validate_portfolio_patch(bad, KEY)


def test_website_url_rules():
    assert normalize_website_url("coach.com") == "https://coach.com/"
    assert normalize_website_url("https://coach.com/about#x") == "https://coach.com/about"
    assert normalize_website_url("  ") is None
    for bad in ("ftp://coach.com", "http://localhost:3000", "http://10.0.0.1", "not a url", "https://u:p@coach.com", "http://minio"):
        with pytest.raises(AppError):
            normalize_website_url(bad)


def test_quick_answers_keep_wireframe_order_and_reject_unknown():
    out = normalize_quick_answers(["Business", "Executive & leadership", "Business"], ["ICF"], "6–25")
    assert out == {"coaching_niche": ["Executive & leadership", "Business"], "credential": ["ICF"], "clients_coached": "6–25"}
    assert normalize_quick_answers([], [], "") == {"coaching_niche": None, "credential": None, "clients_coached": None}
    with pytest.raises(AppError):
        normalize_quick_answers(["Astrology"], [], "")


def test_tenancy_detection():
    assert resolve_org("") == ("SO", None)
    assert resolve_org("acme")[0] == "IN"
    with pytest.raises(AppError):
        resolve_org("unknown-org")


def test_linkedin_handle():
    assert normalize_linkedin_handle("@priya-r") == "linkedin.com/in/priya-r"
    with pytest.raises(AppError):
        normalize_linkedin_handle("a b")


def test_generate_decision_story8_step5():
    assert has_any_material({}) is False
    assert has_any_material({"story_text": "I help nurses."}) is True  # narrative alone is enough
    assert has_any_material({"coaching_niche": ["Life"]}) is True


def test_quick_answers_joined_as_plain_text():
    text = quick_answers_text({"coaching_niche": ["Career"], "credential": ["ICF"], "clients_coached": "1–5"})
    assert text == "Coaching niche(s): Career\nCredential: ICF\nClients currently coaching: 1–5"


def test_locked_prompt_used_verbatim():
    template = TEMPLATE_PATH.read_text()
    system, user = build_prompt("How I Help New Managers", "SOURCE", "MY WORDS")
    assert system.startswith("You are an empathetic professional coach's ghostwriter.")
    assert '"How I Help New Managers"' in system and "{story_heading}" not in system
    assert "Do not invent credentials, client outcomes, or\nspecifics the coach did not provide." in system
    assert "Inputs to insert" not in system  # the inputs-documentation block is not sent
    assert system == template.split("\n---")[0].strip().replace("{story_heading}", "How I Help New Managers")
    assert "SOURCE" in user and "MY WORDS" in user


def test_word_cap_and_tidy():
    text = ("This is a sentence of exactly ten words right here. " * 25).strip()
    out = cap_words(text, 200)
    assert count_words(out) == 200 and out.endswith(".")
    assert tidy_story('Here is the story:\n\n# How I Help\n\n"I help **you** grow."') == "I help you grow."


def test_resume_pdf_extraction():
    data = open("../acceptance/fixtures/sample-resume.pdf", "rb").read()
    assert is_pdf(data) and not is_pdf(b"<html>")
    text = extract_text(data)
    assert "Priya Raman" in text and "mid-career professionals" in text
