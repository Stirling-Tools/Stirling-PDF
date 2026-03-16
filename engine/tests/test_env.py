from __future__ import annotations

import re
from pathlib import Path

from dotenv import dotenv_values

ENGINE_ROOT = Path(__file__).parent.parent
SRC_DIR = ENGINE_ROOT / "src"
EXAMPLE_FILE = ENGINE_ROOT / "config" / ".env.example"


def _parse_example_keys() -> set[str]:
    return set(dotenv_values(EXAMPLE_FILE).keys())


def _find_stirling_env_vars() -> set[str]:
    env_vars: set[str] = set()
    for path in SRC_DIR.rglob("*.py"):
        for match in re.finditer(r"\b(STIRLING_\w+)\b", path.read_text()):
            env_vars.add(match.group(1))
    return env_vars


def test_every_stirling_env_var_is_in_example_file():
    example_keys = _parse_example_keys()
    source_vars = _find_stirling_env_vars()
    missing = sorted(source_vars - example_keys)
    assert not missing, "env vars used in src/ but missing from config/.env.example:\n" + "\n".join(
        f"  {v}" for v in missing
    )
