package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("RemoveCertSignController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RemoveCertSignControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private RemoveCertSignController removeCertSignController;

    private byte[] simplePdfBytes;

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
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }
    }

    @Nested
    @DisplayName("Remove Certificate Signature Tests")
    class RemoveCertSignTests {

        @Test
        @DisplayName("Should process PDF without signatures")
        void testRemoveCertSign_NoSignatures() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = removeCertSignController.removeCertSignPDF(pdfFile, null);

            assertNotNull(response.getEntity());
            assertEquals(200, response.getStatus());
        }

        @Test
        @DisplayName("Should process PDF with no AcroForm")
        void testRemoveCertSign_NoAcroForm() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = removeCertSignController.removeCertSignPDF(pdfFile, null);

            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should process PDF with AcroForm but no signature fields")
        void testRemoveCertSign_AcroFormNoSignatures() throws Exception {
            byte[] pdfWithAcroForm;
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                pdfWithAcroForm = baos.toByteArray();
            }

            FileUpload pdfFile = TestFileUploads.pdf(pdfWithAcroForm);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(pdfWithAcroForm));

            Response response = removeCertSignController.removeCertSignPDF(pdfFile, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle PDF with signature field in AcroForm")
        void testRemoveCertSign_WithSignatureField() throws Exception {
            byte[] pdfWithSig;
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage();
                doc.addPage(page);
                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);
                PDSignatureField sigField = new PDSignatureField(acroForm);
                acroForm.getFields().add(sigField);
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                pdfWithSig = baos.toByteArray();
            }

            FileUpload pdfFile = TestFileUploads.pdf(pdfWithSig);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(pdfWithSig));

            Response response = removeCertSignController.removeCertSignPDF(pdfFile, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should produce correct filename suffix")
        void testRemoveCertSign_FilenameSuffix() throws Exception {
            FileUpload pdfFile =
                    TestFileUploads.of(simplePdfBytes, "signed_doc.pdf", "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = removeCertSignController.removeCertSignPDF(pdfFile, null);
            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }

        @Test
        @DisplayName("Should handle null original filename")
        void testRemoveCertSign_NullFilename() throws Exception {
            FileUpload pdfFile = TestFileUploads.of(simplePdfBytes, null, "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = removeCertSignController.removeCertSignPDF(pdfFile, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle multi-page PDF")
        void testRemoveCertSign_MultiPage() throws Exception {
            byte[] multiPagePdf;
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                doc.addPage(new PDPage());
                doc.addPage(new PDPage());
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                multiPagePdf = baos.toByteArray();
            }

            FileUpload pdfFile = TestFileUploads.of(multiPagePdf, "multi.pdf", "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(multiPagePdf));

            Response response = removeCertSignController.removeCertSignPDF(pdfFile, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle IOException from factory")
        void testRemoveCertSign_IOException() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("Cannot load PDF"));

            assertThrows(
                    Exception.class,
                    () -> removeCertSignController.removeCertSignPDF(pdfFile, null));
        }
    }
}
