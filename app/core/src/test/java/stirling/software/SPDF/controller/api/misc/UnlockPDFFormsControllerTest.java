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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class UnlockPDFFormsControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private UnlockPDFFormsController controller;

    private FileUpload mockPdfFile;

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
                TestFileUploads.of(
                        new byte[] {0x25, 0x50, 0x44, 0x46}, "test.pdf", "application/pdf");
    }

    @Test
    void unlockPDFForms_withNoAcroForm_returnsResponse() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(document);

        Response response = controller.unlockPDFForms(mockPdfFile, null);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
    }

    @Test
    void unlockPDFForms_withAcroFormNoFields_returnsResponse() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        PDAcroForm acroForm = new PDAcroForm(document);
        document.getDocumentCatalog().setAcroForm(acroForm);
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(document);

        Response response = controller.unlockPDFForms(mockPdfFile, null);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    void unlockPDFForms_withLoadException_returnsNull() throws Exception {
        when(pdfDocumentFactory.load(any(PDFFile.class)))
                .thenThrow(new java.io.IOException("Failed to load"));

        Response response = controller.unlockPDFForms(mockPdfFile, null);

        // Controller catches exceptions and returns null
        assertNull(response);
    }

    @Test
    void unlockPDFForms_responseFilenameContainsUnlockedForms() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(document);

        Response response = controller.unlockPDFForms(mockPdfFile, null);

        assertNotNull(response);
        String contentDisposition = response.getHeaderString("Content-Disposition");
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

        Response response = controller.unlockPDFForms(mockPdfFile, null);

        assertNotNull(response);
        assertTrue(acroForm.getNeedAppearances());
    }
}
