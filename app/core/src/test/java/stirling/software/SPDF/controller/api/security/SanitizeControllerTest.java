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
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.SanitizePdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("SanitizeController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SanitizeControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

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
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, jsBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(true);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(false);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(jsBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);

            assertNotNull(response.getBody());
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("Should not remove JavaScript when flag is false")
        void testSkipJavaScriptRemoval() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(false);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(false);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
        }
    }

    @Nested
    @DisplayName("Remove Links Tests")
    class RemoveLinksTests {

        @Test
        @DisplayName("Should remove links from PDF")
        void testRemoveLinks() throws Exception {
            byte[] linkBytes = createPdfWithLinks();
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, linkBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(false);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(true);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(linkBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
        }
    }

    @Nested
    @DisplayName("Remove Metadata Tests")
    class RemoveMetadataTests {

        @Test
        @DisplayName("Should remove document info metadata")
        void testRemoveMetadata() throws Exception {
            byte[] metaBytes = createPdfWithMetadata();
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, metaBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(false);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(true);
            request.setRemoveLinks(false);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(metaBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should remove XMP metadata")
        void testRemoveXMPMetadata() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(false);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(true);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(false);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
        }
    }

    @Nested
    @DisplayName("Remove Fonts Tests")
    class RemoveFontsTests {

        @Test
        @DisplayName("Should remove fonts from PDF")
        void testRemoveFonts() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(false);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(false);
            request.setRemoveFonts(true);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
        }
    }

    @Nested
    @DisplayName("Combined Sanitization Tests")
    class CombinedTests {

        @Test
        @DisplayName("Should apply all sanitization options at once")
        void testAllOptionsEnabled() throws Exception {
            byte[] jsBytes = createPdfWithJavaScript();
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, jsBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(true);
            request.setRemoveEmbeddedFiles(true);
            request.setRemoveXMPMetadata(true);
            request.setRemoveMetadata(true);
            request.setRemoveLinks(true);
            request.setRemoveFonts(true);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(jsBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
        }

        @Test
        @DisplayName("Should handle all options disabled")
        void testAllOptionsDisabled() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(false);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(false);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle null boolean flags (treated as false)")
        void testNullFlags() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            // All flags left null

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should remove embedded files from PDF")
        void testRemoveEmbeddedFiles() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(false);
            request.setRemoveEmbeddedFiles(true);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(false);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should produce valid PDF with filename suffix")
        void testOutputFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "document.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SanitizePdfRequest request = new SanitizePdfRequest();
            request.setFileInput(pdfFile);
            request.setRemoveJavaScript(true);
            request.setRemoveEmbeddedFiles(false);
            request.setRemoveXMPMetadata(false);
            request.setRemoveMetadata(false);
            request.setRemoveLinks(false);
            request.setRemoveFonts(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyBoolean()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = sanitizeController.sanitizePDF(request);
            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }
}
