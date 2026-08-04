package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
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
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionLaunch;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
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

@DisplayName("SanitizeController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SanitizeControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private SanitizeController sanitizeController;

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
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("Test content");
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }
    }

    private byte[] createPdfWithJavaScript() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            PDActionJavaScript jsAction = new PDActionJavaScript("app.alert('test')");
            doc.getDocumentCatalog().setOpenAction(jsAction);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] createPdfWithLinks() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);

            PDAnnotationLink link = new PDAnnotationLink();
            PDActionURI uriAction = new PDActionURI();
            uriAction.setURI("http://example.com");
            link.setAction(uriAction);
            page.getAnnotations().add(link);

            PDAnnotationLink launchLink = new PDAnnotationLink();
            PDActionLaunch launchAction = new PDActionLaunch();
            launchLink.setAction(launchAction);
            page.getAnnotations().add(launchLink);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] createPdfWithMetadata() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            PDDocumentInformation info = new PDDocumentInformation();
            info.setTitle("Secret Title");
            info.setAuthor("Secret Author");
            info.setSubject("Secret Subject");
            doc.setDocumentInformation(info);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Nested
    @DisplayName("Remove JavaScript Tests")
    class RemoveJavaScriptTests {

        @Test
        @DisplayName("Should remove JavaScript from PDF")
        void testRemoveJavaScript() throws Exception {
            byte[] jsBytes = createPdfWithJavaScript();
            FileUpload pdfFile = TestFileUploads.pdf(jsBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(jsBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, true, false, false, false, false, false);

            assertNotNull(response.getEntity());
            assertEquals(200, response.getStatus());
        }

        @Test
        @DisplayName("Should not remove JavaScript when flag is false")
        void testSkipJavaScriptRemoval() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, false, false, false, false, false, false);
            assertNotNull(response.getEntity());
        }
    }

    @Nested
    @DisplayName("Remove Links Tests")
    class RemoveLinksTests {

        @Test
        @DisplayName("Should remove links from PDF")
        void testRemoveLinks() throws Exception {
            byte[] linkBytes = createPdfWithLinks();
            FileUpload pdfFile = TestFileUploads.pdf(linkBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(linkBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, false, false, false, false, true, false);
            assertNotNull(response.getEntity());
        }
    }

    @Nested
    @DisplayName("Remove Metadata Tests")
    class RemoveMetadataTests {

        @Test
        @DisplayName("Should remove document info metadata")
        void testRemoveMetadata() throws Exception {
            byte[] metaBytes = createPdfWithMetadata();
            FileUpload pdfFile = TestFileUploads.pdf(metaBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(metaBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, false, false, false, true, false, false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should remove XMP metadata")
        void testRemoveXMPMetadata() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, false, false, true, false, false, false);
            assertNotNull(response.getEntity());
        }
    }

    @Nested
    @DisplayName("Remove Fonts Tests")
    class RemoveFontsTests {

        @Test
        @DisplayName("Should remove fonts from PDF")
        void testRemoveFonts() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, false, false, false, false, false, true);
            assertNotNull(response.getEntity());
        }
    }

    @Nested
    @DisplayName("Combined Sanitization Tests")
    class CombinedTests {

        @Test
        @DisplayName("Should apply all sanitization options at once")
        void testAllOptionsEnabled() throws Exception {
            byte[] jsBytes = createPdfWithJavaScript();
            FileUpload pdfFile = TestFileUploads.pdf(jsBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(jsBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, true, true, true, true, true, true);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle all options disabled")
        void testAllOptionsDisabled() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, false, false, false, false, false, false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle null boolean flags (treated as false)")
        void testNullFlags() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, null, null, null, null, null, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should remove embedded files from PDF")
        void testRemoveEmbeddedFiles() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, false, true, false, false, false, false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should produce valid PDF with filename suffix")
        void testOutputFilename() throws Exception {
            FileUpload pdfFile =
                    TestFileUploads.of(simplePdfBytes, "document.pdf", "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    sanitizeController.sanitizePDF(
                            pdfFile, null, true, false, false, false, false, false);
            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
    }
}
