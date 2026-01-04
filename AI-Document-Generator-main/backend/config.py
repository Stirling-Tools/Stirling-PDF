import logging
import os
from typing import Optional


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
ASSETS_DIR = os.path.join(OUTPUT_DIR, "assets")
DATA_DIR = os.path.join(BASE_DIR, "data")
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
STYLE_DB_PATH = os.path.join(DATA_DIR, "user_styles.json")
TEMPLATE_DB_PATH = os.path.join(DATA_DIR, "user_templates.json")
VERSIONS_DB_PATH = os.path.join(DATA_DIR, "versions.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(TEMPLATE_DIR, exist_ok=True)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL")
JAVA_BACKEND_URL = os.environ.get("JAVA_BACKEND_URL", "http://localhost:8080")
# Default to GPT-5.1 for full document generation (smart model).
# Allow override via SMART_MODEL or legacy OPENAI_MODEL.
SMART_MODEL = os.environ.get("SMART_MODEL") or os.environ.get("OPENAI_MODEL") or "gpt-5.1"
# Default to the nano/ultra-fast tier for intent/pre checks (fast model).
# Allow override via FAST_MODEL or legacy FAST_INTENT_MODEL.
FAST_MODEL = os.environ.get("FAST_MODEL") or os.environ.get("FAST_INTENT_MODEL") or "gpt-4.1-nano"

CLIENT_MODE: Optional[str] = None
LANGCHAIN_AVAILABLE = False
_ChatOpenAI = None
STREAMING_ENABLED = os.environ.get("AI_STREAMING", "true").lower() not in {"0", "false", "no"}
if OPENAI_BASE_URL and "ollama" in OPENAI_BASE_URL and "AI_STREAMING" not in os.environ:
    STREAMING_ENABLED = False
PREVIEW_MAX_INFLIGHT = int(os.environ.get("AI_PREVIEW_MAX_INFLIGHT", "3"))

if OPENAI_API_KEY:
    try:
        from langchain_openai import ChatOpenAI  # type: ignore

        _ChatOpenAI = ChatOpenAI
        LANGCHAIN_AVAILABLE = True
        CLIENT_MODE = "langchain"
    except Exception as client_exc:  # pragma: no cover - import guard
        logger.warning("LangChain OpenAI init failed: %s", client_exc)

if CLIENT_MODE == "langchain":
    logger.info("AI mode: LIVE (fast_model=%s smart_model=%s)", FAST_MODEL, SMART_MODEL)
else:
    logger.info("AI mode: MOCK (no OpenAI key or LangChain init failure)")


def get_chat_model(
    model_name: str,
    streaming: bool = False,
    max_tokens: Optional[int] = None,
    model_kwargs: Optional[dict] = None,
):
    if not LANGCHAIN_AVAILABLE or not _ChatOpenAI:
        return None
    kwargs = {"model": model_name, "api_key": OPENAI_API_KEY, "streaming": streaming}
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if model_kwargs:
        kwargs["model_kwargs"] = model_kwargs
    return _ChatOpenAI(**kwargs)

__all__ = [
    "logger",
    "OUTPUT_DIR",
    "ASSETS_DIR",
    "DATA_DIR",
    "TEMPLATE_DIR",
    "STYLE_DB_PATH",
    "TEMPLATE_DB_PATH",
    "VERSIONS_DB_PATH",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "JAVA_BACKEND_URL",
    "SMART_MODEL",
    "CLIENT_MODE",
    "LANGCHAIN_AVAILABLE",
    "get_chat_model",
    "FAST_MODEL",
    "STREAMING_ENABLED",
    "PREVIEW_MAX_INFLIGHT",
]
