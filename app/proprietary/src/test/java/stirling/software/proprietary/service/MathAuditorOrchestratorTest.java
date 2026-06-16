package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.api.ai.AuditDiscrepancy;
import stirling.software.proprietary.model.api.ai.AuditSeverity;
import stirling.software.proprietary.model.api.ai.DiscrepancyKind;
import stirling.software.proprietary.model.api.ai.Evidence;
import stirling.software.proprietary.model.api.ai.FolioManifest;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.model.api.ai.Requisition;
import stirling.software.proprietary.model.api.ai.Verdict;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link MathAuditorOrchestrator}.
 *
 * <p>Collaborators (engine client, content extractor, user service) are mocked; the PDF factory is
 * stubbed to return a real in-memory {@link PDDocument} so page-count arithmetic and the
 * try-with-resources lifecycle are exercised for real. A real {@link JsonMapper} performs the
 * round-trip serialisation so the wire contract (manifest out / requisition in / evidence out /
 * verdict in) is genuinely exercised.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MathAuditorOrchestratorTest {

    private static final String EXAMINE_PATH = "/api/v1/ai/math-auditor-agent/examine";
    private static final String DELIBERATE_PATH = "/api/v1/ai/math-auditor-agent/deliberate";

    @Mock private AiEngineClient aiEngineClient;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfContentExtractor pdfContentExtractor;
    @Mock private UserServiceInterface userService;

    private ObjectMapper objectMapper;
    private MathAuditorOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
        orchestrator =
                new MathAuditorOrchestrator(
                        aiEngineClient,
                        pdfDocumentFactory,
                        pdfContentExtractor,
                        objectMapper,
                        userService);
    }

    // ---------------------------------------------------------------------
    // Happy path
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("audit() happy path")
    class HappyPath {

        @Test
        @DisplayName("runs examine then deliberate and returns the Verdict")
        void runsFullProtocolAndReturnsVerdict() throws IOException {
            stubDocument(3);
            when(userService.getCurrentUsername()).thenReturn("alice");
            stubClassifyAll(FolioType.TEXT);

            // Examiner asks for text on page 0 and tables on page 1.
            Requisition requisition =
                    new Requisition(
                            "requisition", List.of(0), List.of(1), List.of(), "need it all");
            Verdict verdict = cleanVerdict("sess");
            stubEngine(requisition, verdict);

            when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                    .thenReturn("Total: 100");
            when(pdfContentExtractor.extractTablesAsCsv(any(PDDocument.class), eq(2)))
                    .thenReturn(List.of("a,b\n1,2"));

            Verdict result = orchestrator.audit(pdf("doc.pdf"), new BigDecimal("0.01"));

            assertNotNull(result);
            assertTrue(result.clean());
            // Two engine round-trips: examine + deliberate.
            verify(aiEngineClient, times(2)).post(anyString(), anyString(), nullable(String.class));
            verify(aiEngineClient).post(eq(EXAMINE_PATH), anyString(), eq("alice"));
        }

        @Test
        @DisplayName("classifies every page (1-based) before sending the manifest")
        void classifiesEveryPage() throws IOException {
            stubDocument(2);
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(), "none"),
                    cleanVerdict("s"));

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            verify(pdfContentExtractor).classifyPage(any(PDDocument.class), eq(1));
            verify(pdfContentExtractor).classifyPage(any(PDDocument.class), eq(2));
            verify(pdfContentExtractor, never()).classifyPage(any(PDDocument.class), eq(3));
        }

        @Test
        @DisplayName("manifest carries the page count and one FolioType per page")
        void manifestCarriesPageCountAndTypes() throws IOException {
            stubDocument(2);
            when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(1)))
                    .thenReturn(FolioType.TEXT);
            when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(2)))
                    .thenReturn(FolioType.IMAGE);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(), "none"),
                    cleanVerdict("s"));

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            FolioManifest manifest = objectMapper.readValue(examineBody(), FolioManifest.class);
            assertEquals(2, manifest.pageCount());
            assertEquals(2, manifest.folioTypes().size());
            assertEquals(FolioType.TEXT, manifest.folioTypes().get(0));
            assertEquals(FolioType.IMAGE, manifest.folioTypes().get(1));
            assertEquals(1, manifest.round());
        }
    }

    // ---------------------------------------------------------------------
    // Requisition fulfilment branches
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("fulfilment of the Requisition")
    class Fulfilment {

        @Test
        @DisplayName("extracts text on requested page (0-based -> 1-based) and builds a folio")
        void extractsTextForRequestedPage() throws IOException {
            stubDocument(2);
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition("requisition", List.of(0), List.of(), List.of(), "page 0 text"),
                    cleanVerdict("s"));
            when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                    .thenReturn("Subtotal 42");

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            // Page index 0 from Python maps to 1-based page 1 in the extractor.
            verify(pdfContentExtractor).extractPageTextRaw(any(PDDocument.class), eq(1));

            Evidence evidence = objectMapper.readValue(deliberateBody(), Evidence.class);
            assertEquals(1, evidence.folios().size());
            assertEquals(0, evidence.folios().get(0).page());
            assertEquals("Subtotal 42", evidence.folios().get(0).text());
            assertTrue(evidence.unauditablePages().isEmpty());
            assertEquals(2, evidence.round());
            assertTrue(evidence.finalRound());
        }

        @Test
        @DisplayName("extracts tables when only tables are requested")
        void extractsTablesForRequestedPage() throws IOException {
            stubDocument(3);
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition(
                            "requisition", List.of(), List.of(2), List.of(), "page 2 tables"),
                    cleanVerdict("s"));
            when(pdfContentExtractor.extractTablesAsCsv(any(PDDocument.class), eq(3)))
                    .thenReturn(List.of("x,y\n9,9"));

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            verify(pdfContentExtractor).extractTablesAsCsv(any(PDDocument.class), eq(3));
            verify(pdfContentExtractor, never())
                    .extractPageTextRaw(any(PDDocument.class), anyInt());

            Evidence evidence = objectMapper.readValue(deliberateBody(), Evidence.class);
            assertEquals(1, evidence.folios().size());
            assertEquals(List.of("x,y\n9,9"), evidence.folios().get(0).tables());
        }

        @Test
        @DisplayName("OCR-requested pages are marked unauditable and produce no folio")
        void ocrPagesAreMarkedUnauditable() throws IOException {
            stubDocument(2);
            stubClassifyAll(FolioType.IMAGE);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(1), "needs OCR"),
                    cleanVerdict("s"));

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            Evidence evidence = objectMapper.readValue(deliberateBody(), Evidence.class);
            // OCR is not wired: no folio, page recorded as unauditable.
            assertTrue(evidence.folios().isEmpty());
            assertEquals(List.of(1), evidence.unauditablePages());
            verify(pdfContentExtractor, never())
                    .extractPageTextRaw(any(PDDocument.class), anyInt());
            verify(pdfContentExtractor, never())
                    .extractTablesAsCsv(any(PDDocument.class), anyInt());
        }

        @Test
        @DisplayName("a page needing both text and tables yields a single folio with both")
        void textAndTablesOnSamePageProduceOneFolio() throws IOException {
            stubDocument(1);
            stubClassifyAll(FolioType.MIXED);
            stubEngine(
                    new Requisition("requisition", List.of(0), List.of(0), List.of(), "both"),
                    cleanVerdict("s"));
            when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                    .thenReturn("the text");
            when(pdfContentExtractor.extractTablesAsCsv(any(PDDocument.class), eq(1)))
                    .thenReturn(List.of("c1,c2"));

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            Evidence evidence = objectMapper.readValue(deliberateBody(), Evidence.class);
            assertEquals(1, evidence.folios().size());
            assertEquals("the text", evidence.folios().get(0).text());
            assertEquals(List.of("c1,c2"), evidence.folios().get(0).tables());
        }

        @Test
        @DisplayName("out-of-bounds page indices are dropped before extraction")
        void outOfBoundsPagesAreDropped() throws IOException {
            stubDocument(2); // valid 0-based indices: 0, 1
            stubClassifyAll(FolioType.TEXT);
            // -1 (negative) and 2 (>= totalPages) are out of bounds; only 0 survives.
            stubEngine(
                    new Requisition(
                            "requisition", List.of(-1, 0, 2), List.of(), List.of(), "mixed"),
                    cleanVerdict("s"));
            when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                    .thenReturn("kept");

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            verify(pdfContentExtractor).extractPageTextRaw(any(PDDocument.class), eq(1));
            // Out-of-bounds page 2 -> would be 1-based page 3; must never be touched.
            verify(pdfContentExtractor, never()).extractPageTextRaw(any(PDDocument.class), eq(3));

            Evidence evidence = objectMapper.readValue(deliberateBody(), Evidence.class);
            assertEquals(1, evidence.folios().size());
            assertEquals(0, evidence.folios().get(0).page());
        }

        @Test
        @DisplayName("empty Requisition yields evidence with no folios but still deliberates")
        void emptyRequisitionStillDeliberates() throws IOException {
            stubDocument(2);
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(), "nothing"),
                    cleanVerdict("s"));

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            Evidence evidence = objectMapper.readValue(deliberateBody(), Evidence.class);
            assertTrue(evidence.folios().isEmpty());
            assertTrue(evidence.unauditablePages().isEmpty());
            // Deliberate is still invoked even with empty evidence.
            verify(aiEngineClient)
                    .post(deliberatePathMatcher(), anyString(), nullable(String.class));
        }

        @Test
        @DisplayName("null requisition lists (needText/needTables/needOcr) are tolerated")
        void nullRequisitionListsAreTolerated() throws IOException {
            stubDocument(2);
            stubClassifyAll(FolioType.TEXT);
            // All three "need" lists null - union/contains must null-guard.
            stubEngine(
                    new Requisition("requisition", null, null, null, "null lists"),
                    cleanVerdict("s"));

            Verdict result = orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            assertNotNull(result);
            Evidence evidence = objectMapper.readValue(deliberateBody(), Evidence.class);
            assertTrue(evidence.folios().isEmpty());
        }
    }

    // ---------------------------------------------------------------------
    // Engine wiring details: paths, tolerance, user header
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("engine wiring")
    class EngineWiring {

        @Test
        @DisplayName(
                "examine uses the examine path, deliberate uses the deliberate path with tolerance")
        void pathsAndToleranceAreCorrect() throws IOException {
            stubDocument(1);
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(), "x"),
                    cleanVerdict("s"));

            orchestrator.audit(pdf("doc.pdf"), new BigDecimal("0.5"));

            ArgumentCaptor<String> paths = ArgumentCaptor.forClass(String.class);
            verify(aiEngineClient, times(2))
                    .post(paths.capture(), anyString(), nullable(String.class));
            List<String> captured = paths.getAllValues();
            assertEquals(EXAMINE_PATH, captured.get(0));
            assertEquals(DELIBERATE_PATH + "?tolerance=0.5", captured.get(1));
        }

        @Test
        @DisplayName("tolerance is rendered with toPlainString (no scientific notation)")
        void tolerancePlainString() throws IOException {
            stubDocument(1);
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(), "x"),
                    cleanVerdict("s"));

            // 1E-7 would render as scientific notation via toString(); toPlainString avoids it.
            orchestrator.audit(pdf("doc.pdf"), new BigDecimal("0.0000001"));

            verify(aiEngineClient)
                    .post(
                            eq(DELIBERATE_PATH + "?tolerance=0.0000001"),
                            anyString(),
                            nullable(String.class));
        }

        @Test
        @DisplayName("current user id is forwarded to the engine when a user service is present")
        void userIdForwarded() throws IOException {
            stubDocument(1);
            when(userService.getCurrentUsername()).thenReturn("bob");
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(), "x"),
                    cleanVerdict("s"));

            orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            verify(aiEngineClient, times(2)).post(anyString(), anyString(), eq("bob"));
        }

        @Test
        @DisplayName("a null user service yields a null user id (no NPE)")
        void nullUserServiceYieldsNullUserId() throws IOException {
            // Re-create orchestrator with no user service (the @Autowired(required=false) case).
            orchestrator =
                    new MathAuditorOrchestrator(
                            aiEngineClient,
                            pdfDocumentFactory,
                            pdfContentExtractor,
                            objectMapper,
                            null);
            stubDocument(1);
            stubClassifyAll(FolioType.TEXT);
            stubEngine(
                    new Requisition("requisition", List.of(), List.of(), List.of(), "x"),
                    cleanVerdict("s"));

            Verdict result = orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            assertNotNull(result);
            verify(aiEngineClient, times(2)).post(anyString(), anyString(), nullable(String.class));
        }
    }

    // ---------------------------------------------------------------------
    // Error / edge behaviour
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("error handling")
    class ErrorHandling {

        @Test
        @DisplayName("null Verdict from deliberate raises IllegalStateException")
        void nullVerdictThrows() throws IOException {
            stubDocument(1);
            stubClassifyAll(FolioType.TEXT);
            Requisition requisition =
                    new Requisition("requisition", List.of(), List.of(), List.of(), "x");
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(objectMapper.writeValueAsString(requisition));
            // Deliberate returns JSON null -> deserialises to null Verdict.
            when(aiEngineClient.post(deliberatePathMatcher(), anyString(), nullable(String.class)))
                    .thenReturn("null");

            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE));
            assertTrue(ex.getMessage().contains("null Verdict"));
        }

        @Test
        @DisplayName("an IOException from the engine on examine propagates and skips deliberate")
        void engineIoExceptionOnExaminePropagates() throws IOException {
            stubDocument(1);
            stubClassifyAll(FolioType.TEXT);
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenThrow(new IOException("engine down"));

            IOException ex =
                    assertThrows(
                            IOException.class,
                            () -> orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE));
            assertEquals("engine down", ex.getMessage());
            verify(aiEngineClient, never())
                    .post(deliberatePathMatcher(), anyString(), nullable(String.class));
        }

        @Test
        @DisplayName("an IOException from the PDF factory load propagates")
        void factoryLoadIoExceptionPropagates() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("corrupt pdf"));

            IOException ex =
                    assertThrows(
                            IOException.class,
                            () -> orchestrator.audit(pdf("bad.pdf"), BigDecimal.ONE));
            assertEquals("corrupt pdf", ex.getMessage());
            verify(aiEngineClient, never()).post(anyString(), anyString(), nullable(String.class));
        }

        @Test
        @DisplayName(
                "verdict error/warning counts derived from discrepancies survive the round-trip")
        void verdictCountsSurviveRoundTrip() throws IOException {
            stubDocument(1);
            stubClassifyAll(FolioType.TEXT);
            Verdict dirty =
                    new Verdict(
                            "verdict",
                            "sess",
                            List.of(
                                    new AuditDiscrepancy(
                                            0,
                                            DiscrepancyKind.TALLY,
                                            AuditSeverity.ERROR,
                                            "bad sum",
                                            "100",
                                            "99",
                                            "row 3"),
                                    new AuditDiscrepancy(
                                            0,
                                            DiscrepancyKind.ARITHMETIC,
                                            AuditSeverity.WARNING,
                                            "maybe",
                                            "10",
                                            "10.001",
                                            "row 4")),
                            List.of(0),
                            2,
                            "found issues",
                            false,
                            List.of());
            stubEngine(new Requisition("requisition", List.of(), List.of(), List.of(), "x"), dirty);

            Verdict result = orchestrator.audit(pdf("doc.pdf"), BigDecimal.ONE);

            assertEquals(1L, result.errorCount());
            assertEquals(1L, result.warningCount());
            assertTrue(!result.clean());
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /** Stub the factory to return a fresh real {@code n}-page PDF each time it's loaded. */
    private void stubDocument(int pages) throws IOException {
        byte[] bytes = pdfBytes(pages);
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
    }

    private void stubClassifyAll(FolioType type) throws IOException {
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), anyInt())).thenReturn(type);
    }

    /**
     * Wire the two engine calls: examine returns the requisition, deliberate returns the verdict.
     */
    private void stubEngine(Requisition requisition, Verdict verdict) throws IOException {
        when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                .thenReturn(objectMapper.writeValueAsString(requisition));
        when(aiEngineClient.post(deliberatePathMatcher(), anyString(), nullable(String.class)))
                .thenReturn(objectMapper.writeValueAsString(verdict));
    }

    /** Matcher for the deliberate path, which always carries a {@code ?tolerance=} query string. */
    private static String deliberatePathMatcher() {
        return org.mockito.ArgumentMatchers.startsWith(DELIBERATE_PATH);
    }

    /** Captured request body sent to the examine endpoint. */
    private String examineBody() throws IOException {
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(eq(EXAMINE_PATH), body.capture(), nullable(String.class));
        return body.getValue();
    }

    /** Captured request body sent to the deliberate endpoint. */
    private String deliberateBody() throws IOException {
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient)
                .post(deliberatePathMatcher(), body.capture(), nullable(String.class));
        return body.getValue();
    }

    private static Verdict cleanVerdict(String sessionId) {
        return new Verdict(
                "verdict", sessionId, List.of(), List.of(), 2, "all good", true, List.of());
    }

    private static MockMultipartFile pdf(String filename) {
        return new MockMultipartFile(
                "fileInput",
                filename,
                MediaType.APPLICATION_PDF_VALUE,
                "%PDF-1.4\n%%EOF".getBytes());
    }

    private static byte[] pdfBytes(int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }
}
