import re
from pathlib import Path


def load_default_template(template_filename: str | None) -> str | None:
    """Load a template from the default_templates directory."""
    if not template_filename:
        return None

    # Sanitize the filename to prevent path traversal
    safe_filename = re.sub(r"[^a-zA-Z0-9_.-]+", "", template_filename)
    if not safe_filename or not safe_filename.endswith(".html"):
        return None

    template_path = Path(__file__).parent / "default_templates" / safe_filename
    return template_path.read_text(encoding="utf-8", errors="replace")
