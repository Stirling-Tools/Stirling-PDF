package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.model.api.docparse.IngestApiRequest;
import stirling.software.proprietary.model.docparse.DocChunk;
import stirling.software.proprietary.model.docparse.IngestOutcome;
import stirling.software.proprietary.service.AiToolResponseHeaders;
import stirling.software.proprietary.service.DocParseService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The pipeline-facing shape of the ingest endpoint: the ZIP body the policy executor unpacks, and
 * the summary header it records as the step report.
 */
@ExtendWith(MockitoExtension.class)
class DocParseControllerTest {

    private static final byte[] PDF_BYTES = "%PDF-1.7 original".getBytes(StandardCharsets.UTF_8);

    @Mock private DocParseService docParseService;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private DocParseController controller() {
        return new DocParseController(
                docParseService,
                jsonMapper,
                new TempFileManager(new TempFileRegistry(), new ApplicationProperties()));
    }

    private static IngestApiRequest request(boolean markdown, boolean chunksJsonl) {
        IngestApiRequest request = new IngestApiRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", "invoice.pdf", "application/pdf", PDF_BYTES));
        request.setExportMarkdown(markdown);
        request.setExportChunksJsonl(chunksJsonl);
        return request;
    }

    private static IngestOutcome outcome(int pages, int sourcePages) {
        return new IngestOutcome(
                "doc-1",
                3,
                List.of(new DocChunk(0, "body text", 1, 1, List.of("Invoice"))),
                "# Invoice\n\nbody text",
                pages,
                sourcePages,
                sourcePages > pages);
    }

    private void stubService(IngestOutcome result) throws IOException {
        when(docParseService.ingest(any())).thenReturn(result);
    }

    private static Map<String, String> unzip(Resource body) throws IOException {
        Map<String, String> entries = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(body.getInputStream())) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries.put(
                        entry.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return entries;
    }

    private JsonNode report(ResponseEntity<Resource> response) {
        String raw = response.getHeaders().getFirst(AiToolResponseHeaders.TOOL_REPORT);
        assertNotNull(raw, "the step report header must always be present");
        return jsonMapper.readTree(raw);
    }

    @Test
    void chunksOnlyStillReturnsAOneEntryZip() throws IOException {
        stubService(outcome(2, 2));
        IngestApiRequest request = request(false, true);
        request.setIncludeOriginal(false);
        var file = spy(request.getFileInput());
        request.setFileInput(file);
        Map<String, String> entries = unzip(controller().ingest(request).getBody());
        assertEquals(List.of("invoice.chunks.jsonl"), new ArrayList<>(entries.keySet()));
        verify(file, never()).getBytes();
    }

    @Test
    void excludingTheOriginalRequiresAnExport() {
        IngestApiRequest request = request(false, false);
        request.setIncludeOriginal(false);
        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class, () -> controller().ingest(request));
    }

    @Test
    void indexOnlyStillReturnsAZipSoTheResponseShapeNeverVaries() throws IOException {
        stubService(outcome(2, 2));

        ResponseEntity<Resource> response = controller().ingest(request(false, false));

        // A varying body would have to be declared as both SISO and SIMO; the executor reads one
        // doc-type per endpoint, so an index-only run returns the original inside a ZIP too.
        Map<String, String> entries = unzip(response.getBody());
        assertEquals(List.of("invoice.pdf"), new ArrayList<>(entries.keySet()));
        assertEquals(new String(PDF_BYTES, StandardCharsets.UTF_8), entries.get("invoice.pdf"));
    }

    @Test
    void exportsRideAlongsideTheUntouchedOriginal() throws IOException {
        stubService(outcome(2, 2));

        ResponseEntity<Resource> response = controller().ingest(request(true, true));

        Map<String, String> entries = unzip(response.getBody());
        assertEquals(3, entries.size());
        assertEquals(new String(PDF_BYTES, StandardCharsets.UTF_8), entries.get("invoice.pdf"));
        assertTrue(entries.get("invoice.md").contains("# Invoice"));

        JsonNode line = jsonMapper.readTree(entries.get("invoice.chunks.jsonl").strip());
        assertEquals("doc-1", line.get("documentId").asString());
        assertEquals("body text", line.get("text").asString());
        assertEquals(1, line.get("pageStart").asInt());
        assertEquals("Invoice", line.get("headingPath").get(0).asString());
    }

    @Test
    void theReportCarriesTheIngestSummary() throws IOException {
        stubService(outcome(2, 2));

        JsonNode report = report(controller().ingest(request(false, false)));

        assertEquals("doc-1", report.get("documentId").asString());
        assertEquals(3, report.get("chunksIndexed").asInt());
        assertEquals(2, report.get("pages").asInt());
        assertTrue(report.get("indexed").asBoolean());
        assertFalse(report.get("truncated").asBoolean());
    }

    @Test
    void aCappedIngestIsReportedAsTruncatedRatherThanComplete() throws IOException {
        // The aiEngine page and character caps stop extraction early; without this flag a
        // partially-indexed document is indistinguishable from a fully-indexed one.
        stubService(outcome(50, 900));

        JsonNode report = report(controller().ingest(request(false, false)));

        assertTrue(report.get("truncated").asBoolean());
        assertEquals(50, report.get("pages").asInt());
        assertEquals(900, report.get("sourcePages").asInt());
    }
}
