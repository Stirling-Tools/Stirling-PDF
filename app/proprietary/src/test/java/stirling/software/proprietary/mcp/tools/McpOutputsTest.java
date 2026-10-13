package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.mcp.catalog.McpToolCatalogTestAccess;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpOutputsTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void conversionsGetFromToIdsAndEditorInternalsStayHidden() {
        assertEquals(
                "pdf-to-word",
                McpToolCatalogTestAccess.opId(
                        "/api/v1/convert/pdf/word", OperationCategory.CONVERT));
        assertEquals(
                "img-to-pdf",
                McpToolCatalogTestAccess.opId(
                        "/api/v1/convert/img/pdf", OperationCategory.CONVERT));
        assertNull(
                McpToolCatalogTestAccess.opId(
                        "/api/v1/convert/pdf/text-editor", OperationCategory.CONVERT));
        assertNull(
                McpToolCatalogTestAccess.opId(
                        "/api/v1/convert/pdf/text-editor/page/{jobId}/{pageNumber}",
                        OperationCategory.CONVERT));
        assertEquals(
                "compress-pdf",
                McpToolCatalogTestAccess.opId("/api/v1/misc/compress-pdf", OperationCategory.MISC));
        assertNull(McpToolCatalogTestAccess.opId("/api/v1/misc/a/b", OperationCategory.MISC));
    }

    @Test
    void zipResultsAreUnpackedSoEachFileCanBeChained() throws Exception {
        McpFiles files = mock(McpFiles.class);
        User user = new User();
        AtomicInteger ids = new AtomicInteger(100);
        when(files.save(eq(user), any(byte[].class), anyString(), anyString(), eq(false)))
                .thenAnswer(
                        i ->
                                new McpFiles.Saved(
                                        String.valueOf(ids.incrementAndGet()),
                                        i.getArgument(2),
                                        i.getArgument(3),
                                        ((byte[]) i.getArgument(1)).length,
                                        null,
                                        null,
                                        false,
                                        null));

        McpZipParts.Unpacked unpacked =
                McpZipParts.unpack(files, user, zip("dir/part-1.pdf", "part-2.pdf"));

        assertEquals(2, unpacked.total());
        assertEquals("part-1.pdf", unpacked.parts().get(0).name(), "folders are dropped");
        assertEquals("application/pdf", unpacked.parts().get(0).contentType());

        ObjectNode result = McpResponses.text(mapper, "split-pdf succeeded.");
        result.putObject("structuredContent").put("kind", "file");
        McpResponses.addParts(result, unpacked);
        assertEquals(2, result.at("/structuredContent/partCount").asInt());
        assertEquals("101", result.at("/structuredContent/parts/0/fileId").asText());
        assertEquals("pdf", result.at("/structuredContent/parts/1/outputKind").asText());
        assertTrue(result.at("/content/0/text").asText().contains("part-2.pdf (fileId=102)"));
    }

    @Test
    void outputKindTellsAgentsWhatTheyCanChain() {
        assertEquals("pdf", McpZipParts.outputKind("application/pdf", "a.pdf"));
        assertEquals("zip", McpZipParts.outputKind("application/octet-stream", "a.zip"));
        assertEquals("image", McpZipParts.outputKind("image/png", "a.png"));
        assertEquals("text", McpZipParts.outputKind("text/csv", "a.csv"));
        assertEquals("other", McpZipParts.outputKind("application/octet-stream", "a.bin"));
    }

    @Test
    void reportsComeBackAsStructuredData() {
        ObjectNode result = McpResponses.report(mapper, "get-info-on-pdf", "{\"pages\":3}");

        assertEquals("report", result.at("/structuredContent/kind").asText());
        assertEquals(3, result.at("/structuredContent/report/pages").asInt());
        assertEquals("{\"pages\":3}", result.at("/content/0/text").asText());
    }

    private static byte[] zip(String... names) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("dir/"));
            zip.closeEntry();
            for (String name : names) {
                zip.putNextEntry(new ZipEntry(name));
                zip.write(("%PDF " + name).getBytes(StandardCharsets.US_ASCII));
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    @Test
    void aReportHoldingOnlyAnErrorIsAnError() {
        ObjectNode result =
                McpResponses.report(
                        mapper,
                        "get-info-on-pdf",
                        "{\"error\":\"The PDF Document is passworded\",\"timestamp\":1}");

        assertTrue(result.path("isError").asBoolean(false));
        assertEquals("input", result.at("/structuredContent/error/stage").asText());
        assertTrue(result.at("/content/0/text").asText().contains("passworded"));
    }
}
