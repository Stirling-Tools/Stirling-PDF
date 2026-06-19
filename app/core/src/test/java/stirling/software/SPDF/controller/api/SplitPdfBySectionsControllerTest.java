package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
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

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SplitPdfBySectionsControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private SplitPdfBySectionsController controller;

    @BeforeEach
    void setUp() throws IOException {
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
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            String suffix = inv.getArgument(0);
                            return Files.createTempFile(tempDir, "test", suffix).toFile();
                        });
    }

    private byte[] createPdf(int numPages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            Path pdfPath = tempDir.resolve("input_" + numPages + ".pdf");
            doc.save(pdfPath.toFile());
            return Files.readAllBytes(pdfPath);
        }
    }

    private void setupFactory() throws IOException {
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());
        when(pdfDocumentFactory.createNewDocument()).thenAnswer(inv -> new PDDocument());
    }

    @Test
    @DisplayName("Should split all pages into halves with merge")
    void shouldSplitAllPagesHalvesMerged() throws Exception {
        byte[] pdfBytes = createPdf(2);
        setupFactory();

        // horizontalDivisions=1 (2 columns), verticalDivisions=0 (1 row), merge=true
        Response response =
                controller.splitPdf(TestFileUploads.pdf(pdfBytes), null, "all", null, 1, 0, true);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getEntity()).isNotNull();
    }

    @Test
    @DisplayName("Should split all pages into quarters without merge")
    void shouldSplitAllPagesQuartersNoMerge() throws Exception {
        byte[] pdfBytes = createPdf(1);
        setupFactory();

        // horizontalDivisions=1 (2 columns), verticalDivisions=1 (2 rows), merge=false
        Response response =
                controller.splitPdf(TestFileUploads.pdf(pdfBytes), null, "all", null, 1, 1, false);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("Should split with SPLIT_ALL mode")
    void shouldSplitAllMode() throws Exception {
        byte[] pdfBytes = createPdf(2);
        setupFactory();

        Response response =
                controller.splitPdf(
                        TestFileUploads.pdf(pdfBytes), null, null, "SPLIT_ALL", 0, 1, true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("Should split with SPLIT_ALL_EXCEPT_FIRST mode")
    void shouldSplitExceptFirst() throws Exception {
        byte[] pdfBytes = createPdf(3);
        setupFactory();

        Response response =
                controller.splitPdf(
                        TestFileUploads.pdf(pdfBytes),
                        null,
                        null,
                        "SPLIT_ALL_EXCEPT_FIRST",
                        1,
                        0,
                        true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("Should split with SPLIT_ALL_EXCEPT_LAST mode")
    void shouldSplitExceptLast() throws Exception {
        byte[] pdfBytes = createPdf(3);
        setupFactory();

        Response response =
                controller.splitPdf(
                        TestFileUploads.pdf(pdfBytes),
                        null,
                        null,
                        "SPLIT_ALL_EXCEPT_LAST",
                        1,
                        0,
                        true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("Should split with SPLIT_ALL_EXCEPT_FIRST_AND_LAST mode")
    void shouldSplitExceptFirstAndLast() throws Exception {
        byte[] pdfBytes = createPdf(4);
        setupFactory();

        Response response =
                controller.splitPdf(
                        TestFileUploads.pdf(pdfBytes),
                        null,
                        null,
                        "SPLIT_ALL_EXCEPT_FIRST_AND_LAST",
                        1,
                        0,
                        true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("Should split custom pages without merge")
    void shouldSplitCustomPagesNoMerge() throws Exception {
        byte[] pdfBytes = createPdf(3);
        setupFactory();

        Response response =
                controller.splitPdf(
                        TestFileUploads.pdf(pdfBytes), null, "1,3", "CUSTOM", 0, 1, false);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("Should throw for CUSTOM mode with no page numbers")
    void shouldThrowForCustomModeNoPages() throws Exception {
        byte[] pdfBytes = createPdf(2);
        setupFactory();

        assertThrows(
                Exception.class,
                () ->
                        controller.splitPdf(
                                TestFileUploads.pdf(pdfBytes), null, "", "CUSTOM", 1, 0, false));
    }

    @Test
    @DisplayName("Should handle single page PDF with merge")
    void shouldHandleSinglePageMerge() throws Exception {
        byte[] pdfBytes = createPdf(1);
        setupFactory();

        // horizontalDivisions=2 (3 columns), verticalDivisions=2 (3 rows) = 9 sections
        Response response =
                controller.splitPdf(TestFileUploads.pdf(pdfBytes), null, null, null, 2, 2, true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("Should split into thirds vertically")
    void shouldSplitThirdsVertically() throws Exception {
        byte[] pdfBytes = createPdf(1);
        setupFactory();

        // horizontalDivisions=0 (1 column), verticalDivisions=2 (3 rows)
        Response response =
                controller.splitPdf(TestFileUploads.pdf(pdfBytes), null, null, null, 0, 2, true);

        assertThat(response.getStatus()).isEqualTo(200);
    }
}
