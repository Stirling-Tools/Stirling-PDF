"""
Copies .env from .env.example if missing, and errors if any keys from the example
are absent from the actual .env file.

Usage:
    uv run scripts/setup_env.py
"""

import os
import shutil
import sys
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).parent.parent
EXAMPLE_FILE = ROOT / "config" / ".env.example"
ENV_FILE = ROOT / ".env"

print("setup-env: see engine/config/.env.example for documentation")

if not EXAMPLE_FILE.exists():
    print(f"setup-env: {EXAMPLE_FILE.name} not found, skipping", file=sys.stderr)
    sys.exit(0)

if not ENV_FILE.exists():
    shutil.copy(EXAMPLE_FILE, ENV_FILE)
    print("setup-env: created .env from .env.example")

env_keys = set(dotenv_values(ENV_FILE).keys()) | set(os.environ.keys())
example_keys = set(dotenv_values(EXAMPLE_FILE).keys())
missing = sorted(example_keys - env_keys)

if missing:
    sys.exit(
        "setup-env: .env is missing keys from .env.example:\n"
        + "\n".join(f"  {k}" for k in missing)
        + "\n  Add them manually or delete your local .env to re-copy from config/.env.example."
    )

extra = sorted(k for k in dotenv_values(ENV_FILE) if k.startswith("STIRLING_") and k not in example_keys)
if extra:
    print(
        "setup-env: .env contains STIRLING_ keys not in config/.env.example:\n"
        + "\n".join(f"  {k}" for k in extra)
        + "\n  Add them to config/.env.example if they are intentional.",
        file=sys.stderr,
    )
