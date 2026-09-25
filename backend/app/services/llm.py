"""LLM call for generate_coach_story. LLM_PROVIDER=anthropic (the epic's
requirement) or groq (free-tier option for local development)."""
import anthropic
import httpx

from ..config import is_placeholder, settings


class LLMConfigError(Exception):
    pass


def _cost(inp, out, in_rate, out_rate):
    if in_rate is None or out_rate is None or inp is None or out is None:
        return None
    return round((inp * in_rate + out * out_rate) / 1_000_000, 6)


def provider_and_model() -> tuple[str, str]:
    if settings.llm_provider == "groq":
        return "groq", settings.groq_model
    return "anthropic", settings.anthropic_model


def generate(system: str, user: str) -> dict:
    provider, model = provider_and_model()
    if provider == "groq":
        if is_placeholder(settings.groq_api_key):
            raise LLMConfigError("Groq API key is not configured (GROQ_API_KEY)")
        res = httpx.post(
            f"{settings.groq_api_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={"model": model, "max_tokens": settings.llm_max_tokens,
                  "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
            timeout=settings.llm_timeout,
        )
        if res.status_code >= 400:
            try:
                msg = res.json().get("error", {}).get("message", "")
            except ValueError:
                msg = ""
            raise RuntimeError(f"Groq error HTTP {res.status_code}: {msg[:200]}")
        body = res.json()
        usage = body.get("usage") or {}
        inp, out = usage.get("prompt_tokens"), usage.get("completion_tokens")
        return {"provider": "groq", "model": body.get("model") or model,
                "text": (body["choices"][0]["message"]["content"] or "").strip(),
                "input_tokens": inp, "output_tokens": out,
                "cost_usd": _cost(inp, out, settings.groq_in_usd, settings.groq_out_usd)}

    if is_placeholder(settings.anthropic_api_key):
        raise LLMConfigError("Anthropic API key is not configured (ANTHROPIC_API_KEY)")
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, base_url=settings.anthropic_base_url,
                                 timeout=settings.llm_timeout, max_retries=0)  # one run = one call = one llm_use row
    msg = client.messages.create(model=model, max_tokens=settings.llm_max_tokens, system=system,
                                 messages=[{"role": "user", "content": user}])
    text = "\n".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    inp, out = msg.usage.input_tokens, msg.usage.output_tokens
    return {"provider": "anthropic", "model": msg.model or model, "text": text, "input_tokens": inp,
            "output_tokens": out, "cost_usd": _cost(inp, out, settings.anthropic_in_usd, settings.anthropic_out_usd)}
