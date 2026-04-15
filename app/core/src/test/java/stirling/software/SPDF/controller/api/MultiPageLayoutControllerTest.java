package stirling.software.SPDF.controller.api;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.model.api.general.MergeMultiplePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class MultiPageLayoutControllerTest {
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

    @InjectMocks private MultiPageLayoutController controller;

    private MockMultipartFile fileWithExt;
    private MockMultipartFile fileNoExt;

    @BeforeEach
    void setup() throws Exception {
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
        fileWithExt =
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", new byte[] {1, 2, 3});
        fileNoExt =
                new MockMultipartFile("fileInput", "name", "application/pdf", new byte[] {4, 5, 6});
    }

    @Test
    @DisplayName("Rejects non-2/3 and non-perfect-square pagesPerSheet")
    void invalidPagesPerSheetThrows() {
        MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
        req.setPagesPerSheet(5);
        req.setAddBorder(Boolean.TRUE);
        req.setFileInput(fileWithExt);

        Assertions.assertThrows(
                IllegalArgumentException.class, () -> controller.mergeMultiplePagesIntoOne(req));
    }

    @Test
    @DisplayName("Generates PDF and filename suffix for perfect-square layout with no source pages")
    void perfectSquareNoPages() throws Exception {
        PDDocument source = new PDDocument();
        PDDocument target = new PDDocument();
        Mockito.when(pdfDocumentFactory.load(fileWithExt)).thenReturn(source);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(source))
                .thenReturn(target);

        MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
        req.setPagesPerSheet(4);
        req.setAddBorder(Boolean.FALSE);
        req.setFileInput(fileWithExt);

        ResponseEntity<StreamingResponseBody> resp = controller.mergeMultiplePagesIntoOne(req);
        Assertions.assertEquals(HttpStatus.OK, resp.getStatusCode());
        Assertions.assertEquals(MediaType.APPLICATION_PDF, resp.getHeaders().getContentType());
        Assertions.assertNotNull(resp.getBody());
        Assertions.assertTrue(drainBody(resp).length > 0);
        Assertions.assertEquals(
                "test_multi_page_layout.pdf",
                resp.getHeaders().getContentDisposition().getFilename());
    }

    @Test
    @DisplayName("Merges single source page into 2-up layout and returns PDF")
    void twoUpWithSinglePage() throws Exception {
        PDDocument source = new PDDocument();
        source.addPage(new PDPage());
        PDDocument target = new PDDocument();
        Mockito.when(pdfDocumentFactory.load(fileWithExt)).thenReturn(source);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(source))
                .thenReturn(target);

        MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
        req.setPagesPerSheet(2);
        req.setAddBorder(Boolean.TRUE);
        req.setFileInput(fileWithExt);

        ResponseEntity<StreamingResponseBody> resp = controller.mergeMultiplePagesIntoOne(req);
        Assertions.assertEquals(HttpStatus.OK, resp.getStatusCode());
        Assertions.assertEquals(MediaType.APPLICATION_PDF, resp.getHeaders().getContentType());
        Assertions.assertNotNull(resp.getBody());
        Assertions.assertTrue(drainBody(resp).length > 0);
    }

    @Test
    @DisplayName("Uses input name without extension and appends suffix for 3-up")
    void threeUpWithNameNoExtension() throws Exception {
        PDDocument source = new PDDocument();
        PDDocument target = new PDDocument();
        Mockito.when(pdfDocumentFactory.load(fileNoExt)).thenReturn(source);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(source))
                .thenReturn(target);

        MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
        req.setMode("CUSTOM");
        req.setCols(3);
        req.setRows(1);
        req.setAddBorder(Boolean.TRUE);
        req.setFileInput(fileNoExt);

        ResponseEntity<StreamingResponseBody> resp = controller.mergeMultiplePagesIntoOne(req);
        Assertions.assertEquals(
                "name_multi_page_layout.pdf",
                resp.getHeaders().getContentDisposition().getFilename());
    }
}
