import logging
import os
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

import platformdirs
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from posthog import Posthog
from posthog.ai.langchain import CallbackHandler

# Load environment variables from .env file
load_dotenv()


def _get_log_path() -> Path:
    # Allow explicit override
    if os.environ["STIRLING_LOG_PATH"]:
        return Path(os.environ["STIRLING_LOG_PATH"])

    # Check if running in Tauri desktop mode
    is_tauri = os.environ["STIRLING_PDF_TAURI_MODE"].lower() == "true"

    if is_tauri:
        # Use OS-native log directory via platformdirs
        # On Mac: ~/Library/Logs/Stirling-PDF/
        # On Windows: %LOCALAPPDATA%/Stirling-PDF/Logs/
        # On Linux: ~/.local/state/Stirling-PDF/log/
        return Path(platformdirs.user_log_dir("Stirling-PDF"))

    # Server/Docker mode: ./logs/
    return Path("./logs")


LOG_PATH = _get_log_path()
LOG_PATH.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_PATH / "docgen.log"

# Create formatters
console_formatter = logging.Formatter(
    "%(asctime)s [%(thread)d] %(levelname)-5s %(name)s - %(message)s", datefmt="%H:%M:%S.%f"
)
file_formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s [%(thread)d] %(message)s")

# Configure root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(console_formatter)
root_logger.addHandler(console_handler)

# File handler with daily rotation, keeping 14 days
file_handler = TimedRotatingFileHandler(
    LOG_FILE,
    when="midnight",
    interval=1,
    backupCount=14,
    encoding="utf-8",
)
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(file_formatter)
root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)
logger.info(f"Logging to: {LOG_FILE}")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
ASSETS_DIR = os.path.join(OUTPUT_DIR, "assets")
DATA_DIR = os.path.join(BASE_DIR, "data")
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
TEMPLATE_DB_PATH = os.path.join(DATA_DIR, "user_templates.json")
VERSIONS_DB_PATH = os.path.join(DATA_DIR, "versions.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(TEMPLATE_DIR, exist_ok=True)

OPENAI_API_KEY = os.environ["STIRLING_OPENAI_API_KEY"]
OPENAI_BASE_URL = os.environ["STIRLING_OPENAI_BASE_URL"]
ANTHROPIC_API_KEY = os.environ["STIRLING_ANTHROPIC_API_KEY"]
JAVA_BACKEND_URL = os.environ["STIRLING_JAVA_BACKEND_URL"]
JAVA_BACKEND_API_KEY = os.environ["STIRLING_JAVA_BACKEND_API_KEY"]
JAVA_REQUEST_TIMEOUT_SECONDS = float(os.environ["STIRLING_JAVA_REQUEST_TIMEOUT_SECONDS"])

if not OPENAI_API_KEY and not ANTHROPIC_API_KEY:
    raise RuntimeError(
        "Either STIRLING_OPENAI_API_KEY or STIRLING_ANTHROPIC_API_KEY is required to start the AI backend."
    )
SMART_MODEL = os.environ["STIRLING_SMART_MODEL"]
FAST_MODEL = os.environ["STIRLING_FAST_MODEL"]

# GPT-5 reasoning effort configuration
# Supported values: minimal, low, medium, high, xhigh
# - minimal: Fastest (GPT-5 only)
# - low: Speed focused
# - medium: Default balance
# - high: Quality focused
# - xhigh: Maximum quality (GPT-5.2 Pro/Thinking only)
SMART_MODEL_REASONING_EFFORT = os.environ["STIRLING_SMART_MODEL_REASONING_EFFORT"]
FAST_MODEL_REASONING_EFFORT = os.environ["STIRLING_FAST_MODEL_REASONING_EFFORT"]

# GPT-5 text verbosity configuration
# Supported values: minimal, low, medium, high
# Controls output length and detail level
SMART_MODEL_TEXT_VERBOSITY = os.environ["STIRLING_SMART_MODEL_TEXT_VERBOSITY"]
FAST_MODEL_TEXT_VERBOSITY = os.environ["STIRLING_FAST_MODEL_TEXT_VERBOSITY"]

FLASK_DEBUG = os.environ["STIRLING_FLASK_DEBUG"] == "1"
STREAMING_ENABLED = os.environ["STIRLING_AI_STREAMING"].lower() not in {"0", "false", "no"}
if OPENAI_BASE_URL and "ollama" in OPENAI_BASE_URL and not os.environ["STIRLING_AI_STREAMING"]:
    STREAMING_ENABLED = False
PREVIEW_MAX_INFLIGHT = int(os.environ["STIRLING_AI_PREVIEW_MAX_INFLIGHT"])
AI_REQUEST_TIMEOUT_SECONDS = float(os.environ["STIRLING_AI_REQUEST_TIMEOUT"])
AI_RAW_DEBUG = os.environ["STIRLING_AI_RAW_DEBUG"].lower() not in {"", "0", "false", "no"}
AI_MESSAGES_LOG_PATH = LOG_PATH / "ai_messages"
AI_MESSAGES_LOG_PATH.mkdir(parents=True, exist_ok=True)


def model_max_tokens(model_name: str) -> int:
    """
    Output token limit for a given model.

    This is used by a few routes to avoid provider defaults that are too small for
    structured outputs. All values can be overridden via env vars.
    """
    if os.environ["STIRLING_AI_MAX_TOKENS"]:
        return int(os.environ["STIRLING_AI_MAX_TOKENS"])

    if model_name == SMART_MODEL:
        return int(os.environ["STIRLING_SMART_MODEL_MAX_TOKENS"])
    if model_name == FAST_MODEL:
        return int(os.environ["STIRLING_FAST_MODEL_MAX_TOKENS"])
    if model_name.startswith("claude"):
        return int(os.environ["STIRLING_CLAUDE_MAX_TOKENS"])

    return int(os.environ["STIRLING_DEFAULT_MODEL_MAX_TOKENS"])


# PostHog Analytics Configuration
POSTHOG_API_KEY = os.environ["STIRLING_POSTHOG_API_KEY"]
if not POSTHOG_API_KEY:
    raise RuntimeError("STIRLING_POSTHOG_API_KEY is required to start the AI backend.")
POSTHOG_HOST = os.environ["STIRLING_POSTHOG_HOST"]

# Initialize PostHog client
POSTHOG_CLIENT = Posthog(
    project_api_key=POSTHOG_API_KEY,
    host=POSTHOG_HOST,
)
logger.info(f"PostHog analytics enabled: host={POSTHOG_HOST}")

POSTHOG_CALLBACK = CallbackHandler(client=POSTHOG_CLIENT)


def get_chat_model(
    model_name: str,
    streaming: bool = False,
    max_tokens: int | None = None,
    model_kwargs: dict | None = None,
    callbacks: list | None = None,
):
    # Add PostHog callback if enabled and not already in callbacks
    if callbacks is None or POSTHOG_CALLBACK not in callbacks:
        callbacks = [POSTHOG_CALLBACK] if callbacks is None else [*callbacks, POSTHOG_CALLBACK]

    # Check if this is a Claude model
    if model_name.startswith("claude"):
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY not set")

        kwargs = {
            "model": model_name,
            "anthropic_api_key": ANTHROPIC_API_KEY,
            "streaming": streaming,
        }
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        if callbacks:
            kwargs["callbacks"] = callbacks

        return ChatAnthropic(**kwargs)

    # OpenAI/GPT models
    kwargs = {"model": model_name, "api_key": OPENAI_API_KEY, "streaming": streaming}
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens

    # Build GPT-5 specific parameters if not provided
    if model_kwargs is None and model_name.startswith("gpt-5"):
        # Determine which settings to use based on model
        if model_name == SMART_MODEL:
            reasoning_effort = SMART_MODEL_REASONING_EFFORT
            text_verbosity = SMART_MODEL_TEXT_VERBOSITY
        elif model_name == FAST_MODEL:
            reasoning_effort = FAST_MODEL_REASONING_EFFORT
            text_verbosity = FAST_MODEL_TEXT_VERBOSITY
        else:
            # Default for other GPT-5 variants
            reasoning_effort = "medium"
            text_verbosity = "medium"

        # Pass as explicit parameters instead of model_kwargs to avoid warnings
        kwargs["reasoning"] = {"effort": reasoning_effort}
        kwargs["text"] = {"verbosity": text_verbosity}
    elif model_kwargs:
        # If custom model_kwargs provided, pass them through
        kwargs["model_kwargs"] = model_kwargs

    if callbacks:
        kwargs["callbacks"] = callbacks
    return ChatOpenAI(**kwargs)


__all__ = [
    "OUTPUT_DIR",
    "ASSETS_DIR",
    "DATA_DIR",
    "TEMPLATE_DIR",
    "TEMPLATE_DB_PATH",
    "VERSIONS_DB_PATH",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "JAVA_BACKEND_URL",
    "JAVA_BACKEND_API_KEY",
    "JAVA_REQUEST_TIMEOUT_SECONDS",
    "SMART_MODEL",
    "get_chat_model",
    "FAST_MODEL",
    "SMART_MODEL_REASONING_EFFORT",
    "FAST_MODEL_REASONING_EFFORT",
    "SMART_MODEL_TEXT_VERBOSITY",
    "FAST_MODEL_TEXT_VERBOSITY",
    "FLASK_DEBUG",
    "STREAMING_ENABLED",
    "PREVIEW_MAX_INFLIGHT",
    "AI_REQUEST_TIMEOUT_SECONDS",
    "AI_RAW_DEBUG",
    "AI_MESSAGES_LOG_PATH",
    "POSTHOG_API_KEY",
    "POSTHOG_HOST",
    "POSTHOG_CLIENT",
    "POSTHOG_CALLBACK",
    "model_max_tokens",
]
