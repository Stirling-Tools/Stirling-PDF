package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfAnnotationService;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.PdfTextLocator;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class AddCommentsControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private PdfAnnotationService pdfAnnotationService;
    private PdfTextLocator pdfTextLocator;
    private ObjectMapper objectMapper;
    private AddCommentsController controller;

    @BeforeEach
    void setUp() throws Exception {
        pdfAnnotationService = new PdfAnnotationService();
        pdfTextLocator = new PdfTextLocator();
        objectMapper = JsonMapper.builder().build();
        controller =
                new AddCommentsController(
                        pdfDocumentFactory,
                        tempFileManager,
                        pdfAnnotationService,
                        pdfTextLocator,
                        objectMapper);

        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File file =
                                    Files.createTempFile(tempDir, "addcomments", ".pdf").toFile();
                            TempFile tf = org.mockito.Mockito.mock(TempFile.class);
                            lenient().when(tf.getPath()).thenReturn(file.toPath());
                            lenient().when(tf.getFile()).thenReturn(file);
                            return tf;
                        });
    }

    @Test
    void appliesEachCommentSpecAsStickyNote() throws Exception {
        byte[] bytes = twoPagePdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        String comments =
                """
                [{"pageIndex":0,"x":72,"y":700,"width":20,"height":20,"text":"First","author":"me","subject":"S1"},
                 {"pageIndex":1,"x":100,"y":650,"width":20,"height":20,"text":"Second"}]
                """;

        Response response = controller.addComments(file, comments);

        assertThat(response.getStatus()).isEqualTo(200);
        byte[] result = drainBody(response);
        try (PDDocument reloaded = Loader.loadPDF(result)) {
            List<PDAnnotationText> p0 = textAnnotations(reloaded.getPage(0).getAnnotations());
            List<PDAnnotationText> p1 = textAnnotations(reloaded.getPage(1).getAnnotations());
            assertThat(p0).hasSize(1);
            assertThat(p1).hasSize(1);
            assertThat(p0.get(0).getContents()).isEqualTo("First");
            assertThat(p1.get(0).getContents()).isEqualTo("Second");
        }
    }

    @Test
    void anchorsStickyNoteAtLocatedTextWhenAnchorTextMatches() throws Exception {
        byte[] pdfBytes = singlePagePdfWithLine("Revenue: $215,000");
        FileUpload file = TestFileUploads.pdf(pdfBytes);
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));

        // Fallback coords deliberately far from the line so we can tell which path ran.
        String comments =
                """
                [{"pageIndex":0,"x":10,"y":10,"width":5,"height":5,
                  "text":"Check this total","author":"tester","subject":"S",
                  "anchorText":"215000"}]
                """;

        Response response = controller.addComments(file, comments);

        assertThat(response.getStatus()).isEqualTo(200);
        try (PDDocument reloaded = Loader.loadPDF(drainBody(response))) {
            List<PDAnnotationText> notes = textAnnotations(reloaded.getPage(0).getAnnotations());
            assertThat(notes).hasSize(1);
            PDRectangle rect = notes.get(0).getRectangle();
            // Line was drawn at user-space y=720 with font size 12; icon should land in that band,
            // not at the fallback y=10. Width/height fixed to 20 by the anchor path.
            assertThat(rect.getWidth()).isEqualTo(20f);
            assertThat(rect.getHeight()).isEqualTo(20f);
            assertThat(rect.getLowerLeftY()).isBetween(700f, 740f);
            assertThat(rect.getLowerLeftX()).isGreaterThan(50f);
        }
    }

    @Test
    void fallsBackToAbsoluteCoordsWhenAnchorTextMisses() throws Exception {
        byte[] pdfBytes = singlePagePdfWithLine("Revenue: $215,000");
        FileUpload file = TestFileUploads.pdf(pdfBytes);
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));

        String comments =
                """
                [{"pageIndex":0,"x":55,"y":33,"width":7,"height":9,
                  "text":"No match","anchorText":"not-on-this-page"}]
                """;

        Response response = controller.addComments(file, comments);

        try (PDDocument reloaded = Loader.loadPDF(drainBody(response))) {
            List<PDAnnotationText> notes = textAnnotations(reloaded.getPage(0).getAnnotations());
            assertThat(notes).hasSize(1);
            PDRectangle rect = notes.get(0).getRectangle();
            assertThat(rect.getLowerLeftX()).isEqualTo(55f);
            assertThat(rect.getLowerLeftY()).isEqualTo(33f);
            assertThat(rect.getWidth()).isEqualTo(7f);
            assertThat(rect.getHeight()).isEqualTo(9f);
        }
    }

    @Test
    void rejectsBlankCommentsJson() {
        FileUpload file = TestFileUploads.pdf(new byte[] {1, 2, 3});

        assertThatThrownBy(() -> controller.addComments(file, ""))
                .isInstanceOf(WebApplicationException.class)
                .extracting(e -> ((WebApplicationException) e).getResponse().getStatus())
                .isEqualTo(Response.Status.BAD_REQUEST.getStatusCode());
    }

    @Test
    void rejectsInvalidJson() {
        FileUpload file = TestFileUploads.pdf(new byte[] {1, 2, 3});

        assertThatThrownBy(() -> controller.addComments(file, "not-json"))
                .isInstanceOf(WebApplicationException.class)
                .extracting(e -> ((WebApplicationException) e).getResponse().getStatus())
                .isEqualTo(Response.Status.BAD_REQUEST.getStatusCode());
    }

    @Test
    void rejectsMissingFileInput() {
        assertThatThrownBy(() -> controller.addComments(null, "[]"))
                .isInstanceOf(WebApplicationException.class)
                .extracting(e -> ((WebApplicationException) e).getResponse().getStatus())
                .isEqualTo(Response.Status.BAD_REQUEST.getStatusCode());
    }

    @Test
    void returnsSuccessForEmptyCommentsArray() throws Exception {
        // An empty JSON array is a valid payload — nothing to annotate, but the caller
        // should still get back the input PDF without any error so pipelines that
        // produce zero comments don't have to special-case the empty result.
        byte[] bytes = twoPagePdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.addComments(file, "[]");

        assertThat(response.getStatus()).isEqualTo(200);
        try (PDDocument reloaded = Loader.loadPDF(drainBody(response))) {
            assertThat(textAnnotations(reloaded.getPage(0).getAnnotations())).isEmpty();
            assertThat(textAnnotations(reloaded.getPage(1).getAnnotations())).isEmpty();
        }
    }

    // --- helpers ---

    private static byte[] twoPagePdfBytes() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] singlePagePdfWithLine(String line) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.setNonStrokingColor(Color.BLACK);
                cs.beginText();
                cs.newLineAtOffset(72f, 720f);
                cs.showText(line);
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] drainBody(Response response) throws java.io.IOException {
        Object entity = response.getEntity();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if (entity instanceof byte[] bytes) {
            baos.write(bytes);
        } else if (entity instanceof jakarta.ws.rs.core.StreamingOutput streaming) {
            streaming.write(baos);
        } else {
            throw new IllegalStateException(
                    "Unexpected response entity type: "
                            + (entity == null ? "null" : entity.getClass().getName()));
        }
        return baos.toByteArray();
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
