package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.pdf.MarkdownBlock;
import stirling.software.common.pdf.MarkdownBlocks;
import stirling.software.common.pdf.PdfMarkdownExtractor;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.model.api.docparse.IngestApiRequest;
import stirling.software.proprietary.model.docparse.IngestOutcome;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Wire-building, limit capping, and the engine round trip for the ingestion path. */
@ExtendWith(MockitoExtension.class)
class DocParseServiceTest {

    private static final String ENGINE_RESPONSE =
            "{\"documentId\":\"doc-1\",\"chunksIndexed\":3,\"chunks\":null}";

    private static final List<MarkdownBlock> BLOCKS =
            List.of(
                    new MarkdownBlock("# Invoice", 1, 1, List.of("Invoice")),
                    new MarkdownBlock("body text", 1, 2, List.of("Invoice")));

    @Mock private AiEngineClient aiEngineClient;
    @Mock private PdfMarkdownExtractor markdownExtractor;
    @Mock private TempFileManager tempFileManager;
    @Mock private FileIdStrategy fileIdStrategy;

    @TempDir Path tmp;

    private ApplicationProperties properties;
    private DocParseService service;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @BeforeEach
    void setUp() {
        properties = new ApplicationProperties();
        service =
                new DocParseService(
                        aiEngineClient,
                        markdownExtractor,
                        tempFileManager,
                        properties,
                        jsonMapper,
                        fileIdStrategy,
                        null);
    }

    @Test
    void capabilitiesDistinguishesCorpusExportFromConfiguredIndexing() throws IOException {
        properties.getDocparse().setEnabled(true);
        properties.getAiEngine().setEnabled(true);
        when(aiEngineClient.get("/api/v1/docparse/capabilities", null))
                .thenReturn("{\"indexingConfigured\":false}", "{\"indexingConfigured\":true}");

        assertEquals(new DocParseService.Capabilities(true, true, false), service.capabilities());
        assertEquals(new DocParseService.Capabilities(true, true, true), service.capabilities());
    }

    @Test
    void capabilitiesReportsAnUnreachableEngine() throws IOException {
        properties.getDocparse().setEnabled(true);
        properties.getAiEngine().setEnabled(true);
        when(aiEngineClient.get("/api/v1/docparse/capabilities", null))
                .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));

        assertEquals(new DocParseService.Capabilities(true, false, false), service.capabilities());
    }

    @Test
    void capabilitiesDoesNotProbeWhenIngestionIsDisabled() {
        properties.getDocparse().setEnabled(false);

        assertEquals(new DocParseService.Capabilities(false, false, false), service.capabilities());
        verifyNoInteractions(aiEngineClient);
    }

    private static byte[] pdfBytes(int pages) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int page = 0; page < pages; page++) {
                document.addPage(new PDPage());
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    private MultipartFile pdfFile() throws IOException {
        return new MockMultipartFile("fileInput", "invoice.pdf", "application/pdf", pdfBytes(2));
    }

    /** The conversion seam is stubbed; opening the temp copy is the real jpdfium path. */
    private void stubConversion(List<MarkdownBlock> blocks) throws IOException {
        when(tempFileManager.createTempFile(".pdf")).thenReturn(tmp.resolve("ingest.pdf").toFile());
        when(markdownExtractor.extractBlocks(any())).thenReturn(blocks);
    }

    private static IngestApiRequest apiRequest(
            MultipartFile file,
            String documentId,
            boolean index,
            boolean markdown,
            boolean chunks) {
        IngestApiRequest request = new IngestApiRequest();
        request.setFileInput(file);
        request.setDocumentId(documentId);
        request.setIndex(index);
        request.setExportMarkdown(markdown);
        request.setExportChunksJsonl(chunks);
        return request;
    }

    private IngestOutcome ingest(String documentId, boolean index, boolean markdown, boolean chunks)
            throws IOException {
        return service.ingest(apiRequest(pdfFile(), documentId, index, markdown, chunks));
    }

    private JsonNode ingestAndCaptureRequest(
            String documentId, boolean index, boolean markdown, boolean chunks) throws IOException {
        stubConversion(BLOCKS);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        when(aiEngineClient.postLongRunning(
                        eq("/api/v1/docparse/ingest"), body.capture(), isNull()))
                .thenReturn(ENGINE_RESPONSE);

        IngestOutcome outcome = ingest(documentId, index, markdown, chunks);
        assertEquals(3, outcome.chunksIndexed());
        return jsonMapper.readTree(body.getValue());
    }

    @Test
    void ingestSendsTheMarkdownBlocksAsTheWireContract() throws IOException {
        JsonNode request = ingestAndCaptureRequest("doc-1", true, false, false);

        assertEquals("doc-1", request.get("documentId").asString());
        assertEquals("invoice.pdf", request.get("source").asString());
        assertEquals(2, request.get("blocks").size());
        JsonNode heading = request.get("blocks").get(0);
        assertEquals("# Invoice", heading.get("markdown").asString());
        assertEquals(1, heading.get("pageStart").asInt());
        assertEquals("Invoice", heading.get("headingPath").get(0).asString());
        assertEquals(2, request.get("blocks").get(1).get("pageEnd").asInt());
        assertEquals(512, request.get("chunkSize").asInt());
        assertEquals(64, request.get("overlap").asInt());
        assertTrue(request.get("index").asBoolean());
        assertFalse(request.get("includeChunks").asBoolean());
        // Page text, the parse tier and the markdown echo are gone from the contract.
        assertNull(request.get("pages"));
        assertNull(request.get("mode"));
        assertNull(request.get("fileName"));
        assertNull(request.get("includeMarkdown"));
    }

    @Test
    void ingestDefaultsDocumentIdToContentHash() throws IOException {
        when(fileIdStrategy.idFor(any(MultipartFile.class))).thenReturn("sha-abc");
        JsonNode request = ingestAndCaptureRequest("  ", true, false, false);
        assertEquals("sha-abc", request.get("documentId").asString());
    }

    @Test
    void ingestForwardsTheChunkExportFlag() throws IOException {
        JsonNode request = ingestAndCaptureRequest("doc-1", false, true, true);
        assertFalse(request.get("index").asBoolean());
        assertTrue(request.get("includeChunks").asBoolean());
    }

    @Test
    void theOutcomeCarriesTheJoinedMarkdownAndThePagesItCovers() throws IOException {
        stubConversion(BLOCKS);

        IngestOutcome outcome = ingest("doc-1", false, true, false);

        assertEquals("# Invoice\n\nbody text", outcome.markdown());
        // The second block was stitched across the page break, so it covers both pages.
        assertEquals(2, outcome.pages());
        assertEquals(2, outcome.sourcePages());
        assertFalse(outcome.truncated());
    }

    @Test
    void markdownOnlyExportNeverCallsTheEngine() throws IOException {
        stubConversion(BLOCKS);

        IngestOutcome outcome = ingest("doc-1", false, true, false);

        assertEquals(0, outcome.chunksIndexed());
        assertNull(outcome.chunks());
        verifyNoInteractions(aiEngineClient);
    }

    @Test
    void aDocumentWithNoTextLayerIs422() throws IOException {
        stubConversion(List.of(new MarkdownBlock("   ", 1, 1)));
        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class, () -> ingest("doc-1", true, false, false));
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.getStatusCode());
        verifyNoInteractions(aiEngineClient);
    }

    @Test
    void aScanThatConvertsToNothingButImagePlaceholdersIs422() throws IOException {
        // A scanned page has no text but does have an image, so the converter emits a placeholder;
        // without this the placeholders would be embedded and indexed as if they were content.
        stubConversion(
                List.of(
                        new MarkdownBlock(
                                MarkdownBlocks.IMAGE_PLACEHOLDER + ": 2480x3508px, JPG>", 1, 1)));
        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class, () -> ingest("doc-1", true, false, false));
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.getStatusCode());
        verifyNoInteractions(aiEngineClient);
    }

    @Test
    void theUploadIsStillReadableAfterIngest() throws IOException {
        // The controller reads the upload after this returns, to put the original in the export
        // ZIP; consuming the part here 500s every default-configuration ingest.
        stubConversion(BLOCKS);
        SpendableMultipartFile file = new SpendableMultipartFile(pdfBytes(2));

        service.ingest(apiRequest(file, "doc-1", false, true, false));

        assertEquals(pdfBytes(2).length, file.getBytes().length);
    }

    /** A servlet part spooled to disk: transferTo moves the backing file, leaving it unreadable. */
    private static final class SpendableMultipartFile extends MockMultipartFile {

        private boolean spent;

        SpendableMultipartFile(byte[] content) {
            super("fileInput", "invoice.pdf", "application/pdf", content);
        }

        @Override
        public void transferTo(File dest) throws IOException {
            super.transferTo(dest);
            spent = true;
        }

        @Override
        public byte[] getBytes() throws IOException {
            requireUnspent();
            return super.getBytes();
        }

        @Override
        public InputStream getInputStream() throws IOException {
            requireUnspent();
            return super.getInputStream();
        }

        private void requireUnspent() throws IOException {
            if (spent) {
                throw new FileNotFoundException("the part's backing file was already transferred");
            }
        }
    }

    @Test
    void ingestWithNothingToDoIs400() throws IOException {
        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class, () -> ingest("doc", false, false, false));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(aiEngineClient);
    }

    @Test
    void ingestWhenDisabledIs503() throws IOException {
        properties.getDocparse().setEnabled(false);
        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class, () -> ingest("doc", true, false, false));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
        verifyNoInteractions(aiEngineClient);
    }

    @Test
    void fileNameFallsBackWhenMissing() throws IOException {
        MultipartFile nameless =
                new MockMultipartFile("fileInput", "", "application/pdf", new byte[] {1});
        assertEquals("document.pdf", DocParseService.fileName(nameless));
        assertEquals("invoice.pdf", DocParseService.fileName(pdfFile()));
    }

    // --- applyLimits: the shared aiEngine caps, applied over whole blocks ---

    @Test
    void applyLimitsSkipsBlankBlocksAndCapsCharacters() {
        properties.getAiEngine().getLimits().setMaxCharacters(12);
        List<MarkdownBlock> all =
                List.of(
                        new MarkdownBlock("0123456789", 1, 1),
                        new MarkdownBlock("   ", 2, 2),
                        new MarkdownBlock("abcdef", 3, 3));

        DocParseService.Capped capped = service.applyLimits(all, 3);

        assertTrue(capped.truncated());
        assertEquals(2, capped.blocks().size());
        // The last block is cut to the remaining budget (12 - 10 = 2 chars).
        assertEquals("ab", capped.blocks().get(1).markdown());
    }

    @Test
    void reportsCharacterTruncationEvenOnTheOnlyBlock() {
        properties.getAiEngine().getLimits().setMaxCharacters(4);

        DocParseService.Capped capped =
                service.applyLimits(List.of(new MarkdownBlock("more than four", 1, 1)), 1);

        assertTrue(capped.truncated());
        assertEquals("more", capped.blocks().getFirst().markdown());
    }

    @Test
    void aBlankTrailingBlockIsNotTruncation() {
        DocParseService.Capped capped =
                service.applyLimits(
                        List.of(new MarkdownBlock("text", 1, 1), new MarkdownBlock("   ", 2, 2)),
                        2);
        assertFalse(capped.truncated());
    }

    @Test
    void applyLimitsStopsAtThePageCapButKeepsAStraddlingBlockWhole() {
        properties.getAiEngine().getLimits().setMaxPages(2);
        List<MarkdownBlock> all =
                List.of(
                        new MarkdownBlock("page one", 1, 1),
                        // Stitched across the cap: kept whole, because its content is all here.
                        new MarkdownBlock("straddles", 2, 3),
                        new MarkdownBlock("past the cap", 3, 3));

        DocParseService.Capped capped = service.applyLimits(all, 3);

        assertTrue(capped.truncated());
        assertEquals(2, capped.blocks().size());
        assertEquals(3, capped.blocks().get(1).pageEnd());
    }
}
