package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.io.ByteArrayOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class McpMetadataKeepTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private static byte[] pdf() throws Exception {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.getDocumentInformation().setAuthor("Ada");
            document.getDocumentInformation().setTitle("Old title");
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void changingTheTitleKeepsTheAuthor() throws Exception {
        JsonNode merged =
                McpMetadataKeep.withCurrentValues(
                        mapper, mapper.readTree("{\"title\":\"Q3 Board Pack\"}"), pdf());

        assertEquals("Q3 Board Pack", merged.get("title").asText());
        assertEquals("Ada", merged.get("author").asText());
    }

    @Test
    void anExplicitEmptyValueStillRemovesAField() throws Exception {
        JsonNode merged =
                McpMetadataKeep.withCurrentValues(
                        mapper, mapper.readTree("{\"author\":\"\"}"), pdf());

        assertEquals("", merged.get("author").asText());
        assertEquals("Old title", merged.get("title").asText());
    }

    @Test
    void deleteAllAndUnreadableFilesGoOnAsAsked() throws Exception {
        JsonNode deleteAll = mapper.readTree("{\"deleteAll\":true}");
        JsonNode garbage = mapper.readTree("{\"title\":\"x\"}");

        assertSame(deleteAll, McpMetadataKeep.withCurrentValues(mapper, deleteAll, pdf()));
        assertSame(garbage, McpMetadataKeep.withCurrentValues(mapper, garbage, new byte[] {1}));
        assertFalse(deleteAll.has("author"));
    }
}
