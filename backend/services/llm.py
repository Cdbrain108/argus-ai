"""Provider-agnostic OpenAI-compatible LLM client.

NVIDIA NIM is preferred when an ``nvapi-*`` key is available. Groq remains a
supported fallback, and callers do not need to know which provider is active.

Every call fails over down the candidate list from :func:`llm_candidates` — a
timeout or a rejected key on one entry moves to the next instead of failing the
whole request. Failure is surfaced as :class:`LLMUnavailable` so callers can
tell "the model was unreachable" apart from "the analysis produced nothing".
"""
from __future__ import annotations

import os
import time
from typing import Optional

from openai import AsyncOpenAI, OpenAI

from backend.config import LLMConfig, llm_candidates, llm_config

GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")


def _timeout(name: str, default: str) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return float(default)


# Short prompts (intent classification, explanations) versus long generations
# (custom-analysis code). Fast responsive default.
def chat_timeout() -> float:
    return _timeout("ARGUS_LLM_TIMEOUT", "10")


def codegen_timeout() -> float:
    return _timeout("ARGUS_LLM_CODEGEN_TIMEOUT", "25")


class LLMUnavailable(RuntimeError):
    """No configured provider could serve the request."""

    def __init__(self, message: str, error_type: str = "llm_unavailable", retryable: bool = True):
        super().__init__(message)
        self.error_type = error_type
        self.retryable = retryable


def _client(config: LLMConfig, timeout: float) -> OpenAI:
    return OpenAI(api_key=config.api_key, base_url=config.base_url, timeout=timeout, max_retries=0)


def get_llm_client() -> OpenAI:
    config = llm_config()
    if not config.api_key or not config.base_url:
        raise LLMUnavailable("No LLM API key configured", "llm_not_configured", retryable=False)
    return _client(config, chat_timeout())


def get_async_llm_client() -> AsyncOpenAI:
    config = llm_config()
    if not config.api_key or not config.base_url:
        raise LLMUnavailable("No LLM API key configured", "llm_not_configured", retryable=False)
    return AsyncOpenAI(api_key=config.api_key, base_url=config.base_url, timeout=chat_timeout(), max_retries=0)


get_groq_client = get_llm_client
get_groq_async_client = get_async_llm_client


def is_configured() -> bool:
    """True when at least one provider key is present.

    Callers use this to skip the network entirely and stay on deterministic
    paths rather than spending a timeout discovering there is no key.
    """
    return bool(llm_candidates())


def provider_status() -> dict:
    config = llm_config()
    candidates = llm_candidates()
    return {
        "provider": config.provider,
        "model": config.model,
        "configured": bool(config.api_key),
        "candidates": len(candidates),
        "providers": sorted({c.provider for c in candidates}),
        "chat_timeout_s": chat_timeout(),
        "codegen_timeout_s": codegen_timeout(),
    }


def _classify_error(exc: Exception) -> tuple[str, bool]:
    """Map a provider exception to (error_type, retryable)."""
    name = type(exc).__name__
    if "Timeout" in name:
        return "llm_timeout", True
    if "AuthenticationError" in name or "PermissionDenied" in name:
        return "llm_auth", False
    if "NotFound" in name:
        return "llm_model_not_found", False
    if "RateLimit" in name:
        return "llm_rate_limited", True
    return "llm_error", True


def chat_completion(
    prompt: str,
    system_prompt: Optional[str] = None,
    max_tokens: int = 300,
    temperature: float = 0.5,
    timeout: Optional[float] = None,
    total_budget: Optional[float] = None,
) -> str:
    """Run a completion, failing over across every configured key/provider.

    ``timeout`` bounds a single attempt; ``total_budget`` bounds the whole call
    so a long candidate list cannot stack timeouts into a minute-long request.
    """
    candidates = llm_candidates()
    if not candidates:
        raise LLMUnavailable("No LLM API key configured", "llm_not_configured", retryable=False)

    attempt_timeout = timeout if timeout is not None else chat_timeout()
    budget = total_budget if total_budget is not None else attempt_timeout * 2

    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    started = time.monotonic()
    last_type, last_retryable, last_detail = "llm_error", True, "unknown error"

    for index, config in enumerate(candidates):
        elapsed = time.monotonic() - started
        if index > 0 and elapsed >= budget:
            break
        remaining = attempt_timeout if index == 0 else min(attempt_timeout, max(1.0, budget - elapsed))
        try:
            response = _client(config, remaining).chat.completions.create(
                model=config.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            text = (response.choices[0].message.content or "").strip()
            if text:
                return text
        except Exception as exc:  # noqa: BLE001 — provider SDKs raise a wide range
            last_type, last_retryable = _classify_error(exc)
            last_detail = f"{config.provider}/{config.model}: {exc}"
            if last_type in {"llm_auth", "llm_model_not_found"}:
                # A bad key or model id will fail identically on every retry with
                # this provider, so move on rather than burning the budget.
                continue

    raise LLMUnavailable(last_detail, last_type, retryable=last_retryable)


async def chat_completion_async(
    messages: list[dict],
    max_tokens: int = 400,
    temperature: float = 0.5,
    stream: bool = False,
):
    config = llm_config()
    client = get_async_llm_client()
    return await client.chat.completions.create(
        model=config.model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=stream,
    )
