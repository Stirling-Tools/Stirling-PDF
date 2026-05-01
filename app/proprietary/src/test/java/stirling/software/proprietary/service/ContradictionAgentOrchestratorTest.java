package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.model.api.ai.contradiction.Claim;
import stirling.software.proprietary.model.api.ai.contradiction.ClaimPolarity;
import stirling.software.proprietary.model.api.ai.contradiction.Contradiction;
import stirling.software.proprietary.model.api.ai.contradiction.ContradictionSeverity;
import stirling.software.proprietary.model.api.ai.contradiction.ContradictionVerdict;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link ContradictionAgentOrchestrator}.
 *
 * <p>The {@code AiEngineClient} and {@code PdfContentExtractor} are mocked so the test exercises
 * the protocol contract (manifest -> requisition, evidence -> verdict) without hitting the Python
 * engine or running real text extraction.
 */
@ExtendWith(MockitoExtension.class)
class ContradictionAgentOrchestratorTest {

    private static final String EXAMINE_PATH = "/api/v1/ai/contradiction-agent/examine";
    private static final String DELIBERATE_PATH = "/api/v1/ai/contradiction-agent/deliberate";

    @Mock private AiEngineClient aiEngineClient;
    @Mock private PdfContentExtractor pdfContentExtractor;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private ObjectMapper objectMapper;
    private ContradictionAgentOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
        orchestrator =
                new ContradictionAgentOrchestrator(
                        aiEngineClient, pdfDocumentFactory, pdfContentExtractor, objectMapper);
    }

    @Test
    void happyPathReturnsCannedVerdict() throws IOException {
        MockMultipartFile pdfFile = pdf("doc.pdf");
        byte[] bytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(1)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(2)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                .thenReturn("Project deadline is Friday.");
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(2)))
                .thenReturn("Project deadline has been moved to next month.");

        // Round 1: examine -> requisition
        String requisitionJson =
                "{\"type\":\"requisition\",\"needText\":[0,1],\"needTables\":[],"
                        + "\"needOcr\":[],\"rationale\":\"text on both pages\"}";
        when(aiEngineClient.post(eq(EXAMINE_PATH), any())).thenReturn(requisitionJson);

        // Round 2: deliberate -> verdict
        ContradictionVerdict canned = cannedVerdict();
        when(aiEngineClient.post(eq(DELIBERATE_PATH), any()))
                .thenReturn(objectMapper.writeValueAsString(canned));

        ContradictionVerdict result = orchestrator.audit(pdfFile);

        assertNotNull(result);
        assertEquals(canned.sessionId(), result.sessionId());
        assertEquals(1, result.contradictions().size());
        assertEquals(ContradictionSeverity.ERROR, result.contradictions().get(0).severity());
        assertEquals(false, result.clean());
    }

    @Test
    void examinePostsManifestToCorrectPath() throws IOException {
        MockMultipartFile pdfFile = pdf("doc.pdf");
        byte[] bytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(1)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(2)))
                .thenReturn(FolioType.IMAGE);

        // Examine returns an empty requisition so we skip the deliberate body work
        String requisitionJson =
                "{\"type\":\"requisition\",\"needText\":[],\"needTables\":[],"
                        + "\"needOcr\":[],\"rationale\":\"nothing to do\"}";
        when(aiEngineClient.post(eq(EXAMINE_PATH), any())).thenReturn(requisitionJson);
        when(aiEngineClient.post(eq(DELIBERATE_PATH), any()))
                .thenReturn(objectMapper.writeValueAsString(cannedVerdict()));

        orchestrator.audit(pdfFile);

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(eq(EXAMINE_PATH), captor.capture());
        JsonNode body = objectMapper.readTree(captor.getValue());
        assertNotNull(body.get("sessionId"));
        assertEquals(2, body.get("pageCount").asInt());
        assertEquals(2, body.get("folioTypes").size());
        assertEquals(1, body.get("round").asInt());
    }

    @Test
    void deliberatePostsEvidenceWithoutQueryString() throws IOException {
        MockMultipartFile pdfFile = pdf("doc.pdf");
        byte[] bytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(1)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(2)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                .thenReturn("page one");
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(2)))
                .thenReturn("page two");

        String requisitionJson =
                "{\"type\":\"requisition\",\"needText\":[0,1],\"needTables\":[],"
                        + "\"needOcr\":[],\"rationale\":\"both pages\"}";
        when(aiEngineClient.post(eq(EXAMINE_PATH), any())).thenReturn(requisitionJson);
        when(aiEngineClient.post(eq(DELIBERATE_PATH), any()))
                .thenReturn(objectMapper.writeValueAsString(cannedVerdict()));

        orchestrator.audit(pdfFile);

        // The orchestrator must use the bare path with no `?tolerance=...` query
        // string (regression: the contradiction route does NOT accept tolerance).
        verify(aiEngineClient).post(eq(DELIBERATE_PATH), any());
        verify(aiEngineClient, never()).post(contains("?"), any());
    }

    @Test
    void fulfilDoesNotRequestTables() throws IOException {
        MockMultipartFile pdfFile = pdf("doc.pdf");
        byte[] bytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(1)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(2)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                .thenReturn("page one");
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(2)))
                .thenReturn("page two");

        // The Python side maliciously requests a table on page 0; the Java
        // orchestrator must NOT call extractTablesAsCsv because the contradiction
        // agent is purely textual.
        String requisitionJson =
                "{\"type\":\"requisition\",\"needText\":[0,1],\"needTables\":[0],"
                        + "\"needOcr\":[],\"rationale\":\"misbehaving\"}";
        when(aiEngineClient.post(eq(EXAMINE_PATH), any())).thenReturn(requisitionJson);
        when(aiEngineClient.post(eq(DELIBERATE_PATH), any()))
                .thenReturn(objectMapper.writeValueAsString(cannedVerdict()));

        orchestrator.audit(pdfFile);

        verify(pdfContentExtractor, never())
                .extractTablesAsCsv(any(PDDocument.class), any(Integer.class));
    }

    @Test
    void deliberateIsCalledWithFinalRoundTrue() throws IOException {
        MockMultipartFile pdfFile = pdf("doc.pdf");
        byte[] bytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(1)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.classifyPage(any(PDDocument.class), eq(2)))
                .thenReturn(FolioType.TEXT);
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(1)))
                .thenReturn("page 1");
        when(pdfContentExtractor.extractPageTextRaw(any(PDDocument.class), eq(2)))
                .thenReturn("page 2");

        String requisitionJson =
                "{\"type\":\"requisition\",\"needText\":[0,1],\"needTables\":[],"
                        + "\"needOcr\":[],\"rationale\":\"all\"}";
        when(aiEngineClient.post(eq(EXAMINE_PATH), any())).thenReturn(requisitionJson);
        when(aiEngineClient.post(eq(DELIBERATE_PATH), any()))
                .thenReturn(objectMapper.writeValueAsString(cannedVerdict()));

        orchestrator.audit(pdfFile);

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(eq(DELIBERATE_PATH), captor.capture());
        JsonNode evidence = objectMapper.readTree(captor.getValue());
        // The single round, single deliberate orchestrator passes finalRound=true so
        // the agent MUST commit to a verdict this round (no more requisitions allowed).
        assertEquals(true, evidence.get("finalRound").asBoolean());
        assertEquals(2, evidence.get("round").asInt());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static MockMultipartFile pdf(String filename) {
        return new MockMultipartFile(
                "fileInput",
                filename,
                MediaType.APPLICATION_PDF_VALUE,
                "%PDF-1.4\n%%EOF".getBytes());
    }

    private static byte[] twoPagePdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 2; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, 700);
                    cs.showText("Page " + i + " content");
                    cs.endText();
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static ContradictionVerdict cannedVerdict() {
        Claim claim1 =
                new Claim(
                        0,
                        "page 1 says Friday",
                        "deadline",
                        ClaimPolarity.ASSERT,
                        "deadline is Friday");
        Claim claim2 =
                new Claim(
                        1,
                        "page 2 says next month",
                        "deadline",
                        ClaimPolarity.DENY,
                        "moved to next month");
        Contradiction contradiction =
                new Contradiction(
                        "deadline",
                        claim1,
                        claim2,
                        "page 1 says Friday, page 2 says next month",
                        ContradictionSeverity.ERROR);
        return new ContradictionVerdict(
                "contradiction_verdict",
                "session-1",
                List.of(contradiction),
                List.of(0, 1),
                2,
                "Found 1 contradiction.",
                false,
                List.of());
    }
}
