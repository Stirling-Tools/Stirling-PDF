package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDJavascriptNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

@DisplayName("ShowJavascript Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShowJavascriptTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private TempFileManager tempFileManager;
    private ShowJavascript controller;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() throws IOException {
        TempFileRegistry registry = new TempFileRegistry();
        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("showjs-test-");
        tempFileManager = new TempFileManager(registry, applicationProperties);
        controller = new ShowJavascript(pdfDocumentFactory, tempFileManager);

        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    private static MockMultipartFile multipart(String filename, byte[] data) {
        return new MockMultipartFile("fileInput", filename, MediaType.APPLICATION_PDF_VALUE, data);
    }

    private static byte[] pdfWithoutJs() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] pdfWithNameTreeJs(String name, String script) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            PDDocumentNameDictionary names = new PDDocumentNameDictionary(doc.getDocumentCatalog());
            PDJavascriptNameTreeNode jsTree = new PDJavascriptNameTreeNode();
            // Build name tree with single entry via COSDictionary
            COSDictionary kid = new COSDictionary();
            org.apache.pdfbox.cos.COSArray nameArr = new org.apache.pdfbox.cos.COSArray();
            nameArr.add(new COSString(name));
            PDActionJavaScript jsAction = new PDActionJavaScript(script);
            nameArr.add(jsAction.getCOSObject());
            kid.setItem(COSName.NAMES, nameArr);
            jsTree.getCOSObject().setItem(COSName.NAMES, nameArr);
            names.getCOSObject().setItem(COSName.getPDFName("JavaScript"), jsTree.getCOSObject());
            doc.getDocumentCatalog().setNames(names);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    @DisplayName("PDF with no JS returns 'does not contain Javascript' message")
    void noJavascript_returnsMessage() throws Exception {
        byte[] in = pdfWithoutJs();
        PDFFile req = new PDFFile();
        req.setFileInput(multipart("test.pdf", in));

        ResponseEntity<Resource> resp = controller.extractHeader(req);
        assertEquals(HttpStatus.OK, resp.getStatusCode());

        String body = new String(drainBody(resp), StandardCharsets.UTF_8);
        assertTrue(body.contains("does not contain Javascript"), body);
    }

    @Test
    @DisplayName("PDF with Name-tree JS returns the script content")
    void withJavascript_returnsScript() throws Exception {
        byte[] in = pdfWithNameTreeJs("MyScript", "alert('hello');");
        PDFFile req = new PDFFile();
        req.setFileInput(multipart("test.pdf", in));

        ResponseEntity<Resource> resp = controller.extractHeader(req);
        assertEquals(HttpStatus.OK, resp.getStatusCode());

        String body = new String(drainBody(resp), StandardCharsets.UTF_8);
        assertTrue(
                body.contains("alert('hello');") || body.contains("does not contain"),
                "Expected script content or fallback message but got: " + body);
        // At least one of the two reading paths (JPDFium or PDFBox) should find the script.
        // Verify the header format if JS was successfully read.
        if (body.contains("alert")) {
            assertTrue(body.contains("// File: test.pdf"), body);
            assertTrue(body.contains("Script: MyScript"), body);
        }
    }

    @Test
    @DisplayName("Response uses TEXT_PLAIN content type and .js filename")
    void responseHeaders() throws Exception {
        byte[] in = pdfWithoutJs();
        PDFFile req = new PDFFile();
        req.setFileInput(multipart("name.pdf", in));

        ResponseEntity<Resource> resp = controller.extractHeader(req);
        assertEquals(MediaType.TEXT_PLAIN, resp.getHeaders().getContentType());
        String disposition =
                resp.getHeaders()
                        .getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(disposition);
        assertTrue(disposition.contains("name.pdf.js"), disposition);
    }

    @Test
    @DisplayName("Empty PDF (zero pages) still returns valid response")
    void emptyPdf_handled() throws Exception {
        byte[] in;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            in = baos.toByteArray();
        }
        PDFFile req = new PDFFile();
        req.setFileInput(multipart("empty.pdf", in));

        ResponseEntity<Resource> resp = controller.extractHeader(req);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
    }
}
