package stirling.software.spdf.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
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
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import stirling.software.spdf.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.topdf.OfficeToPdf;

class OfficeConversionServiceTest {

    @TempDir Path dir;

    private final ApplicationProperties properties = new ApplicationProperties();
    private final EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
    private OfficeConversionService service;

    @BeforeEach
    void setUp() {
        service = new OfficeConversionService(properties, endpoints);
    }

    @ParameterizedTest(name = "legacy={0}, LibreOffice={1} -> Stirling Office Convert {2}")
    @CsvSource({"false,true,true", "false,false,true", "true,true,false", "true,false,false"})
    void onlyTheFlagSwitchesToStirlingOfficeConvert(
            boolean legacy, boolean libreOffice, boolean expected) {
        properties.getSystem().setStirlingOfficeConversion(!legacy);
        when(endpoints.isGroupEnabled("LibreOffice")).thenReturn(libreOffice);

        assertThat(service.replacesLibreOffice()).isEqualTo(expected);
    }

    @Test
    void aPerRequestChoiceOverridesTheSetting() {
        assertThat(service.replacesLibreOffice(true)).isTrue();
        assertThat(service.replacesLibreOffice(null)).isFalse();
        properties.getSystem().setStirlingOfficeConversion(true);
        assertThat(service.replacesLibreOffice(false)).isFalse();
        assertThat(service.replacesLibreOffice(null)).isTrue();
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
    void convertsWordToPdf() throws Exception {
        Path docx = dir.resolve("in.docx");
        try (XWPFDocument word = new XWPFDocument();
                OutputStream out = Files.newOutputStream(docx)) {
            word.createParagraph().createRun().setText("Office to PDF");
            word.write(out);
        }
        Path pdf = dir.resolve("out.pdf");
        properties.getSystem().setStirlingOfficeConversion(true);
        OfficeToPdfService toPdf = new OfficeToPdfService(service, properties);

        assertThat(toPdf.handles("docx")).isTrue();
        toPdf.convert(docx, pdf);

        try (PDDocument result = Loader.loadPDF(pdf.toFile())) {
            assertThat(result.getNumberOfPages()).isEqualTo(1);
        }
    }

    @Test
    void leavesUnknownFormatsAndLegacyToLibreOffice() {
        OfficeToPdfService toPdf = new OfficeToPdfService(service, properties);
        assertThat(toPdf.handles("html")).isFalse();

        properties.getSystem().setStirlingOfficeConversion(false);
        when(endpoints.isGroupEnabled("LibreOffice")).thenReturn(true);
        assertThat(toPdf.handles("docx")).isFalse();
    }

    @Test
    void fallsBackOnlyWhenLibreOfficeCanHelp() {
        OfficeToPdfService toPdf = new OfficeToPdfService(service, properties);
        when(endpoints.isGroupEnabled("LibreOffice")).thenReturn(true);

        assertThat(toPdf.canFallBack(new IOException("bad file"))).isTrue();
        assertThat(toPdf.canFallBack(new IOException("wrapped", mock(OfficeToPdf.TimedOut.class))))
                .isFalse();

        when(endpoints.isGroupEnabled("LibreOffice")).thenReturn(false);
        assertThat(toPdf.canFallBack(new IOException("bad file"))).isFalse();
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
