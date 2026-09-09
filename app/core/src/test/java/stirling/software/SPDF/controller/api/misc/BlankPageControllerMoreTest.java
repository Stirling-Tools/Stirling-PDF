package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.RemoveBlankPagesRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Endpoint-level coverage for {@link BlankPageController#removeBlankPages} using real PDFs so the
 * text/image blank detection and zip-assembly logic actually run.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("BlankPageController removeBlankPages")
class BlankPageControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private BlankPageController controller;

    @BeforeEach
    void setUp() throws Exception {
        controller = new BlankPageController(pdfDocumentFactory, tempFileManager);

        when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("blank_test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        // load(MultipartFile) hands back a freshly loaded document from the upload bytes.
        lenient()
                .when(
                        pdfDocumentFactory.load(
                                any(org.springframework.web.multipart.MultipartFile.class)))
                .thenAnswer(
                        inv -> {
                            org.springframework.web.multipart.MultipartFile mf = inv.getArgument(0);
                            return Loader.loadPDF(mf.getBytes());
                        });

        // createNewDocument() returns a real, empty document the controller fills + saves.
        lenient().when(pdfDocumentFactory.createNewDocument()).thenAnswer(inv -> new PDDocument());
    }

    private static byte[] textPage(String text) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                cs.newLineAtOffset(72, 700);
                cs.showText(text);
                cs.endText();
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] emptyPages(int count) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < count; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                // Empty Resources so image detection has a dict to scan instead of NPE-ing.
                page.setResources(new PDResources());
                doc.addPage(page);
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** A document with one text page and one truly blank page. */
    private static byte[] mixedTextAndBlank() throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PDPage textPage = new PDPage(PDRectangle.A4);
            doc.addPage(textPage);
            try (PDPageContentStream cs = new PDPageContentStream(doc, textPage)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                cs.newLineAtOffset(72, 700);
                cs.showText("Has content");
                cs.endText();
            }
            PDPage blankPage = new PDPage(PDRectangle.A4);
            // Empty Resources so image detection has a dict to scan instead of NPE-ing.
            blankPage.setResources(new PDResources());
            doc.addPage(blankPage);
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** A page that carries a black image so the image-based blank detection branch executes. */
    private static byte[] imagePage(Color color) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            java.awt.image.BufferedImage img =
                    new java.awt.image.BufferedImage(
                            120, 120, java.awt.image.BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D g = img.createGraphics();
            g.setColor(color);
            g.fillRect(0, 0, 120, 120);
            g.dispose();
            PDImageXObject xobj = LosslessFactory.createFromImage(doc, img);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(xobj, 100, 100, 200, 200);
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static RemoveBlankPagesRequest request(byte[] pdf, int threshold, float whitePercent) {
        RemoveBlankPagesRequest req = new RemoveBlankPagesRequest();
        req.setFileInput(new MockMultipartFile("fileInput", "in.pdf", "application/pdf", pdf));
        req.setThreshold(threshold);
        req.setWhitePercent(whitePercent);
        return req;
    }

    private static List<String> zipNames(Resource resource) throws Exception {
        List<String> names = new ArrayList<>();
        try (ZipInputStream zis =
                new ZipInputStream(new ByteArrayInputStream(resource.getContentAsByteArray()))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                names.add(e.getName());
                zis.closeEntry();
            }
        }
        return names;
    }

    @Nested
    @DisplayName("happy paths")
    class HappyPaths {

        @Test
        @DisplayName("all-text document keeps every page in the non-blank PDF only")
        void allTextPages() throws Exception {
            ResponseEntity<Resource> response =
                    controller.removeBlankPages(request(textPage("Hello"), 10, 99.9f));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            List<String> names = zipNames(response.getBody());
            // Only non-blank pages exist, so only the non-blank entry is written.
            assertEquals(1, names.size());
            assertTrue(names.get(0).endsWith("_nonBlankPages.pdf"));
        }

        @Test
        @DisplayName("document with only empty pages produces the all-blank entry")
        void onlyBlankPages() throws Exception {
            ResponseEntity<Resource> response =
                    controller.removeBlankPages(request(emptyPages(2), 10, 99.9f));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<String> names = zipNames(response.getBody());
            assertEquals(1, names.size());
            assertTrue(names.get(0).endsWith("_allBlankPages.pdf"));
        }

        @Test
        @DisplayName("mixed text and blank pages yields both non-blank and blank entries")
        void mixedPages() throws Exception {
            ResponseEntity<Resource> response =
                    controller.removeBlankPages(request(mixedTextAndBlank(), 10, 99.9f));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<String> names = zipNames(response.getBody());
            assertEquals(2, names.size());
            assertTrue(names.stream().anyMatch(n -> n.endsWith("_nonBlankPages.pdf")));
            assertTrue(names.stream().anyMatch(n -> n.endsWith("_blankPages.pdf")));
        }
    }

    @Nested
    @DisplayName("image-based blank detection")
    class ImageDetection {

        @Test
        @DisplayName("page with a black image is treated as non-blank")
        void blackImageIsNonBlank() throws Exception {
            // Black image -> not enough white -> non-blank branch.
            ResponseEntity<Resource> response =
                    controller.removeBlankPages(request(imagePage(Color.BLACK), 10, 99.9f));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<String> names = zipNames(response.getBody());
            assertTrue(names.get(0).endsWith("_nonBlankPages.pdf"));
        }

        @Test
        @DisplayName("page with a white image counts as blank")
        void whiteImageIsBlank() throws Exception {
            // White image with a high white-percent threshold -> blank branch.
            ResponseEntity<Resource> response =
                    controller.removeBlankPages(request(imagePage(Color.WHITE), 10, 50.0f));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<String> names = zipNames(response.getBody());
            assertEquals(1, names.size());
            assertTrue(names.get(0).endsWith("_allBlankPages.pdf"));
        }

        @Test
        @DisplayName("uses configured maxDPI when application properties bean is present")
        void usesConfiguredMaxDpi() throws Exception {
            ApplicationProperties props = new ApplicationProperties();
            props.getSystem().setMaxDPI(40);
            try (var mocked = org.mockito.Mockito.mockStatic(ApplicationContextProvider.class)) {
                mocked.when(() -> ApplicationContextProvider.getBean(ApplicationProperties.class))
                        .thenReturn(props);

                ResponseEntity<Resource> response =
                        controller.removeBlankPages(request(imagePage(Color.BLACK), 10, 99.9f));

                assertEquals(HttpStatus.OK, response.getStatusCode());
            }
        }
    }

    @Nested
    @DisplayName("error handling")
    class Errors {

        @Test
        @DisplayName("loader IOException is caught and returned as a 500 response")
        void corruptPdfReturnsServerError() throws Exception {
            RemoveBlankPagesRequest req = request("garbage".getBytes(), 10, 99.9f);
            when(pdfDocumentFactory.load(
                            any(org.springframework.web.multipart.MultipartFile.class)))
                    .thenThrow(new IOException("bad pdf"));

            // The controller swallows IOException from the loader and maps it to HTTP 500.
            ResponseEntity<Resource> response = controller.removeBlankPages(req);
            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        }
    }

    @Test
    @DisplayName("createZipEntry writes a loadable PDF with the supplied pages")
    void createZipEntryWritesPages() throws Exception {
        try (PDDocument src = new PDDocument()) {
            src.addPage(new PDPage(PDRectangle.A4));
            src.addPage(new PDPage(PDRectangle.A4));
            List<PDPage> pages = new ArrayList<>();
            src.getPages().forEach(pages::add);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(baos)) {
                controller.createZipEntry(zos, pages, "entry.pdf");
            }

            try (ZipInputStream zis =
                    new ZipInputStream(new ByteArrayInputStream(baos.toByteArray()))) {
                ZipEntry entry = zis.getNextEntry();
                assertEquals("entry.pdf", entry.getName());
                try (PDDocument loaded = Loader.loadPDF(zis.readAllBytes())) {
                    assertEquals(2, loaded.getNumberOfPages());
                }
            }
        }
    }
}
