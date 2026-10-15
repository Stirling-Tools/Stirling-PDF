package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpResultNotesTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private OperationMeta op(String id) {
        return new OperationMeta(
                id,
                OperationCategory.SECURITY,
                id,
                mapper.createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/x/" + id,
                null);
    }

    private ObjectNode fileResult() {
        ObjectNode result = McpResponses.text(mapper, "done.");
        result.putObject("structuredContent").put("kind", "file");
        return result;
    }

    private String text(ObjectNode result) {
        return result.get("content").get(0).get("text").asText();
    }

    @Test
    void addPasswordWithoutAPasswordIsNotCalledProtected() {
        ObjectNode result = fileResult();

        McpResultNotes.apply(
                mapper,
                op("add-password"),
                result,
                new HttpHeaders(),
                mapper.readTree("{\"preventPrinting\":true}"));

        assertTrue(text(result).startsWith("Warning: No password was set"), text(result));
        assertEquals(1, result.get("structuredContent").get("warnings").size());
    }

    @Test
    void addPasswordWithAPasswordGetsNoWarning() {
        ObjectNode result = fileResult();

        McpResultNotes.apply(
                mapper,
                op("add-password"),
                result,
                new HttpHeaders(),
                mapper.readTree("{\"password\":\"x\"}"));

        assertEquals("done.", text(result));
    }

    @Test
    void anUndeclaredPdfUaResultSaysWhatIsMissing() {
        ObjectNode result = fileResult();
        HttpHeaders headers = new HttpHeaders();
        headers.set(McpResultNotes.UA_DECLARED, "false");
        headers.set(McpResultNotes.UA_FAILURES, "2");
        headers.set(McpResultNotes.UA_ALT_NEEDED, "3");

        McpResultNotes.apply(mapper, op("pdf-to-ua"), result, headers, null);

        assertTrue(text(result).contains("3 figure(s) need alt text"), text(result));
        assertFalse(result.at("/structuredContent/report/declared").asBoolean(true));
    }

    @Test
    void toolReportsReachTheModel() {
        ObjectNode none = fileResult();
        ObjectNode label = fileResult();
        HttpHeaders empty = new HttpHeaders();
        empty.set(McpResultNotes.TOOL_REPORT, "{\"annotationsApplied\":0}");
        HttpHeaders classified = new HttpHeaders();
        classified.set(McpResultNotes.TOOL_REPORT, "{\"label\":\"invoice\"}");

        McpResultNotes.apply(mapper, op("pdf-comment-agent"), none, empty, null);
        McpResultNotes.apply(mapper, op("classify-and-label"), label, classified, null);

        assertTrue(text(none).contains("No comments were added"), text(none));
        assertTrue(text(label).contains("invoice"), text(label));
        assertEquals("invoice", label.at("/structuredContent/report/label").asText());
    }
}
