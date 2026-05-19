package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.service.PdfContentExtractor.LayoutFragment;
import stirling.software.proprietary.service.PdfContentExtractor.LayoutLine;
import stirling.software.proprietary.service.PdfContentExtractor.LayoutPage;
import stirling.software.proprietary.service.PdfContentExtractor.PageLayoutArtifact;
import stirling.software.proprietary.service.PdfContentExtractor.PageLayoutFileResult;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Contract test: verifies that {@link PageLayoutArtifact} serializes to the JSON field names that
 * the Python engine expects in {@code engine/src/stirling/contracts/pdf_to_markdown.py}.
 *
 * <p>The companion Python test in {@code tests/test_pdf_to_markdown.py} deserializes the same JSON
 * literal and asserts field values. If either side renames a field, one of these tests fails.
 */
class PageLayoutArtifactContractTest {

    static final String CONTRACT_JSON =
            """
            {"kind":"page_layout","files":[{"fileName":"test.pdf","pages":[{"pageNumber":1,"lines":[{"y":10.0,"fragments":[{"text":"Hello","x":1.0,"y":2.0,"width":30.0,"fontSize":12.0,"bold":true}]}]}]}]}""";

    @Test
    void pageLayoutArtifact_serialisesToExpectedJson() throws Exception {
        LayoutFragment fragment = new LayoutFragment("Hello", 1.0f, 2.0f, 30.0f, 12.0f, true);
        LayoutLine line = new LayoutLine(10.0f, List.of(fragment));
        LayoutPage page = new LayoutPage(1, List.of(line));

        PageLayoutFileResult fileResult = new PageLayoutFileResult();
        fileResult.setFileName("test.pdf");
        fileResult.setPages(List.of(page));

        PageLayoutArtifact artifact = new PageLayoutArtifact();
        artifact.setFiles(List.of(fileResult));

        JsonNode json = new JsonMapper().valueToTree(artifact);

        assertEquals("page_layout", json.get("kind").asText());

        JsonNode file = json.get("files").get(0);
        assertEquals("test.pdf", file.get("fileName").asText());

        JsonNode pg = file.get("pages").get(0);
        assertEquals(1, pg.get("pageNumber").asInt());

        JsonNode ln = pg.get("lines").get(0);
        assertEquals(10.0, ln.get("y").asDouble(), 0.001);

        JsonNode frag = ln.get("fragments").get(0);
        assertEquals("Hello", frag.get("text").asText());
        assertEquals(1.0, frag.get("x").asDouble(), 0.001);
        assertEquals(2.0, frag.get("y").asDouble(), 0.001);
        assertEquals(30.0, frag.get("width").asDouble(), 0.001);
        assertEquals(12.0, frag.get("fontSize").asDouble(), 0.001);
        assertTrue(frag.get("bold").asBoolean());
    }
}
