package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfAnnotationService;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentEngineResponse;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentInstruction;
import stirling.software.proprietary.model.api.ai.comments.TextChunk;
import stirling.software.proprietary.service.PdfCommentAgentOrchestrator.AnnotatedPdf;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Smoke tests for {@link PdfCommentAgentOrchestrator}. Collaborators (engine client, PDF factory,
 * chunk extractor) are mocked; the orchestrator is exercised end-to-end on an in-memory PDF so the
 * returned bytes can be re-loaded and inspected.
 */
@ExtendWith(MockitoExtension.class)
class PdfCommentAgentOrchestratorTest {

    @Mock private AiEngineClient aiEngineClient;
    @Mock private PdfTextChunkExtractor pdfTextChunkExtractor;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private ObjectMapper objectMapper;
    private PdfAnnotationService pdfAnnotationService;
    private PdfCommentAgentOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
        // Real (not mocked) — it's a pure primitive; exercising it in the test gives us stronger
        // assertions (the annotated PDF actually has the expected sticky notes).
        pdfAnnotationService = new PdfAnnotationService();
        orchestrator =
                new PdfCommentAgentOrchestrator(
                        aiEngineClient,
                        pdfTextChunkExtractor,
                        pdfDocumentFactory,
                        objectMapper,
                        pdfAnnotationService);
    }

    @Test
    void happyPathAppliesValidInstructionsOnCorrectPagesAndReturnsBytes() throws IOException {
        MockMultipartFile input = pdf("doc.pdf");
        byte[] pdfBytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));

        TextChunk c0 = new TextChunk("p0-c0", 0, 72f, 700f, 100f, 12f, "Chunk zero");
        TextChunk c1 = new TextChunk("p0-c1", 0, 72f, 680f, 100f, 12f, "Chunk one");
        TextChunk c2 = new TextChunk("p1-c0", 1, 72f, 700f, 100f, 12f, "Chunk two");
        when(pdfTextChunkExtractor.extract(any(PDDocument.class))).thenReturn(List.of(c0, c1, c2));

        PdfCommentEngineResponse engineResponse =
                new PdfCommentEngineResponse(
                        "session-1",
                        List.of(
                                new PdfCommentInstruction(
                                        "p0-c0", "Comment on page 0", "alice", "Heads up"),
                                new PdfCommentInstruction(
                                        "p1-c0", "Comment on page 1", null, null)),
                        "reviewed");
        when(aiEngineClient.post(anyString(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(engineResponse));

        AnnotatedPdf result = orchestrator.applyComments(input, "please comment");

        assertEquals("doc-commented.pdf", result.fileName());
        assertNotNull(result.bytes(), "Returned bytes must not be null");
        try (PDDocument saved = Loader.loadPDF(result.bytes())) {
            List<PDAnnotationText> page0Texts = textAnnotations(saved.getPage(0).getAnnotations());
            List<PDAnnotationText> page1Texts = textAnnotations(saved.getPage(1).getAnnotations());
            assertEquals(1, page0Texts.size(), "Exactly one annotation on page 0");
            assertEquals(1, page1Texts.size(), "Exactly one annotation on page 1");
            assertEquals("Comment on page 0", page0Texts.get(0).getContents());
            assertEquals("Comment on page 1", page1Texts.get(0).getContents());
        }
    }

    @Test
    void unknownChunkIdsAreSkippedButValidOnesApplied() throws IOException {
        MockMultipartFile input = pdf("doc.pdf");
        byte[] pdfBytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));

        TextChunk c0 = new TextChunk("p0-c0", 0, 72f, 700f, 100f, 12f, "Chunk zero");
        when(pdfTextChunkExtractor.extract(any(PDDocument.class))).thenReturn(List.of(c0));

        PdfCommentEngineResponse engineResponse =
                new PdfCommentEngineResponse(
                        "session-2",
                        List.of(
                                new PdfCommentInstruction("p0-c0", "Valid", null, null),
                                new PdfCommentInstruction("p999-c999", "Bogus", null, null)),
                        "mixed");
        when(aiEngineClient.post(anyString(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(engineResponse));

        AnnotatedPdf result = orchestrator.applyComments(input, "test");

        try (PDDocument saved = Loader.loadPDF(result.bytes())) {
            int totalAnnotations = 0;
            for (int i = 0; i < saved.getNumberOfPages(); i++) {
                totalAnnotations += textAnnotations(saved.getPage(i).getAnnotations()).size();
            }
            assertEquals(1, totalAnnotations, "Only the valid chunk annotation should be applied");
        }
    }

    @Test
    void emptyCommentsListReturnsDocumentWithoutAnnotations() throws IOException {
        MockMultipartFile input = pdf("doc.pdf");
        byte[] pdfBytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));

        TextChunk c0 = new TextChunk("p0-c0", 0, 72f, 700f, 100f, 12f, "Chunk");
        when(pdfTextChunkExtractor.extract(any(PDDocument.class))).thenReturn(List.of(c0));

        PdfCommentEngineResponse engineResponse =
                new PdfCommentEngineResponse("s", List.of(), "no comments worth making");
        when(aiEngineClient.post(anyString(), anyString()))
                .thenReturn(objectMapper.writeValueAsString(engineResponse));

        AnnotatedPdf result = orchestrator.applyComments(input, "test");

        assertEquals("doc-commented.pdf", result.fileName());
        try (PDDocument saved = Loader.loadPDF(result.bytes())) {
            for (int i = 0; i < saved.getNumberOfPages(); i++) {
                assertTrue(
                        textAnnotations(saved.getPage(i).getAnnotations()).isEmpty(),
                        "Page " + i + " should have no text annotations");
            }
        }
    }

    @Test
    void emptyChunksListThrowsBadRequestAndDoesNotCallEngine() throws IOException {
        MockMultipartFile input = pdf("doc.pdf");
        byte[] pdfBytes = twoPagePdfBytes();
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));
        when(pdfTextChunkExtractor.extract(any(PDDocument.class))).thenReturn(List.of());

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> orchestrator.applyComments(input, "whatever"));
        assertEquals(400, ex.getStatusCode().value());
        verify(aiEngineClient, never()).post(anyString(), anyString());
    }

    @Test
    void promptTooLongThrowsBadRequestAndDoesNotCallEngine() throws IOException {
        MockMultipartFile input = pdf("doc.pdf");
        String tooLong = "x".repeat(4001);

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> orchestrator.applyComments(input, tooLong));
        assertEquals(400, ex.getStatusCode().value());
        verify(aiEngineClient, never()).post(anyString(), anyString());
    }

    @Test
    void blankPromptThrowsBadRequestAndDoesNotCallEngine() throws IOException {
        MockMultipartFile input = pdf("doc.pdf");

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> orchestrator.applyComments(input, "   "));
        assertEquals(400, ex.getStatusCode().value());
        verify(aiEngineClient, never()).post(anyString(), anyString());
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

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

    private static List<PDAnnotationText> textAnnotations(List<PDAnnotation> annotations) {
        List<PDAnnotationText> out = new ArrayList<>();
        for (PDAnnotation a : annotations) {
            if (a instanceof PDAnnotationText t) {
                out.add(t);
            }
        }
        return out;
    }
}
