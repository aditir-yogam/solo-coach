"""Real Firecrawl call. Uses /scrape on the coach's URL: synchronous, ~1 credit,
returns clean page markdown (the multi-page /crawl endpoint is async and can use
many free-tier credits)."""
import httpx

from ..config import is_placeholder, settings

MAX_CHARS = 15000


class FirecrawlError(Exception):
    pass


def scrape(url: str) -> dict:
    if is_placeholder(settings.firecrawl_api_key):
        raise FirecrawlError("Firecrawl API key is not configured (FIRECRAWL_API_KEY)")
    try:
        res = httpx.post(
            f"{settings.firecrawl_api_url}/scrape",
            headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"},
            json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
            timeout=settings.firecrawl_timeout,
        )
    except httpx.TimeoutException:
        raise FirecrawlError("Firecrawl request timed out") from None
    except httpx.HTTPError as exc:
        raise FirecrawlError(f"Firecrawl request failed: {type(exc).__name__}") from None
    try:
        body = res.json()
    except ValueError:
        body = {}
    if res.status_code >= 400 or body.get("success") is False:
        reason = body.get("error") or body.get("message") or f"HTTP {res.status_code}"
        raise FirecrawlError(f"Firecrawl error: {str(reason)[:300]}")
    data = body.get("data") or {}
    markdown = str(data.get("markdown") or "").strip()
    credits = (data.get("metadata") or {}).get("creditsUsed", body.get("creditsUsed", 1))
    try:
        credits = float(credits)
    except (TypeError, ValueError):
        credits = 1
    return {"text": markdown[:MAX_CHARS], "credits_used": credits}
