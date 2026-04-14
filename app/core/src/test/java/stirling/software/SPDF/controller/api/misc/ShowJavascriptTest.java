package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDJavascriptNameTreeNode;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ShowJavascriptTest {
    private static ResponseEntity<StreamingResponseBody> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(out -> out.write(bytes));
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        response.getBody().writeTo(baos);
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private ShowJavascript showJavascript;

    private MockMultipartFile pdfFile;
    private PDFFile request;

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
        pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content".getBytes());
        request = new PDFFile();
        request.setFileInput(pdfFile);
    }

    @Test
    void extractHeader_noJavascript_returnsMessage() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        when(mockDoc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getNames()).thenReturn(null);
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<StreamingResponseBody> expectedResponse =
                    streamingOk("no js".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.fileToWebResponse(
                                            any(TempFile.class),
                                            eq("test.pdf.js"),
                                            eq(MediaType.TEXT_PLAIN)))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = showJavascript.extractHeader(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            mockedWebResponse.verify(
                    () ->
                            WebResponseUtils.fileToWebResponse(
                                    any(TempFile.class),
                                    eq("test.pdf.js"),
                                    eq(MediaType.TEXT_PLAIN)));
        }
    }

    @Test
    void extractHeader_withJavascript_returnsScript() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        PDDocumentNameDictionary nameDict = mock(PDDocumentNameDictionary.class);
        PDJavascriptNameTreeNode jsTree = mock(PDJavascriptNameTreeNode.class);

        PDActionJavaScript jsAction = mock(PDActionJavaScript.class);
        when(jsAction.getAction()).thenReturn("alert('hello');");

        when(mockDoc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getNames()).thenReturn(nameDict);
        doReturn(jsTree).when(nameDict).getJavaScript();
        java.util.Map<String, PDActionJavaScript> jsMap = java.util.Map.of("Script1", jsAction);
        when(jsTree.getNames()).thenReturn(jsMap);
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<StreamingResponseBody> expectedResponse =
                    streamingOk("js content".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.fileToWebResponse(
                                            any(TempFile.class),
                                            eq("test.pdf.js"),
                                            eq(MediaType.TEXT_PLAIN)))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = showJavascript.extractHeader(request);

            assertNotNull(response);
            mockedWebResponse.verify(
                    () ->
                            WebResponseUtils.fileToWebResponse(
                                    any(TempFile.class),
                                    eq("test.pdf.js"),
                                    eq(MediaType.TEXT_PLAIN)));
        }
    }

    @Test
    void extractHeader_nullCatalog_returnsNoJsMessage() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        when(mockDoc.getDocumentCatalog()).thenReturn(null);
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<StreamingResponseBody> expectedResponse =
                    streamingOk("no js".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.fileToWebResponse(
                                            any(TempFile.class),
                                            anyString(),
                                            eq(MediaType.TEXT_PLAIN)))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = showJavascript.extractHeader(request);

            assertNotNull(response);
            mockedWebResponse.verify(
                    () ->
                            WebResponseUtils.fileToWebResponse(
                                    any(TempFile.class), anyString(), eq(MediaType.TEXT_PLAIN)));
        }
    }

    @Test
    void extractHeader_emptyJsAction_returnsNoJsMessage() throws Exception {
        PDDocument mockDoc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        PDDocumentNameDictionary nameDict = mock(PDDocumentNameDictionary.class);
        PDJavascriptNameTreeNode jsTree = mock(PDJavascriptNameTreeNode.class);

        PDActionJavaScript jsAction = mock(PDActionJavaScript.class);
        when(jsAction.getAction()).thenReturn("   "); // whitespace only

        when(mockDoc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getNames()).thenReturn(nameDict);
        doReturn(jsTree).when(nameDict).getJavaScript();
        java.util.Map<String, PDActionJavaScript> jsMap2 = java.util.Map.of("Script1", jsAction);
        when(jsTree.getNames()).thenReturn(jsMap2);
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<StreamingResponseBody> expectedResponse =
                    streamingOk("no js".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.fileToWebResponse(
                                            any(TempFile.class),
                                            anyString(),
                                            eq(MediaType.TEXT_PLAIN)))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = showJavascript.extractHeader(request);

            assertNotNull(response);
            mockedWebResponse.verify(
                    () ->
                            WebResponseUtils.fileToWebResponse(
                                    any(TempFile.class), anyString(), eq(MediaType.TEXT_PLAIN)));
        }
    }

    @Test
    void extractHeader_loadThrowsException_propagates() throws Exception {
        when(pdfDocumentFactory.load(pdfFile)).thenThrow(new java.io.IOException("bad PDF"));

        assertThrows(java.io.IOException.class, () -> showJavascript.extractHeader(request));
    }
}
