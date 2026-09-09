package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.api.ai.create.AiDocument;

class AiDocumentHtmlRendererTest {

    private final AiDocumentHtmlRenderer renderer = new AiDocumentHtmlRenderer();

    private static AiDocument.Section section(String type) {
        AiDocument.Section s = new AiDocument.Section();
        s.setType(type);
        return s;
    }

    private static AiDocument document(String title, List<AiDocument.Section> sections) {
        AiDocument doc = new AiDocument();
        doc.setTitle(title);
        doc.setSections(sections);
        return doc;
    }

    @Test
    void rendersAllSectionTypes() {
        AiDocument.Section text = section("text");
        text.setBody("Some prose text.");
        AiDocument.Section kv = section("key_value");
        kv.setPairs(List.of(List.of("Key", "Value")));
        AiDocument.Section items = section("line_items");
        items.setColumns(List.of("A", "B"));
        items.setRows(List.of(List.of("1", "2")));
        AiDocument.Section bullets = section("bullet_list");
        bullets.setItems(List.of("item one"));
        AiDocument.Section sign = section("signature");
        sign.setSignatories(List.of("Alice"));

        String html = renderer.render(document("All", List.of(text, kv, items, bullets, sign)));

        assertTrue(html.contains("<!DOCTYPE html>"));
        assertTrue(html.contains("Some prose text."));
        assertTrue(html.contains("Key") && html.contains("Value"));
        assertTrue(html.contains("<th>"));
        assertTrue(html.contains("item one"));
        assertTrue(html.contains("Alice"));
    }

    @Test
    void rendersMarkupCharactersAsText() {
        AiDocument.Section text = section("text");
        text.setBody("a <b>x</b> & y");

        String html = renderer.render(document("Doc", List.of(text)));

        assertFalse(html.contains("<b>"));
        assertTrue(html.contains("&lt;b&gt;"));
    }

    @Test
    void totalRowRenderedWhenPresent() {
        AiDocument.Section items = section("line_items");
        items.setColumns(List.of("Item", "Total"));
        items.setRows(List.of(List.of("Widget", "$10")));
        items.setTotalRow(List.of("Total", "$10"));

        assertTrue(
                renderer.render(document("Table", List.of(items)))
                        .contains("<tr class=\"total-row\">"));
    }

    @Test
    void totalRowAbsentWhenNotProvided() {
        AiDocument.Section items = section("line_items");
        items.setColumns(List.of("Item"));
        items.setRows(List.of(List.of("Widget")));

        assertFalse(
                renderer.render(document("Table", List.of(items)))
                        .contains("<tr class=\"total-row\">"));
    }

    @Test
    void rendersSubtitleAndReference() {
        AiDocument doc = document("My Doc", List.of());
        doc.setSubtitle("Subtitle Here");
        doc.setReferenceNumber("REF-42");

        String html = renderer.render(doc);

        assertTrue(html.contains("Subtitle Here"));
        assertTrue(html.contains("REF-42"));
    }

    @Test
    void appliesHexColourOverride() {
        AiDocument doc = document("Styled", List.of());
        AiDocument.Style style = new AiDocument.Style();
        style.setPrimaryColor("#ff00ff");
        style.setBackgroundColor("#111111");
        doc.setStyle(style);

        String html = renderer.render(doc);

        assertTrue(html.contains("--color-primary: #ff00ff"));
        assertTrue(html.contains("--color-bg: #111111"));
    }

    @Test
    void ignoresColourWithDisallowedCharacters() {
        AiDocument doc = document("Styled", List.of());
        AiDocument.Style style = new AiDocument.Style();
        style.setPrimaryColor("rgb(255, 0, 0)");
        doc.setStyle(style);

        String html = renderer.render(doc);

        assertFalse(html.contains("rgb("));
        assertTrue(html.contains("<!DOCTYPE html>"));
    }

    @Test
    void ignoresNonHexColour() {
        AiDocument doc = document("Styled", List.of());
        AiDocument.Style style = new AiDocument.Style();
        style.setPrimaryColor("magenta");
        style.setBackgroundColor("#fff");
        doc.setStyle(style);

        String html = renderer.render(doc);

        assertFalse(html.contains("--color-primary: magenta"));
        assertFalse(html.contains("--color-bg: #fff;"));
    }
}
