package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
@DisplayName("RemoveImagesController")
class RemoveImagesControllerTest {

    @TempDir Path tempDir;

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;
    private RemoveImagesController controller;

    // Holds the temp file backing the most recent createManagedTempFile call so tests can
    // re-load the actually-saved (image-stripped) document from disk and assert on it.
    private final List<File> savedTempFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        pdfDocumentFactory = mock(CustomPDFDocumentFactory.class);
        tempFileManager = mock(TempFileManager.class);
        controller = new RemoveImagesController(pdfDocumentFactory, tempFileManager);
        savedTempFiles.clear();

        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(tempDir, "out", inv.<String>getArgument(0))
                                            .toFile();
                            savedTempFiles.add(f);
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    // ----- helpers -------------------------------------------------------------------------

    private MockMultipartFile multipart(String name, byte[] bytes) {
        return new MockMultipartFile("fileInput", name, MediaType.APPLICATION_PDF_VALUE, bytes);
    }

    private PDFFile request(MockMultipartFile file) {
        PDFFile req = new PDFFile();
        req.setFileInput(file);
        return req;
    }

    /** A drawable RGB image with no useful content, kept tiny for speed. */
    private BufferedImage tinyImage() {
        return new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
    }

    /** PDF with {@code pageCount} pages, each with one drawn JPEG image. */
    private byte[] pdfWithImagesBytes(int pageCount) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                PDImageXObject image = JPEGFactory.createFromImage(doc, tinyImage());
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(image, 50, 600, 50, 50);
                }
            }
            return saveToBytes(doc);
        }
    }

    /** PDF with one page that has no images at all (just resources without XObjects). */
    private byte[] pdfWithoutImagesBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            // Touch the page resources so they are non-null but contain no XObject dictionary.
            page.setResources(new PDResources());
            return saveToBytes(doc);
        }
    }

    /** PDF whose single page has a resources dictionary with an image nested in a form XObject. */
    private byte[] pdfWithImageInsideFormBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);

            PDImageXObject image = JPEGFactory.createFromImage(doc, tinyImage());

            PDFormXObject form = new PDFormXObject(doc);
            form.setBBox(new PDRectangle(100, 100));
            PDResources formResources = new PDResources();
            formResources.add(image);
            form.setResources(formResources);

            PDResources pageResources = new PDResources();
            pageResources.add(form);
            page.setResources(pageResources);

            return saveToBytes(doc);
        }
    }

    private byte[] saveToBytes(PDDocument doc) throws IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }

    /** Counts every PDImageXObject reachable through page + nested form resources. */
    private int countImagesInSavedOutput() throws IOException {
        assertFalse(savedTempFiles.isEmpty(), "expected the controller to create a temp file");
        File out = savedTempFiles.get(savedTempFiles.size() - 1);
        try (PDDocument doc = Loader.loadPDF(out)) {
            int count = 0;
            for (PDPage page : doc.getPages()) {
                count += countImagesInResources(page.getResources());
            }
            return count;
        }
    }

    private int countImagesInResources(PDResources resources) throws IOException {
        if (resources == null || resources.getXObjectNames() == null) {
            return 0;
        }
        int count = 0;
        for (COSName name : resources.getXObjectNames()) {
            PDXObject xObject = resources.getXObject(name);
            if (xObject instanceof PDImageXObject) {
                count++;
            } else if (xObject instanceof PDFormXObject form) {
                count += countImagesInResources(form.getResources());
            }
        }
        return count;
    }

    // ----- happy paths ---------------------------------------------------------------------

    @Nested
    @DisplayName("removeImages happy path")
    class HappyPath {

        @Test
        @DisplayName("returns OK and strips the image from a single-page PDF")
        void singlePageWithImage() throws IOException {
            byte[] bytes = pdfWithImagesBytes(1);
            MockMultipartFile file = multipart("doc.pdf", bytes);
            PDFFile req = request(file);

            PDDocument loaded = Loader.loadPDF(bytes);
            when(pdfDocumentFactory.load(req)).thenReturn(loaded);

            // sanity: the input genuinely had one image to remove
            assertEquals(1, countImagesInResources(loaded.getPage(0).getResources()));

            ResponseEntity<Resource> response;
            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());
                response = controller.removeImages(req);
            }

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(0, countImagesInSavedOutput(), "all images should have been removed");
        }

        @Test
        @DisplayName("strips images across every page of a multi-page PDF")
        void multiPageWithImages() throws IOException {
            byte[] bytes = pdfWithImagesBytes(3);
            MockMultipartFile file = multipart("multi.pdf", bytes);
            PDFFile req = request(file);

            PDDocument loaded = Loader.loadPDF(bytes);
            assertEquals(3, loaded.getNumberOfPages());
            when(pdfDocumentFactory.load(req)).thenReturn(loaded);

            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());
                ResponseEntity<Resource> response = controller.removeImages(req);
                assertEquals(HttpStatus.OK, response.getStatusCode());
            }

            assertEquals(0, countImagesInSavedOutput());
            // page count must be preserved
            File out = savedTempFiles.get(savedTempFiles.size() - 1);
            try (PDDocument result = Loader.loadPDF(out)) {
                assertEquals(3, result.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("removes an image nested inside a form XObject")
        void imageNestedInsideForm() throws IOException {
            byte[] bytes = pdfWithImageInsideFormBytes();
            MockMultipartFile file = multipart("nested.pdf", bytes);
            PDFFile req = request(file);

            PDDocument loaded = Loader.loadPDF(bytes);
            when(pdfDocumentFactory.load(req)).thenReturn(loaded);

            // sanity: the nested image is present before removal
            assertEquals(1, countImagesInResources(loaded.getPage(0).getResources()));

            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());
                controller.removeImages(req);
            }

            assertEquals(0, countImagesInSavedOutput(), "nested form image should be removed");
        }
    }

    // ----- edge cases ----------------------------------------------------------------------

    @Nested
    @DisplayName("removeImages edge cases")
    class EdgeCases {

        @Test
        @DisplayName("returns OK when the PDF has no images")
        void noImages() throws IOException {
            byte[] bytes = pdfWithoutImagesBytes();
            MockMultipartFile file = multipart("plain.pdf", bytes);
            PDFFile req = request(file);

            PDDocument loaded = Loader.loadPDF(bytes);
            when(pdfDocumentFactory.load(req)).thenReturn(loaded);

            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());
                ResponseEntity<Resource> response = controller.removeImages(req);
                assertEquals(HttpStatus.OK, response.getStatusCode());
            }

            assertEquals(0, countImagesInSavedOutput());
        }

        @Test
        @DisplayName("handles a page that has no resources dictionary")
        void pageWithoutResources() throws IOException {
            // A bare PDPage built without content has null resources.
            byte[] bytes;
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.LETTER));
                bytes = saveToBytes(doc);
            }
            MockMultipartFile file = multipart("bare.pdf", bytes);
            PDFFile req = request(file);

            PDDocument loaded = Loader.loadPDF(bytes);
            when(pdfDocumentFactory.load(req)).thenReturn(loaded);

            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());
                ResponseEntity<Resource> response = controller.removeImages(req);
                assertEquals(HttpStatus.OK, response.getStatusCode());
            }

            assertEquals(0, countImagesInSavedOutput());
        }

        @Test
        @DisplayName("creates exactly one managed temp file and saves into it")
        void savesIntoManagedTempFile() throws IOException {
            byte[] bytes = pdfWithImagesBytes(1);
            MockMultipartFile file = multipart("doc.pdf", bytes);
            PDFFile req = request(file);

            when(pdfDocumentFactory.load(req)).thenReturn(Loader.loadPDF(bytes));

            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());
                controller.removeImages(req);
            }

            assertEquals(1, savedTempFiles.size());
            File out = savedTempFiles.get(0);
            assertTrue(out.exists());
            assertTrue(out.length() > 0, "saved PDF must be non-empty");
        }
    }

    // ----- filename / interaction ----------------------------------------------------------

    @Nested
    @DisplayName("filename handling")
    class Filenames {

        @Test
        @DisplayName("appends _images_removed.pdf suffix to the original name")
        void appendsSuffix() throws IOException {
            byte[] bytes = pdfWithImagesBytes(1);
            MockMultipartFile file = multipart("report.pdf", bytes);
            PDFFile req = request(file);

            when(pdfDocumentFactory.load(req)).thenReturn(Loader.loadPDF(bytes));

            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());

                controller.removeImages(req);

                web.verify(
                        () ->
                                WebResponseUtils.pdfFileToWebResponse(
                                        any(TempFile.class),
                                        org.mockito.ArgumentMatchers.eq(
                                                "report_images_removed.pdf")));
            }
        }

        @Test
        @DisplayName("derives a default name when the original filename is null")
        void nullOriginalFilename() throws IOException {
            byte[] bytes = pdfWithImagesBytes(1);
            // MockMultipartFile with a null original filename
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", null, MediaType.APPLICATION_PDF_VALUE, bytes);
            PDFFile req = request(file);

            when(pdfDocumentFactory.load(req)).thenReturn(Loader.loadPDF(bytes));

            try (MockedStatic<WebResponseUtils> web = mockStatic(WebResponseUtils.class)) {
                web.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(okResponse());

                ResponseEntity<Resource> response = controller.removeImages(req);
                assertEquals(HttpStatus.OK, response.getStatusCode());

                // GeneralUtils.generateFilename handles null safely; just assert it was called
                web.verify(
                        () ->
                                WebResponseUtils.pdfFileToWebResponse(
                                        any(TempFile.class), anyString()));
            }
        }
    }

    // ----- error branches ------------------------------------------------------------------

    @Nested
    @DisplayName("error handling")
    class Errors {

        @Test
        @DisplayName("propagates an IOException when loading the PDF fails")
        void loadFailureThrowsIOException() throws IOException {
            MockMultipartFile file = multipart("broken.pdf", "not a pdf".getBytes());
            PDFFile req = request(file);

            when(pdfDocumentFactory.load(req)).thenThrow(new IOException("corrupt"));

            assertThrows(IOException.class, () -> controller.removeImages(req));
        }
    }

    private static ResponseEntity<Resource> okResponse() {
        return ResponseEntity.ok(new ByteArrayResource("ok".getBytes()));
    }
}
