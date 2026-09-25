"""Centralised settings. Every secret and endpoint comes from the environment
(.env locally, docker-compose env in containers). Nothing sensitive is hard-coded."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Local runs (uvicorn from VS Code): read ../../.env. In Docker the variables
# are already set and take precedence (override=False).
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)


def _s(name: str, default: str | None = None) -> str | None:
    v = os.getenv(name)
    return default if v is None or v.strip() == "" else v.strip().strip('"').strip("'")


def _i(name: str, default: int) -> int:
    try:
        return int(_s(name, str(default)))
    except (TypeError, ValueError):
        return default


def _f(name: str) -> float | None:
    try:
        return float(_s(name, ""))
    except (TypeError, ValueError):
        return None


def is_placeholder(value: str | None) -> bool:
    return not value or value.lower().startswith(("your", "change-me"))


class Settings:
    port = _i("PORT", 4000)
    app_base_url = (_s("APP_BASE_URL", "http://localhost:4000")).rstrip("/")
    session_secret = _s("SESSION_SECRET", "change-me-to-a-long-random-string")

    database_url = _s("DATABASE_URL", "postgresql://dev:dev_local_only@localhost:5432/coaching_platform_dev")

    smtp_host = _s("SMTP_HOST", "localhost")
    smtp_port = _i("SMTP_PORT", 1025)
    mail_from = _s("MAIL_FROM", "Coaching Platform <no-reply@coaching-platform.local>")
    magic_link_ttl_hours = _i("MAGIC_LINK_TTL_HOURS", 24)

    s3_endpoint = _s("S3_ENDPOINT_URL", "http://localhost:9000")
    # Presigned URLs must be signed for the host the *browser* uses.
    s3_public_endpoint = _s("S3_PUBLIC_ENDPOINT_URL", _s("S3_ENDPOINT_URL", "http://localhost:9000"))
    s3_region = _s("S3_REGION", "us-east-1")
    s3_access_key = _s("S3_ACCESS_KEY", "")
    s3_secret_key = _s("S3_SECRET_KEY", "")
    s3_bucket = _s("S3_BUCKET", "coaching-platform-dev")
    s3_auto_create_bucket = _s("S3_AUTO_CREATE_BUCKET", "true").lower() == "true"
    photo_url_ttl_seconds = _i("PHOTO_URL_TTL_SECONDS", 900)

    # Local fake authorize endpoint (Story 3). Served by this app at /auth-shim/authorize.
    auth_shim_url = (_s("AUTH_SHIM_URL", "") or "").rstrip("/")
    # Where the backend downloads fixture photos from (itself).
    auth_shim_photo_base = (_s("AUTH_SHIM_PHOTO_BASE_URL", f"http://localhost:{_i('PORT', 4000)}")).rstrip("/")

    firecrawl_api_key = _s("FIRECRAWL_API_KEY", "")
    firecrawl_api_url = (_s("FIRECRAWL_API_URL", "https://api.firecrawl.dev/v1")).rstrip("/")
    firecrawl_timeout = _i("FIRECRAWL_TIMEOUT_SECONDS", 45)

    llm_provider = (_s("LLM_PROVIDER", "anthropic") or "anthropic").lower()
    llm_max_tokens = _i("LLM_MAX_TOKENS", 700)
    llm_timeout = _i("LLM_TIMEOUT_SECONDS", 60)

    anthropic_api_key = _s("ANTHROPIC_API_KEY", "")
    anthropic_model = _s("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
    anthropic_base_url = _s("ANTHROPIC_BASE_URL", None)  # tests only
    anthropic_in_usd = _f("ANTHROPIC_INPUT_USD_PER_MTOK")
    anthropic_out_usd = _f("ANTHROPIC_OUTPUT_USD_PER_MTOK")

    groq_api_key = _s("GROQ_API_KEY", "")
    groq_model = _s("GROQ_MODEL", "llama-3.3-70b-versatile")
    groq_api_url = (_s("GROQ_API_URL", "https://api.groq.com/openai/v1")).rstrip("/")
    groq_in_usd = _f("GROQ_INPUT_USD_PER_MTOK")
    groq_out_usd = _f("GROQ_OUTPUT_USD_PER_MTOK")

    max_resume_bytes = 5 * 1024 * 1024
    max_photo_bytes = 5 * 1024 * 1024


settings = Settings()
