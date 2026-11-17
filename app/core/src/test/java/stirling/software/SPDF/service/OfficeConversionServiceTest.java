package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipFile;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.hslf.usermodel.HSLFSlideShow;
import org.apache.poi.hslf.usermodel.HSLFTextParagraph;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

class OfficeConversionServiceTest {

    @TempDir Path dir;

    private final ApplicationProperties properties = new ApplicationProperties();
    private OfficeConversionService service;

    @BeforeEach
    void setUp() {
        service = new OfficeConversionService(properties, null, null);
    }

    @Test
    void failedUploadConversionReleasesItsOutputFile() throws Exception {
        TempFileManager tempFiles = mock(TempFileManager.class);
        TempFile out = mock(TempFile.class);
        when(tempFiles.createManagedTempFile(".epub")).thenReturn(out);
        CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
        when(factory.load(any(MultipartFile.class))).thenThrow(new IOException("not a pdf"));
        var uploads = new OfficeConversionService(properties, factory, tempFiles);
        var upload =
                new MockMultipartFile("fileInput", "in.pdf", "application/pdf", new byte[] {1});

        assertThatThrownBy(
                        () ->
                                uploads.convert(
                                        upload,
                                        "epub",
                                        MediaType.APPLICATION_OCTET_STREAM,
                                        uploads.settings()))
                .isInstanceOf(IOException.class);
        verify(out).close();
    }

    @Test
    void convertsPdfToWord() throws Exception {
        Path docx = dir.resolve("out.docx");
        try (PDDocument pdf = textPdf("Hello from Stirling")) {
            service.convert(pdf, docx, "docx", service.settings());
        }

        try (ZipFile zip = new ZipFile(docx.toFile())) {
            String body =
                    new String(
                            zip.getInputStream(zip.getEntry("word/document.xml")).readAllBytes());
            assertThat(body).contains("Hello from Stirling");
        }
    }

    @Test
    void convertsPdfToLegacyPowerPoint() throws Exception {
        Path ppt = dir.resolve("out.ppt");
        try (PDDocument pdf = textPdf("Hello from Stirling")) {
            service.convert(pdf, ppt, "ppt", service.settings());
        }

        try (var in = Files.newInputStream(ppt);
                HSLFSlideShow slides = new HSLFSlideShow(in)) {
            assertThat(slides.getSlides()).hasSize(1);
            assertThat(slides.getSlides().getFirst().getTextParagraphs())
                    .anySatisfy(
                            paragraphs ->
                                    assertThat(HSLFTextParagraph.getText(paragraphs))
                                            .contains("Hello from Stirling"));
        }
    }

    @Test
    void convertsWordToPdf() throws Exception {
        Path docx = dir.resolve("in.docx");
        try (XWPFDocument word = new XWPFDocument();
                OutputStream out = Files.newOutputStream(docx)) {
            word.createParagraph().createRun().setText("Office to PDF");
            word.write(out);
        }
        Path pdf = dir.resolve("out.pdf");
        OfficeToPdfService toPdf = new OfficeToPdfService(properties, null);

        assertThat(OfficeToPdfService.handles("docx")).isTrue();
        toPdf.convert(docx, pdf);

        try (PDDocument result = Loader.loadPDF(pdf.toFile())) {
            assertThat(result.getNumberOfPages()).isEqualTo(1);
        }
    }

    @Test
    void recognisesOnlyFormatsTheConverterReads() {
        assertThat(OfficeToPdfService.handles("wpd")).isFalse();
        assertThat(OfficeToPdfService.handles("doc")).isTrue();
        assertThat(OfficeToPdfService.handles("xls")).isTrue();
    }

    @Test
    void refusesPptBeyondThePageCap() throws Exception {
        Path target = dir.resolve("out.ppt");
        try (PDDocument pdf = new PDDocument()) {
            for (int i = 0; i < OfficeConversionService.MAX_PPT_SLIDES; i++) {
                pdf.addPage(new PDPage());
            }
            assertThatThrownBy(() -> service.convert(pdf, target, "ppt", service.settings()))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    private static PDDocument textPdf(String text) throws Exception {
        PDDocument pdf = new PDDocument();
        PDPage page = new PDPage();
        pdf.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(pdf, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.newLineAtOffset(72, 700);
            content.showText(text);
            content.endText();
        }
        return pdf;
    }
}
