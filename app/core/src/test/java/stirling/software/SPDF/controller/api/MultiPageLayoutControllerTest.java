package stirling.software.SPDF.controller.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class MultiPageLayoutControllerTest {

    private static byte[] drainBody(Response response) throws IOException {
        Object entity = response.getEntity();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if (entity instanceof byte[] bytes) {
            baos.write(bytes);
        } else if (entity instanceof StreamingOutput streaming) {
            streaming.write(baos);
        } else {
            throw new IllegalStateException(
                    "Unexpected response entity type: "
                            + (entity == null ? "null" : entity.getClass().getName()));
        }
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private MultiPageLayoutController controller;

    private FileUpload fileWithExt;
    private FileUpload fileNoExt;

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
        fileWithExt = TestFileUploads.of(new byte[] {1, 2, 3}, "test.pdf", "application/pdf");
        fileNoExt = TestFileUploads.of(new byte[] {4, 5, 6}, "name", "application/pdf");
    }

    @Test
    @DisplayName("Rejects non-2/3 and non-perfect-square pagesPerSheet")
    void invalidPagesPerSheetThrows() {
        Assertions.assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.mergeMultiplePagesIntoOne(
                                fileWithExt,
                                null,
                                null,
                                5,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                Boolean.TRUE));
    }

    @Test
    @DisplayName("Generates PDF and filename suffix for perfect-square layout with no source pages")
    void perfectSquareNoPages() throws Exception {
        PDDocument source = new PDDocument();
        PDDocument target = new PDDocument();
        Mockito.when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(source);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(source))
                .thenReturn(target);

        Response resp =
                controller.mergeMultiplePagesIntoOne(
                        fileWithExt,
                        null,
                        null,
                        4,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        Boolean.FALSE);

        Assertions.assertEquals(200, resp.getStatus());
        Assertions.assertEquals("application/pdf", resp.getMediaType().toString());
        Assertions.assertNotNull(resp.getEntity());
        Assertions.assertTrue(drainBody(resp).length > 0);
        Assertions.assertTrue(
                resp.getHeaderString("Content-Disposition").contains("test_multi_page_layout.pdf"));
    }

    @Test
    @DisplayName("Merges single source page into 2-up layout and returns PDF")
    void twoUpWithSinglePage() throws Exception {
        PDDocument source = new PDDocument();
        source.addPage(new PDPage());
        PDDocument target = new PDDocument();
        Mockito.when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(source);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(source))
                .thenReturn(target);

        Response resp =
                controller.mergeMultiplePagesIntoOne(
                        fileWithExt,
                        null,
                        null,
                        2,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        Boolean.TRUE);

        Assertions.assertEquals(200, resp.getStatus());
        Assertions.assertEquals("application/pdf", resp.getMediaType().toString());
        Assertions.assertNotNull(resp.getEntity());
        Assertions.assertTrue(drainBody(resp).length > 0);
    }

    @Test
    @DisplayName("Uses input name without extension and appends suffix for 3-up")
    void threeUpWithNameNoExtension() throws Exception {
        PDDocument source = new PDDocument();
        PDDocument target = new PDDocument();
        Mockito.when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(source);
        Mockito.when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(source))
                .thenReturn(target);

        // mode=CUSTOM, cols=3, rows=1
        Response resp =
                controller.mergeMultiplePagesIntoOne(
                        fileNoExt,
                        null,
                        "CUSTOM",
                        null,
                        null,
                        null,
                        1,
                        3,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        Boolean.TRUE);

        Assertions.assertTrue(
                resp.getHeaderString("Content-Disposition").contains("name_multi_page_layout.pdf"));
    }
}
