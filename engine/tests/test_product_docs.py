from __future__ import annotations

from pathlib import Path

import pytest

from stirling.product_docs import load_manifest
from stirling.product_docs.manifest import DocPage, DocsManifest, _parse

_REPO = Path(__file__).parents[2]
_ENGINE_COPY = _REPO / "engine" / "src" / "stirling" / "product_docs" / "docs_manifest.json"
_FRONTEND_COPY = _REPO / "frontend" / "editor" / "src" / "portal" / "generated" / "docsManifest.json"


def _manifest(**pages: str) -> DocsManifest:
    return DocsManifest(
        pages={
            doc_id: DocPage(id=doc_id, title=doc_id.upper(), section="s", description="", markdown=body)
            for doc_id, body in pages.items()
        }
    )


def test_engine_copy_matches_the_frontend_copy() -> None:
    """Both are written by `npm run docs:sync`. If they drift, the assistant is
    answering from a different manual than the portal is rendering."""
    if not _FRONTEND_COPY.is_file():
        pytest.skip("frontend checkout not present")
    assert _ENGINE_COPY.read_bytes() == _FRONTEND_COPY.read_bytes()


def test_packaged_manifest_loads() -> None:
    manifest = load_manifest()
    assert len(manifest) > 0
    for page in manifest.pages.values():
        assert page.id and page.title and page.markdown


def test_toc_has_one_row_per_page_and_every_id() -> None:
    manifest = load_manifest()
    rows = manifest.toc().split("\n")
    assert len(rows) == len(manifest)
    for doc_id in manifest.pages:
        assert any(row.startswith(f"{doc_id} |") for row in rows)


def test_toc_omits_the_description_field_when_absent() -> None:
    """Half the real corpus has no description; padding the column with an empty
    string would teach the selector that a blank description is meaningful."""
    with_desc = DocsManifest(pages={"a": DocPage("a", "A", "sec", "does a thing", "body")})
    without = DocsManifest(pages={"b": DocPage("b", "B", "sec", "", "body")})
    assert with_desc.toc() == "a | sec | A | does a thing"
    assert without.toc() == "b | sec | B"


def test_render_drops_ids_the_model_invented() -> None:
    manifest = _manifest(real="real body")
    assert manifest.resolve(["real", "hallucinated"]) == [manifest.pages["real"]]
    rendered = manifest.render(["hallucinated", "real"], 10_000)
    assert "real body" in rendered
    assert "hallucinated" not in rendered


def test_render_does_not_spend_the_budget_twice_on_a_repeated_id() -> None:
    manifest = _manifest(one="body-one", two="body-two")
    rendered = manifest.render(["one", "one", "two"], 10_000)
    assert rendered.count("body-one") == 1
    assert "body-two" in rendered


def test_render_returns_empty_when_nothing_resolves() -> None:
    assert _manifest(real="body").render(["nope"], 10_000) == ""
    assert _manifest(real="body").render([], 10_000) == ""


def test_render_truncates_rather_than_blowing_the_budget() -> None:
    manifest = _manifest(big="x" * 50_000)
    rendered = manifest.render(["big"], 1_000)
    assert len(rendered) < 1_200
    assert "[...page truncated...]" in rendered


def test_render_stops_before_a_page_it_cannot_fit() -> None:
    manifest = _manifest(one="a" * 900, two="b" * 900)
    rendered = manifest.render(["one", "two"], 1_000)
    assert "aaa" in rendered
    assert "bbb" not in rendered


def test_real_corpus_stays_within_the_selector_budget() -> None:
    """The whole design rests on the catalogue being cheap enough to send on every docs
    lookup. If a docs sync ever pushes it past this, switch the selector to the lexical
    search in frontend/editor/src/portal/docs/search.ts rather than paying it silently."""
    toc = load_manifest().toc()
    assert len(toc) < 40_000, f"catalogue is {len(toc)} chars (~{len(toc) // 4} tokens); too big to send per lookup"


def test_real_corpus_renders_selected_pages_end_to_end() -> None:
    """Exercises the real manifest rather than a fixture. Page ids are taken FROM the manifest
    rather than hard-coded: they belong to a separate docs repo, and pinning them would land
    the weekly sync PR red whenever an unrelated page is renamed."""
    manifest = load_manifest()
    picks = list(manifest.pages)[:2]
    assert len(picks) == 2, "the shipped corpus should have at least two pages"

    rendered = manifest.render(picks, 120_000)
    assert rendered.startswith("# ")
    assert len(rendered) < 120_000
    for doc_id in picks:
        assert f"(documentation page: {doc_id})" in rendered
        assert manifest.pages[doc_id].markdown[:80] in rendered


def test_parse_skips_pages_with_no_body() -> None:
    raw = '{"docs": {"a": {"markdown": "text", "title": "A"}, "b": {"markdown": "   ", "title": "B"}}}'
    manifest = _parse(raw)
    assert set(manifest.pages) == {"a"}


def test_missing_manifest_is_not_fatal(monkeypatch: pytest.MonkeyPatch) -> None:
    """A build without the manifest must start and simply withhold the docs tool,
    rather than taking the whole engine down on import."""
    import stirling.product_docs.manifest as mod

    monkeypatch.setattr(mod, "_manifest_path", lambda: None)
    load_manifest.cache_clear()
    try:
        assert len(load_manifest()) == 0
    finally:
        load_manifest.cache_clear()


@pytest.mark.parametrize(
    "body",
    [
        "{not json",
        '{"docs": []}',
        '{"docs": {"a": "not an object"}}',
        '{"docs": {"a": {"markdown": 12}}}',
        "[]",
        "null",
    ],
    ids=["malformed", "docs-is-a-list", "entry-is-a-string", "markdown-is-a-number", "top-level-list", "null"],
)
def test_wrong_shaped_manifest_is_not_fatal(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, body: str) -> None:
    """Valid JSON of the wrong shape raises AttributeError/TypeError, not ValueError. None of
    it should stop the engine booting - the docs tool just withholds itself."""
    broken = tmp_path / "broken.json"
    broken.write_text(body, encoding="utf-8")
    import stirling.product_docs.manifest as mod

    monkeypatch.setattr(mod, "_manifest_path", lambda: broken)
    load_manifest.cache_clear()
    try:
        assert len(load_manifest()) == 0
    finally:
        load_manifest.cache_clear()


def test_unreadable_manifest_is_not_fatal(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    import stirling.product_docs.manifest as mod

    monkeypatch.setattr(mod, "_manifest_path", lambda: broken)
    load_manifest.cache_clear()
    try:
        assert len(load_manifest()) == 0
    finally:
        load_manifest.cache_clear()
