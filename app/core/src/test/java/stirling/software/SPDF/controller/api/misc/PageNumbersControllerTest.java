package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.AddPageNumbersRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("PageNumbersController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PageNumbersControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private PageNumbersController pageNumbersController;

    private byte[] multiPagePdf;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 4; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            multiPagePdf = baos.toByteArray();
        }
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (java.io.InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Test
    @DisplayName("Adds page numbers and preserves page count + MediaBox (oracle)")
    void testAddPageNumbers_Oracle() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", MediaType.APPLICATION_PDF_VALUE, multiPagePdf);

        AddPageNumbersRequest request = new AddPageNumbersRequest();
        request.setFileInput(pdfFile);
        request.setCustomMargin("medium");
        request.setPosition(8);
        request.setStartingNumber(1);
        request.setPagesToNumber("all");
        request.setCustomText("{n}");
        request.setFontSize(12);
        request.setFontType("helvetica");
        request.setFontColor("#000000");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(multiPagePdf));

        ResponseEntity<Resource> response = pageNumbersController.addPageNumbers(request);
        byte[] outBytes = drainBody(response);
        assertTrue(outBytes.length > 0, "output non-empty");

        try (PDDocument out = Loader.loadPDF(outBytes)) {
            assertEquals(4, out.getNumberOfPages(), "page count unchanged");
            for (int i = 0; i < out.getNumberOfPages(); i++) {
                PDPage p = out.getPage(i);
                assertEquals(
                        PDRectangle.A4.getWidth(),
                        p.getMediaBox().getWidth(),
                        0.01f,
                        "MediaBox width preserved");
                assertTrue(p.getContentStreams().hasNext(), "page has content streams");
            }
        }
    }
}
