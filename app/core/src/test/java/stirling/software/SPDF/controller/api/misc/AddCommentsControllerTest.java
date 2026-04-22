package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.model.api.misc.AddCommentsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfAnnotationService;
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
    private ObjectMapper objectMapper;
    private AddCommentsController controller;

    @BeforeEach
    void setUp() throws Exception {
        pdfAnnotationService = new PdfAnnotationService();
        objectMapper = JsonMapper.builder().build();
        controller =
                new AddCommentsController(
                        pdfDocumentFactory, tempFileManager, pdfAnnotationService, objectMapper);

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
        MockMultipartFile file = pdf("doc.pdf", twoPagePdfBytes());
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(file.getBytes()));

        AddCommentsRequest request = new AddCommentsRequest();
        request.setFileInput(file);
        request.setComments(
                """
                [{"pageIndex":0,"x":72,"y":700,"width":20,"height":20,"text":"First","author":"me","subject":"S1"},
                 {"pageIndex":1,"x":100,"y":650,"width":20,"height":20,"text":"Second"}]
                """);

        ResponseEntity<StreamingResponseBody> response = controller.addComments(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
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
    void rejectsBlankCommentsJson() {
        AddCommentsRequest request = new AddCommentsRequest();
        request.setFileInput(pdf("doc.pdf", new byte[] {1, 2, 3}));
        request.setComments("");

        assertThatThrownBy(() -> controller.addComments(request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void rejectsInvalidJson() {
        AddCommentsRequest request = new AddCommentsRequest();
        request.setFileInput(pdf("doc.pdf", new byte[] {1, 2, 3}));
        request.setComments("not-json");

        assertThatThrownBy(() -> controller.addComments(request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void rejectsMissingFileInput() {
        AddCommentsRequest request = new AddCommentsRequest();
        request.setComments("[]");

        assertThatThrownBy(() -> controller.addComments(request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // --- helpers ---

    private static MockMultipartFile pdf(String name, byte[] bytes) {
        return new MockMultipartFile("fileInput", name, MediaType.APPLICATION_PDF_VALUE, bytes);
    }

    private static byte[] twoPagePdfBytes() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        response.getBody().writeTo(baos);
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
