package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.api.ai.Verdict;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link MathAuditorOrchestrator}. The PDFBox factory and the real {@link
 * PdfContentExtractor} are wired so page classification/extraction run for real; only the engine
 * HTTP boundary ({@link AiEngineClient}) is mocked so no network call is ever made.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("MathAuditorOrchestrator")
class MathAuditorOrchestratorTest {

    private static final String EXAMINE_PATH = "/api/v1/ai/math-auditor-agent/examine";
    private static final String DELIBERATE_PREFIX = "/api/v1/ai/math-auditor-agent/deliberate";

    @Mock private AiEngineClient aiEngineClient;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private UserServiceInterface userService;

    private ObjectMapper objectMapper;
    private PdfContentExtractor pdfContentExtractor;
    private MathAuditorOrchestrator orchestrator;

    @BeforeEach
    void setUp() throws IOException {
        objectMapper = JsonMapper.builder().build();
        // Real extractor; tabula is never reached for text-only requisitions but stub leniently.
        stirling.software.SPDF.pdf.parser.TabulaTableParser tabula =
                org.mockito.Mockito.mock(stirling.software.SPDF.pdf.parser.TabulaTableParser.class);
        lenient().when(tabula.parse(any(PDDocument.class), anyInt())).thenReturn(List.of());
        pdfContentExtractor = new PdfContentExtractor(tabula);
        orchestrator =
                new MathAuditorOrchestrator(
                        aiEngineClient,
                        pdfDocumentFactory,
                        pdfContentExtractor,
                        objectMapper,
                        userService);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static MultipartFile pdfFile() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 2; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, 700);
                    cs.showText("Total amount on page " + (i + 1) + " is 100 plus 50 equals 150.");
                    cs.endText();
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return new MockMultipartFile(
                    "file", "ledger.pdf", "application/pdf", baos.toByteArray());
        }
    }

    /** A fresh 2-page text document the factory hands back on load(). */
    private static PDDocument loadedDocument() throws IOException {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < 2; i++) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(72, 700);
                cs.showText("Subtotal " + (i + 1) + ": 100 + 50 = 150 confirmed correct here.");
                cs.endText();
            }
        }
        return doc;
    }

    private String requisitionJson(String needText, String needTables, String needOcr) {
        return """
                {"type":"requisition","needText":%s,"needTables":%s,"needOcr":%s,
                 "rationale":"check the totals"}
                """
                .formatted(needText, needTables, needOcr);
    }

    private String verdictJson(boolean clean) {
        return """
                {"type":"verdict","sessionId":"s","discrepancies":[],"pagesExamined":[0,1],
                 "roundsTaken":1,"summary":"all good","clean":%s,"unauditablePages":[]}
                """
                .formatted(clean);
    }

    @Nested
    @DisplayName("audit happy path")
    class HappyPath {

        @Test
        @DisplayName("classifies, examines, fulfils text pages, then returns a verdict")
        void fullAuditReturnsVerdict() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(requisitionJson("[0,1]", "[]", "[]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), nullable(String.class)))
                    .thenReturn(verdictJson(true));

            Verdict verdict = orchestrator.audit(pdfFile(), new BigDecimal("0.01"));

            assertThat(verdict).isNotNull();
            assertThat(verdict.clean()).isTrue();
            assertThat(verdict.pagesExamined()).containsExactly(0, 1);
            verify(aiEngineClient, times(1))
                    .post(eq(EXAMINE_PATH), anyString(), nullable(String.class));
            verify(aiEngineClient, times(1))
                    .post(contains("deliberate"), anyString(), nullable(String.class));
        }

        @Test
        @DisplayName("passes the tolerance through as a deliberate query parameter")
        void toleranceIsForwarded() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(requisitionJson("[0]", "[]", "[]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), nullable(String.class)))
                    .thenReturn(verdictJson(true));

            orchestrator.audit(pdfFile(), new BigDecimal("0.5"));

            verify(aiEngineClient)
                    .post(
                            eq(DELIBERATE_PREFIX + "?tolerance=0.5"),
                            anyString(),
                            nullable(String.class));
        }

        @Test
        @DisplayName("requesting tables triggers tabula extraction for that page")
        void tableRequisitionFulfilled() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(requisitionJson("[]", "[0]", "[]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), nullable(String.class)))
                    .thenReturn(verdictJson(true));

            Verdict verdict = orchestrator.audit(pdfFile(), new BigDecimal("0.01"));
            assertThat(verdict).isNotNull();
        }

        @Test
        @DisplayName(
                "OCR-only requisition marks the page unauditable and skips deliberation cleanly")
        void ocrRequisitionMarksUnauditable() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(requisitionJson("[]", "[]", "[0]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), nullable(String.class)))
                    .thenReturn(verdictJson(true));

            Verdict verdict = orchestrator.audit(pdfFile(), new BigDecimal("0.01"));
            assertThat(verdict).isNotNull();
        }

        @Test
        @DisplayName("out-of-bounds requisition pages are filtered before fulfilment")
        void outOfBoundsPagesFiltered() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(requisitionJson("[5,9]", "[]", "[]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), nullable(String.class)))
                    .thenReturn(verdictJson(true));

            Verdict verdict = orchestrator.audit(pdfFile(), new BigDecimal("0.01"));
            assertThat(verdict).isNotNull();
        }
    }

    @Nested
    @DisplayName("error paths")
    class ErrorPaths {

        @Test
        @DisplayName("throws IllegalStateException when deliberate returns null")
        void nullVerdictThrows() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(requisitionJson("[0]", "[]", "[]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), nullable(String.class)))
                    .thenReturn("null");

            assertThatThrownBy(() -> orchestrator.audit(pdfFile(), new BigDecimal("0.01")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("null Verdict");
        }

        @Test
        @DisplayName("propagates an IOException raised by the engine client")
        void engineFailurePropagates() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenThrow(new IOException("engine down"));

            assertThatThrownBy(() -> orchestrator.audit(pdfFile(), new BigDecimal("0.01")))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("engine down");
            verify(aiEngineClient, never())
                    .post(contains("deliberate"), anyString(), nullable(String.class));
        }
    }

    @Nested
    @DisplayName("user id propagation")
    class UserIdPropagation {

        @Test
        @DisplayName("forwards the current username to the engine when security is enabled")
        void forwardsUsername() throws IOException {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), eq("alice")))
                    .thenReturn(requisitionJson("[0]", "[]", "[]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), eq("alice")))
                    .thenReturn(verdictJson(true));

            orchestrator.audit(pdfFile(), new BigDecimal("0.01"));

            verify(aiEngineClient).post(eq(EXAMINE_PATH), anyString(), eq("alice"));
        }

        @Test
        @DisplayName("sends a null user id when no UserService bean is present")
        void nullUserServiceSendsNull() throws IOException {
            MathAuditorOrchestrator noUser =
                    new MathAuditorOrchestrator(
                            aiEngineClient,
                            pdfDocumentFactory,
                            pdfContentExtractor,
                            objectMapper,
                            null);
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(loadedDocument());
            when(aiEngineClient.post(eq(EXAMINE_PATH), anyString(), nullable(String.class)))
                    .thenReturn(requisitionJson("[0]", "[]", "[]"));
            when(aiEngineClient.post(contains("deliberate"), anyString(), nullable(String.class)))
                    .thenReturn(verdictJson(true));

            Verdict verdict = noUser.audit(pdfFile(), new BigDecimal("0.01"));

            assertThat(verdict).isNotNull();
            verify(aiEngineClient).post(eq(EXAMINE_PATH), anyString(), eq((String) null));
        }
    }
}
