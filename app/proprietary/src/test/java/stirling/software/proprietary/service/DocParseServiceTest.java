package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.model.docparse.DocparseCapabilities;
import stirling.software.proprietary.model.docparse.DocparseMode;
import stirling.software.proprietary.model.docparse.DocparseTier;
import stirling.software.proprietary.model.docparse.RagIngestResponse;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Wire-building and mode capping for the ingestion path. */
@ExtendWith(MockitoExtension.class)
class DocParseServiceTest {

    private static final String ENGINE_RESPONSE =
            "{\"mode\":\"basic\",\"documentId\":\"doc-1\",\"chunksIndexed\":3,\"pages\":2,"
                    + "\"markdown\":null,\"chunks\":null}";

    @Mock private AiEngineClient aiEngineClient;
    @Mock private DocparseCapabilityService capabilityService;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfContentExtractor pdfContentExtractor;
    @Mock private FileIdStrategy fileIdStrategy;

    private ApplicationProperties properties;
    private DocParseService service;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @BeforeEach
    void setUp() {
        properties = new ApplicationProperties();
        service =
                new DocParseService(
                        aiEngineClient,
                        capabilityService,
                        pdfDocumentFactory,
                        pdfContentExtractor,
                        properties,
                        jsonMapper,
                        fileIdStrategy,
                        null);
    }

    // --- effectiveMode: the settings mode wins when stricter ---

    @Test
    void settingsBasicForcesBasic() {
        assertEquals(
                DocparseMode.BASIC,
                DocParseService.effectiveMode(DocparseMode.BASIC, DocparseMode.ADVANCED));
        assertEquals(
                DocparseMode.BASIC,
                DocParseService.effectiveMode(DocparseMode.BASIC, DocparseMode.AUTO));
    }

    @Test
    void settingsAdvancedUpgradesAutoButRespectsExplicitBasic() {
        assertEquals(
                DocparseMode.ADVANCED,
                DocParseService.effectiveMode(DocparseMode.ADVANCED, DocparseMode.AUTO));
        assertEquals(
                DocparseMode.BASIC,
                DocParseService.effectiveMode(DocparseMode.ADVANCED, DocparseMode.BASIC));
    }

    @Test
    void settingsAutoPassesRequestThroughAndNullMeansAuto() {
        assertEquals(
                DocparseMode.ADVANCED,
                DocParseService.effectiveMode(DocparseMode.AUTO, DocparseMode.ADVANCED));
        assertEquals(DocparseMode.AUTO, DocParseService.effectiveMode(DocparseMode.AUTO, null));
    }

    // --- ragIngest wire building ---

    private MultipartFile pdfFile() {
        return new MockMultipartFile("fileInput", "invoice.pdf", "application/pdf", new byte[] {1});
    }

    private JsonNode ingestAndCaptureRequest(
            String documentId, boolean index, boolean markdown, boolean chunks) throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenReturn(document);
            when(pdfContentExtractor.extractPageTextRaw(any(), eq(1))).thenReturn("page one");
            when(pdfContentExtractor.extractPageTextRaw(any(), eq(2))).thenReturn("page two");
            when(capabilityService.capabilities()).thenReturn(absent());
            ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
            when(aiEngineClient.postLongRunning(
                            eq("/api/v1/docparse/rag-ingest"), body.capture(), isNull()))
                    .thenReturn(ENGINE_RESPONSE);

            RagIngestResponse response =
                    service.ragIngest(
                            pdfFile(),
                            documentId,
                            512,
                            64,
                            DocparseMode.AUTO,
                            index,
                            markdown,
                            chunks);
            assertEquals(3, response.chunksIndexed());
            return jsonMapper.readTree(body.getValue());
        }
    }

    @Test
    void ragIngestExtractsPagesAndSendsTheWireContract() throws IOException {
        JsonNode request = ingestAndCaptureRequest("doc-1", true, false, false);
        assertEquals("invoice.pdf", request.get("fileName").asText());
        assertEquals("doc-1", request.get("documentId").asText());
        // AUTO resolves to a concrete tier before the wire; without the addon that is basic.
        assertEquals("basic", request.get("mode").asText());
        assertEquals(2, request.get("pages").size());
        assertEquals("page one", request.get("pages").get(0).get("text").asText());
        assertEquals(512, request.get("chunkSize").asInt());
        assertEquals(64, request.get("overlap").asInt());
        assertTrue(request.get("index").asBoolean());
        assertFalse(request.get("includeMarkdown").asBoolean());
        assertFalse(request.get("includeChunks").asBoolean());
    }

    @Test
    void ragIngestDefaultsDocumentIdToContentHash() throws IOException {
        when(fileIdStrategy.idFor(any(MultipartFile.class))).thenReturn("sha-abc");
        JsonNode request = ingestAndCaptureRequest("  ", true, false, false);
        assertEquals("sha-abc", request.get("documentId").asText());
    }

    @Test
    void ragIngestForwardsExportFlags() throws IOException {
        JsonNode request = ingestAndCaptureRequest("doc-1", false, true, true);
        assertFalse(request.get("index").asBoolean());
        assertTrue(request.get("includeMarkdown").asBoolean());
        assertTrue(request.get("includeChunks").asBoolean());
    }

    @Test
    void ragIngestSettingsBasicCapsTheWireMode() throws IOException {
        properties.getDocparse().setMode("basic");
        JsonNode request = ingestAndCaptureRequest("doc-1", true, false, false);
        assertEquals("basic", request.get("mode").asText());
    }

    @Test
    void ragIngestWithNothingToDoIs400() {
        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class,
                        () ->
                                service.ragIngest(
                                        pdfFile(),
                                        "doc",
                                        512,
                                        64,
                                        DocparseMode.AUTO,
                                        false,
                                        false,
                                        false));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(aiEngineClient);
    }

    @Test
    void ragIngestWhenDisabledIs503() {
        properties.getDocparse().setEnabled(false);
        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class,
                        () ->
                                service.ragIngest(
                                        pdfFile(),
                                        "doc",
                                        512,
                                        64,
                                        DocparseMode.AUTO,
                                        true,
                                        false,
                                        false));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
        verifyNoInteractions(aiEngineClient);
    }

    // --- tier resolution: auto and explicit requests ---

    private DocparseCapabilities installed() {
        return new DocparseCapabilities(true, "2.55.0", "2.6.0", true, "/models", List.of());
    }

    private DocparseCapabilities absent() {
        return new DocparseCapabilities(false, null, null, false, null, List.of());
    }

    private void settingsMode(String mode) {
        properties.getDocparse().setMode(mode);
    }

    @Test
    void autoPicksAdvancedWhenScannedAndInstalled() {
        settingsMode("auto");
        assertEquals(
                DocparseTier.ADVANCED,
                service.resolveTier(DocparseMode.AUTO, installed(), false, true));
    }

    @Test
    void autoPicksAdvancedWhenLayoutNeededAndInstalled() {
        settingsMode("auto");
        assertEquals(
                DocparseTier.ADVANCED,
                service.resolveTier(DocparseMode.AUTO, installed(), true, false));
    }

    @Test
    void autoPicksBasicForBornDigitalDocument() {
        settingsMode("auto");
        assertEquals(
                DocparseTier.BASIC,
                service.resolveTier(DocparseMode.AUTO, installed(), false, false));
    }

    @Test
    void autoPicksBasicWhenAddonMissingEvenIfScanned() {
        settingsMode("auto");
        assertEquals(
                DocparseTier.BASIC, service.resolveTier(DocparseMode.AUTO, absent(), false, true));
    }

    @Test
    void explicitBasicRequestAlwaysBasic() {
        settingsMode("auto");
        assertEquals(
                DocparseTier.BASIC,
                service.resolveTier(DocparseMode.BASIC, installed(), true, true));
    }

    @Test
    void explicitAdvancedRequestUsesAdvancedWhenInstalled() {
        settingsMode("auto");
        assertEquals(
                DocparseTier.ADVANCED,
                service.resolveTier(DocparseMode.ADVANCED, installed(), false, false));
    }

    @Test
    void explicitAdvancedRequestWithoutAddonReturns501() {
        settingsMode("auto");
        ResponseStatusException e =
                assertThrows(
                        ResponseStatusException.class,
                        () -> service.resolveTier(DocparseMode.ADVANCED, absent(), false, false));
        assertEquals(HttpStatus.NOT_IMPLEMENTED, e.getStatusCode());
    }

    @Test
    void settingsBasicOverridesAdvancedRequest() {
        settingsMode("basic");
        assertEquals(
                DocparseTier.BASIC,
                service.resolveTier(DocparseMode.ADVANCED, installed(), true, true));
    }

    @Test
    void settingsAdvancedUpgradesAutoRequest() {
        settingsMode("advanced");
        assertEquals(
                DocparseTier.ADVANCED,
                service.resolveTier(DocparseMode.AUTO, installed(), false, false));
    }

    @Test
    void settingsAdvancedHonoursStricterBasicRequest() {
        settingsMode("advanced");
        assertEquals(
                DocparseTier.BASIC,
                service.resolveTier(DocparseMode.BASIC, installed(), false, false));
    }

    @Test
    void settingsAdvancedWithoutAddonReturns501() {
        settingsMode("advanced");
        ResponseStatusException e =
                assertThrows(
                        ResponseStatusException.class,
                        () -> service.resolveTier(DocparseMode.AUTO, absent(), false, false));
        assertEquals(HttpStatus.NOT_IMPLEMENTED, e.getStatusCode());
    }

    @Test
    void nullRequestBehavesAsAuto() {
        settingsMode("auto");
        assertEquals(DocparseTier.BASIC, service.resolveTier(null, installed(), false, false));
        assertEquals(DocparseTier.ADVANCED, service.resolveTier(null, installed(), false, true));
    }

    // --- scanned heuristic ---

    @Test
    void looksScannedWhenAveragePageTextBelowThreshold() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            when(pdfContentExtractor.extractPageTextRaw(eq(document), anyInt()))
                    .thenReturn("short");
            assertTrue(service.looksScanned(document));
        }
    }

    @Test
    void doesNotLookScannedWithRealTextLayer() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            when(pdfContentExtractor.extractPageTextRaw(eq(document), anyInt()))
                    .thenReturn("x".repeat(500));
            assertFalse(service.looksScanned(document));
        }
    }

    @Test
    void fileNameFallsBackWhenMissing() {
        MultipartFile nameless =
                new MockMultipartFile("fileInput", "", "application/pdf", new byte[] {1});
        assertEquals("document.pdf", DocParseService.fileName(nameless));
        assertEquals("invoice.pdf", DocParseService.fileName(pdfFile()));
    }

    @Test
    void extractPagesSkipsBlankPagesAndCapsCharacters() throws IOException {
        properties.getAiEngine().getLimits().setMaxCharacters(12);
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            document.addPage(new PDPage());
            when(pdfContentExtractor.extractPageTextRaw(any(), eq(1))).thenReturn("0123456789");
            when(pdfContentExtractor.extractPageTextRaw(any(), eq(2))).thenReturn("   ");
            when(pdfContentExtractor.extractPageTextRaw(any(), eq(3))).thenReturn("abcdef");
            var pages = service.extractPages(document);
            assertEquals(2, pages.size());
            // Page 3 is truncated to the remaining budget (12 - 10 = 2 chars).
            assertEquals("ab", pages.get(1).getText());
        }
    }
}
