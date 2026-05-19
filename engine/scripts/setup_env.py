"""
Ensures `.env.local` exists so developers have a place to put overrides
(API keys, local model choices, etc.) without touching the committed `.env`.

Usage:
    uv run scripts/setup_env.py
"""

from pathlib import Path

ROOT = Path(__file__).parent.parent
ENV_LOCAL_FILE = ROOT / ".env.local"

TEMPLATE = """\
###############################################################################
# Local overrides for `engine/.env`
# Put API keys and machine-specific settings here. Any variable defined here
# takes precedence over the committed `.env`
###############################################################################
"""

if not ENV_LOCAL_FILE.exists():
    ENV_LOCAL_FILE.write_text(TEMPLATE)
    print("setup-env: created empty .env.local for local overrides")
