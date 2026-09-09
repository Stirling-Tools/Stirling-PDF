package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
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

import stirling.software.SPDF.model.api.general.MergeMultiplePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Branch coverage for {@link MultiPageLayoutController#mergeMultiplePagesIntoOne} options:
 * orientation/arrangement/reading-direction validation, margin validation, landscape, RTL and
 * by-column layouts, all exercised against real multi-page source documents.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("MultiPageLayoutController options")
class MultiPageLayoutControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private MultiPageLayoutController controller;

    @BeforeEach
    void setUp() throws Exception {
        controller = new MultiPageLayoutController(pdfDocumentFactory, tempFileManager);
        when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("mpl", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    /** Wires the factory to load real source pages and return a real target document. */
    private void wireDocuments(int pages) throws Exception {
        PDDocument source = new PDDocument();
        for (int i = 0; i < pages; i++) {
            source.addPage(new PDPage(PDRectangle.A4));
        }
        when(pdfDocumentFactory.load(any(org.springframework.web.multipart.MultipartFile.class)))
                .thenReturn(source);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(source))
                .thenReturn(new PDDocument());
    }

    private static MockMultipartFile file() {
        return new MockMultipartFile("fileInput", "in.pdf", "application/pdf", new byte[] {1});
    }

    private static MergeMultiplePagesRequest base() {
        MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
        req.setFileInput(file());
        req.setPagesPerSheet(4);
        return req;
    }

    @Nested
    @DisplayName("validation failures")
    class Validation {

        @Test
        @DisplayName("unknown mode is rejected")
        void unknownModeThrows() {
            MergeMultiplePagesRequest req = base();
            req.setMode("WEIRD");
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }

        @Test
        @DisplayName("custom mode with non-positive rows/cols is rejected")
        void customNonPositiveThrows() {
            MergeMultiplePagesRequest req = base();
            req.setMode("CUSTOM");
            req.setRows(0);
            req.setCols(2);
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }

        @Test
        @DisplayName("invalid orientation is rejected")
        void invalidOrientationThrows() {
            MergeMultiplePagesRequest req = base();
            req.setOrientation("DIAGONAL");
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }

        @Test
        @DisplayName("invalid arrangement is rejected")
        void invalidArrangementThrows() {
            MergeMultiplePagesRequest req = base();
            req.setArrangement("SPIRAL");
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }

        @Test
        @DisplayName("invalid reading direction is rejected")
        void invalidReadingDirectionThrows() {
            MergeMultiplePagesRequest req = base();
            req.setReadingDirection("DIAGONAL");
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }

        @Test
        @DisplayName("negative margins are rejected")
        void negativeMarginsThrows() {
            MergeMultiplePagesRequest req = base();
            req.setTopMargin(-1);
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }

        @Test
        @DisplayName("outer margins that consume the whole page yield a non-positive cell error")
        void outerMarginsTooLargeThrows() throws Exception {
            wireDocuments(1);
            MergeMultiplePagesRequest req = base();
            // A4 width is ~595pt; 600 left margin alone makes cell width non-positive.
            req.setLeftMargin(600);
            req.setRightMargin(600);
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }

        @Test
        @DisplayName("inner margin larger than the cell yields a non-positive inner-area error")
        void innerMarginTooLargeThrows() throws Exception {
            wireDocuments(1);
            MergeMultiplePagesRequest req = base();
            req.setInnerMargin(1000);
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.mergeMultiplePagesIntoOne(req));
        }
    }

    @Nested
    @DisplayName("layout option branches")
    class LayoutOptions {

        @Test
        @DisplayName("landscape orientation succeeds and skips form copying")
        void landscapeSucceeds() throws Exception {
            wireDocuments(4);
            MergeMultiplePagesRequest req = base();
            req.setOrientation("LANDSCAPE");
            req.setAddBorder(Boolean.TRUE);

            ResponseEntity<Resource> response = controller.mergeMultiplePagesIntoOne(req);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertTrue(response.getBody().contentLength() >= 0);
        }

        @Test
        @DisplayName("right-to-left reading direction succeeds")
        void rtlSucceeds() throws Exception {
            wireDocuments(4);
            MergeMultiplePagesRequest req = base();
            req.setReadingDirection("RTL");

            ResponseEntity<Resource> response = controller.mergeMultiplePagesIntoOne(req);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("by-columns arrangement with RTL succeeds")
        void byColumnsRtlSucceeds() throws Exception {
            wireDocuments(4);
            MergeMultiplePagesRequest req = base();
            req.setArrangement("BY_COLUMNS");
            req.setReadingDirection("RTL");

            ResponseEntity<Resource> response = controller.mergeMultiplePagesIntoOne(req);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("by-columns arrangement with LTR succeeds")
        void byColumnsLtrSucceeds() throws Exception {
            wireDocuments(4);
            MergeMultiplePagesRequest req = base();
            req.setArrangement("BY_COLUMNS");

            ResponseEntity<Resource> response = controller.mergeMultiplePagesIntoOne(req);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("custom mode with explicit borderWidth succeeds")
        void customModeWithBorderSucceeds() throws Exception {
            wireDocuments(6);
            MergeMultiplePagesRequest req = base();
            req.setMode("CUSTOM");
            req.setRows(2);
            req.setCols(3);
            req.setAddBorder(Boolean.TRUE);
            req.setBorderWidth(3);

            ResponseEntity<Resource> response = controller.mergeMultiplePagesIntoOne(req);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("blank mode string defaults to DEFAULT and succeeds")
        void blankModeDefaults() throws Exception {
            wireDocuments(2);
            MergeMultiplePagesRequest req = base();
            req.setMode("   ");
            req.setPagesPerSheet(2);

            ResponseEntity<Resource> response = controller.mergeMultiplePagesIntoOne(req);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }
}
