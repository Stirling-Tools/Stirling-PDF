package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class UnlockPDFFormsControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private UnlockPDFFormsController controller;

    private MockMultipartFile mockPdfFile;

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
        controller = new UnlockPDFFormsController(pdfDocumentFactory, tempFileManager);
        mockPdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        "application/pdf",
                        new byte[] {0x25, 0x50, 0x44, 0x46});
    }

    @Test
    void unlockPDFForms_withNoAcroForm_returnsResponse() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(document);

        PDFFile file = new PDFFile();
        file.setFileInput(mockPdfFile);

        ResponseEntity<StreamingResponseBody> response = controller.unlockPDFForms(file);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
    }

    @Test
    void unlockPDFForms_withAcroFormNoFields_returnsResponse() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        PDAcroForm acroForm = new PDAcroForm(document);
        document.getDocumentCatalog().setAcroForm(acroForm);
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(document);

        PDFFile file = new PDFFile();
        file.setFileInput(mockPdfFile);

        ResponseEntity<StreamingResponseBody> response = controller.unlockPDFForms(file);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void unlockPDFForms_withLoadException_returnsNull() throws Exception {
        when(pdfDocumentFactory.load(any(PDFFile.class)))
                .thenThrow(new java.io.IOException("Failed to load"));

        PDFFile file = new PDFFile();
        file.setFileInput(mockPdfFile);

        ResponseEntity<StreamingResponseBody> response = controller.unlockPDFForms(file);

        // Controller catches exceptions and returns null
        assertNull(response);
    }

    @Test
    void unlockPDFForms_responseFilenameContainsUnlockedForms() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(document);

        PDFFile file = new PDFFile();
        file.setFileInput(mockPdfFile);

        ResponseEntity<StreamingResponseBody> response = controller.unlockPDFForms(file);

        assertNotNull(response);
        String contentDisposition = response.getHeaders().getFirst("Content-Disposition");
        assertNotNull(contentDisposition);
        assertTrue(contentDisposition.contains("unlocked_forms"));
    }

    @Test
    void unlockPDFForms_withAcroForm_setsNeedAppearances() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        PDAcroForm acroForm = new PDAcroForm(document);
        document.getDocumentCatalog().setAcroForm(acroForm);
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(document);

        PDFFile file = new PDFFile();
        file.setFileInput(mockPdfFile);

        ResponseEntity<StreamingResponseBody> response = controller.unlockPDFForms(file);

        assertNotNull(response);
        assertTrue(acroForm.getNeedAppearances());
    }
}
