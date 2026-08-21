package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
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
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SplitPdfBySizeControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private SplitPdfBySizeController controller;

    @BeforeEach
    void setUp() throws IOException {
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.getArgument(0);
                            return Files.createTempFile(tempDir, "test", suffix).toFile();
                        });
        lenient()
                .when(pdfDocumentFactory.load(any(File.class), eq(true)))
                .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
        lenient()
                .when(pdfDocumentFactory.load(any(File.class)))
                .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
    }

    private byte[] createPdf(int numPages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            Path pdfPath = tempDir.resolve("input.pdf");
            doc.save(pdfPath.toFile());
            return Files.readAllBytes(pdfPath);
        }
    }

    private List<byte[]> unzip(Resource zipResource) throws IOException {
        List<byte[]> entries = new ArrayList<>();
        try (ZipInputStream zis =
                new ZipInputStream(new ByteArrayInputStream(zipResource.getContentAsByteArray()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entries.add(zis.readAllBytes());
                zis.closeEntry();
            }
        }
        return entries;
    }

    private int[] pageCountsOf(List<byte[]> entries) throws IOException {
        int[] counts = new int[entries.size()];
        for (int i = 0; i < entries.size(); i++) {
            try (PDDocument doc = Loader.loadPDF(entries.get(i))) {
                counts[i] = doc.getNumberOfPages();
            }
        }
        return counts;
    }

    @Test
    @DisplayName("Should split by page count into 2-page chunks")
    void shouldSplitByPageCount() throws Exception {
        byte[] pdfBytes = createPdf(5);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setFileInput(file);
        request.setSplitType(1);
        request.setSplitValue("2");

        ResponseEntity<Resource> response = controller.autoSplitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType())
                .isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
        List<byte[]> outputs = unzip(response.getBody());
        assertThat(outputs).hasSize(3);
        assertThat(pageCountsOf(outputs)).containsExactly(2, 2, 1);
    }

    @Test
    @DisplayName("Should split by document count into 3 even documents")
    void shouldSplitByDocCount() throws Exception {
        byte[] pdfBytes = createPdf(6);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setFileInput(file);
        request.setSplitType(2);
        request.setSplitValue("3");

        ResponseEntity<Resource> response = controller.autoSplitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<byte[]> outputs = unzip(response.getBody());
        assertThat(outputs).hasSize(3);
        assertThat(pageCountsOf(outputs)).containsExactly(2, 2, 2);
    }

    @Test
    @DisplayName("Should split by document count distributing extras")
    void shouldSplitByDocCountWithRemainder() throws Exception {
        byte[] pdfBytes = createPdf(7);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setFileInput(file);
        request.setSplitType(2);
        request.setSplitValue("3");

        ResponseEntity<Resource> response = controller.autoSplitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<byte[]> outputs = unzip(response.getBody());
        assertThat(outputs).hasSize(3);
        assertThat(pageCountsOf(outputs)).containsExactly(3, 2, 2);
    }

    private byte[] createPdfWithForm(int numPages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            for (int i = 0; i < numPages; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                PDTextField field = new PDTextField(acroForm);
                field.setPartialName("text_p" + (i + 1));
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setRectangle(new PDRectangle(100, 700, 200, 20));
                widget.setPage(page);
                field.setWidgets(java.util.List.of(widget));
                page.getAnnotations().add(widget);
                acroForm.getFields().add(field);
            }
            Path pdfPath = tempDir.resolve("input.pdf");
            doc.save(pdfPath.toFile());
            return Files.readAllBytes(pdfPath);
        }
    }

    private List<String> fieldNamesOf(byte[] pdfBytes) throws IOException {
        List<String> names = new ArrayList<>();
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDAcroForm acroForm = doc.getDocumentCatalog().getAcroForm(null);
            if (acroForm == null) {
                return names;
            }
            for (PDField field : acroForm.getFields()) {
                names.add(field.getFullyQualifiedName());
            }
        }
        return names;
    }

    @Test
    @DisplayName("Should preserve AcroForm when splitting form PDF by page count")
    void shouldPreserveFormFieldsWhenSplitting() throws Exception {
        byte[] pdfBytes = createPdfWithForm(4);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setFileInput(file);
        request.setSplitType(1);
        request.setSplitValue("2");

        ResponseEntity<Resource> response = controller.autoSplitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<byte[]> outputs = unzip(response.getBody());
        assertThat(outputs).hasSize(2);
        assertThat(pageCountsOf(outputs)).containsExactly(2, 2);
        assertThat(fieldNamesOf(outputs.get(0))).containsExactlyInAnyOrder("text_p1", "text_p2");
        assertThat(fieldNamesOf(outputs.get(1))).containsExactlyInAnyOrder("text_p3", "text_p4");
    }

    @Test
    @DisplayName("Should split by size into multiple files")
    void shouldSplitBySize() throws Exception {
        byte[] pdfBytes = createPdf(20);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setFileInput(file);
        request.setSplitType(0);
        request.setSplitValue("3KB");

        ResponseEntity<Resource> response = controller.autoSplitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<byte[]> outputs = unzip(response.getBody());
        assertThat(outputs).isNotEmpty();
        int total = 0;
        for (int count : pageCountsOf(outputs)) {
            total += count;
        }
        assertThat(total).isEqualTo(20);
    }
}
