from __future__ import annotations

from typing import Any, List, Optional
import time

from config import CLIENT_MODE, SMART_MODEL, get_chat_model, logger
from langchain_utils import to_lc_messages
from prompts import vision_layout_system_prompt


def vision_layout_from_images(image_urls: List[str], doc_type: str) -> Optional[str]:
    """Call the multimodal model to recover a LaTeX skeleton from page images."""
    if CLIENT_MODE != "langchain" or not image_urls:
        return None

    system_prompt = vision_layout_system_prompt()

    user_content: List[Any] = [
        {"type": "text", "text": f"Extract layout for document type: {doc_type}. Return LaTeX skeleton only."}
    ]
    for url in image_urls:
        user_content.append({"type": "image_url", "image_url": {"url": url}})

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    try:
        logger.info("[IMPORT] vision call pages=%s doc_type=%s", len(image_urls), doc_type)
        llm = get_chat_model(SMART_MODEL, max_tokens=2800)
        if not llm:
            return None
        start = time.perf_counter()
        response = llm.invoke(to_lc_messages(messages))
        elapsed = time.perf_counter() - start
        content = response.content or ""
        usage = getattr(response, "usage_metadata", None)
        logger.info(
            "[IMPORT] vision model=%s elapsed=%.2fs chars=%s usage=%s",
            SMART_MODEL,
            elapsed,
            len(str(content)),
            usage,
        )
        return response.content
    except Exception as exc:
        logger.error("[IMPORT] vision generation failed: %s", exc)
        return None


__all__ = ["vision_layout_from_images"]
