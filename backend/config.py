"""Runtime configuration for the ARGUS backend."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import random

ROOT = Path(__file__).resolve().parent.parent


def _values_from_file(path: Path) -> list[str]:
    if not path.is_file():
        return []
    values: list[str] = []
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            line = line.split("=", 1)[1].strip()
        line = line.split("#", 1)[0].strip().strip('"\'')
        if line:
            values.append(line)
    return values


def _env_values(name: str) -> list[str]:
    return [v.strip() for v in os.getenv(name, "").split(",") if v.strip()]


def api_keys() -> dict[str, list[str]]:
    env_file = os.getenv("ARGUS_API_KEYS_FILE", "").strip()
    if env_file:
        file_path = Path(env_file) if Path(env_file).is_absolute() else (ROOT / env_file)
        if not file_path.is_file():
            file_path = ROOT / "api_keys.txt"
    else:
        file_path = ROOT / "api_keys.txt"
    nvidia = _env_values("NVIDIA_API_KEYS")
    groq = _env_values("GROQ_API_KEYS") + _env_values("GROQ_API_KEY")
    vyce = _env_values("VYCEAI_API_KEYS") + _env_values("VYCE_API_KEY") + _env_values("VYCEAI_API_KEY")
    inception = _env_values("INCEPTION_API_KEYS") + _env_values("INCEPTION_API_KEY")
    nara = _env_values("NARA_API_KEYS") + _env_values("NARA_API_KEY")
    for value in _values_from_file(file_path):
        if value.startswith("nvapi-"):
            nvidia.append(value)
        elif value.startswith("gsk_"):
            groq.append(value)
        elif value.startswith("sk-484b"):
            vyce.append(value)
        elif value.startswith("sk_"):
            inception.append(value)
        elif value.startswith("sk-nry-"):
            nara.append(value)
    return {
        "nvidia": list(dict.fromkeys(nvidia)),
        "groq": list(dict.fromkeys(groq)),
        "vyce": list(dict.fromkeys(vyce)),
        "inception": list(dict.fromkeys(inception)),
        "nara": list(dict.fromkeys(nara)),
    }


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    model: str
    base_url: str | None
    api_key: str | None


NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
VYCE_BASE_URL = "https://vyceai.com/v1"
INCEPTION_BASE_URL = "https://api.inceptionlabs.ai/v1"
NARA_BASE_URL = "https://router.bynara.id/v1"


def _nvidia_model() -> str:
    return os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b")


def _groq_model() -> str:
    return os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")


def _vyce_model() -> str:
    return os.getenv("VYCE_MODEL", "deepseek-v4-flash")


def _inception_model() -> str:
    return os.getenv("INCEPTION_MODEL", "mercury-2")


def _nara_model() -> str:
    return os.getenv("NARA_MODEL", "agnes-2.5-flash")


def llm_candidates() -> list[LLMConfig]:
    """Every usable provider/key pair, in the order they should be tried.

    Groq & Inception are prioritized for sub-second responses, with VyceAI,
    NaraRouter, and NVIDIA NIM available as automatic failovers.
    """
    keys = api_keys()
    preferred = os.getenv("ARGUS_LLM_PROVIDER", "groq").lower()

    nvidia_keys = list(keys["nvidia"])
    groq_keys = list(keys["groq"])
    vyce_keys = list(keys["vyce"])
    inc_keys = list(keys["inception"])
    nara_keys = list(keys["nara"])

    random.shuffle(nvidia_keys)
    random.shuffle(groq_keys)
    random.shuffle(vyce_keys)
    random.shuffle(inc_keys)
    random.shuffle(nara_keys)

    primary_groq = os.getenv("GROQ_PRIMARY_KEY", "")
    if primary_groq and primary_groq in groq_keys:
        groq_keys.remove(primary_groq)
        groq_keys.insert(0, primary_groq)

    nvidia = [LLMConfig("nvidia", _nvidia_model(), os.getenv("NVIDIA_BASE_URL", NVIDIA_BASE_URL), k) for k in nvidia_keys]
    groq = [LLMConfig("groq", _groq_model(), GROQ_BASE_URL, k) for k in groq_keys]
    vyce = [LLMConfig("vyce", _vyce_model(), os.getenv("VYCE_BASE_URL", VYCE_BASE_URL), k) for k in vyce_keys]
    inception = [LLMConfig("inception", _inception_model(), os.getenv("INCEPTION_BASE_URL", INCEPTION_BASE_URL), k) for k in inc_keys]
    nara = [LLMConfig("nara", _nara_model(), os.getenv("NARA_BASE_URL", NARA_BASE_URL), k) for k in nara_keys]

    all_list = groq + inception + vyce + nara + nvidia
    if preferred == "nvidia":
        return nvidia + groq + inception + vyce + nara
    elif preferred == "inception":
        return inception + groq + vyce + nara + nvidia
    elif preferred == "nara":
        return nara + groq + inception + vyce + nvidia
    elif preferred == "vyce":
        return vyce + groq + inception + nara + nvidia
    return all_list


def llm_config() -> LLMConfig:
    candidates = llm_candidates()
    if candidates:
        return candidates[0]
    return LLMConfig(provider="none", model=_nvidia_model(), base_url=None, api_key=None)


def get_mongo_uri() -> str:
    uri = os.getenv("MONGO_URI", "").strip()
    if uri:
        return uri
    for p in [ROOT / ".streamlit" / "secrets.toml", ROOT / "secrets.toml"]:
        if p.is_file():
            for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line.startswith("MONGO_URI"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        return parts[1].strip().strip('"\'')
    return ""


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "").strip()
    if secret:
        return secret
    for p in [ROOT / ".streamlit" / "secrets.toml", ROOT / "secrets.toml"]:
        if p.is_file():
            for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line.startswith("JWT_SECRET"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        return parts[1].strip().strip('"\'')
    return "argus-eda-super-secret-2024-xZ9mP2qL"
