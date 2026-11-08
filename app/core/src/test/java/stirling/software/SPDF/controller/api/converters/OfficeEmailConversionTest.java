package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.service.SsrfProtectionService;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.EmlParser;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

class OfficeEmailConversionTest {
    @TempDir Path dir;
    private final ApplicationProperties properties = new ApplicationProperties();
    private final CustomPDFDocumentFactory factory =
            new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
    private OfficeToPdfService toPdf;
    private ConvertEmlToPDF controller;

    @BeforeEach
    void setUp() {
        properties.getSystem().getTempFileManagement().setBaseTmpDir(dir.toString());
        var tempFiles = new TempFileManager(new TempFileRegistry(), properties);
        var office =
                new OfficeConversionService(
                        properties, mock(EndpointConfiguration.class), factory, tempFiles);
        toPdf = spy(new OfficeToPdfService(office, properties, tempFiles));
        var paths = mock(RuntimePathConfig.class);
        when(paths.getWeasyPrintPath()).thenReturn("weasyprint");
        controller =
                new ConvertEmlToPDF(
                        factory,
                        paths,
                        tempFiles,
                        new CustomHtmlSanitizer(mock(SsrfProtectionService.class), properties),
                        office,
                        toPdf);
    }

    @ParameterizedTest
    @CsvSource({"eml,true,", "msg,true,", "eml,false,true", "msg,false,true"})
    void rendersBothFormatsWithExplicitAndInheritedChoices(
            String format, boolean serverDefault, Boolean choice) throws Exception {
        properties.getSystem().setStirlingOfficeConversion(serverDefault);
        byte[] input = email(new byte[0]);
        if (format.equals("msg")) {
            try (var stream = getClass().getResourceAsStream("/eml/example.msg")) {
                assertThat(stream).isNotNull();
                input = stream.readAllBytes();
            }
        }
        var request = request(input, format);
        request.setUseStirlingOfficeConvert(choice);
        String subject = EmlParser.extractEmailContent(input, request, null).getSubject();

        try (var pdf = Loader.loadPDF(body(controller.convertEmlToPdf(request)))) {
            assertThat(pdf.getNumberOfPages()).isPositive();
            assertThat(new PDFTextStripper().getText(pdf)).contains(subject);
        }
    }

    @ParameterizedTest
    @CsvSource({"false,", "true,false"})
    void preservesTheStandardRendererAndAnExplicitOptOut(boolean serverDefault, Boolean choice)
            throws Exception {
        properties.getSystem().setStirlingOfficeConversion(serverDefault);
        var request = request(email(new byte[0]), "eml");
        request.setUseStirlingOfficeConvert(choice);
        byte[] expected;
        try (var pdf = new PDDocument();
                var output = new ByteArrayOutputStream()) {
            pdf.addPage(new PDPage());
            pdf.save(output);
            expected = output.toByteArray();
        }
        try (var standard = mockStatic(FileToPdf.class)) {
            standard.when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            eq("weasyprint"),
                                            any(),
                                            any(),
                                            anyString(),
                                            any(),
                                            any()))
                    .thenReturn(expected);

            assertThat(body(controller.convertEmlToPdf(request))).isEqualTo(expected);
            standard.verify(
                    () ->
                            FileToPdf.convertHtmlToPdf(
                                    eq("weasyprint"), any(), any(), anyString(), any(), any()));
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void respectsAttachmentChoices(boolean include) throws Exception {
        var request = request(email("attached note".getBytes(StandardCharsets.UTF_8)), "eml");
        request.setUseStirlingOfficeConvert(true);
        request.setIncludeAttachments(include);
        try (var pdf = Loader.loadPDF(body(controller.convertEmlToPdf(request)))) {
            String text = new PDFTextStripper().getText(pdf);
            assertThat(text).contains("Email conversion content");
            assertThat(text).contains("cc-only@example.com", "bcc-only@example.com");
            var names = pdf.getDocumentCatalog().getNames();
            if (include) {
                var attachments = names.getEmbeddedFiles().getNames();
                assertThat(attachments).containsKey("note.txt");
                assertThat(attachments.get("note.txt").getEmbeddedFile().toByteArray())
                        .isEqualTo("attached note".getBytes(StandardCharsets.UTF_8));
            } else {
                assertThat(names == null || names.getEmbeddedFiles() == null).isTrue();
            }
        }
    }

    @Test
    void excludesAttachmentsExceedingTheSelectedLimit() throws Exception {
        var request = request(email(new byte[1024 * 1024 + 1]), "eml");
        request.setUseStirlingOfficeConvert(true);
        request.setIncludeAttachments(true);
        request.setMaxAttachmentSizeMB(1);
        try (var pdf = Loader.loadPDF(body(controller.convertEmlToPdf(request)))) {
            var names = pdf.getDocumentCatalog().getNames();
            assertThat(names == null || names.getEmbeddedFiles() == null).isTrue();
        }
    }

    @Test
    void keepsHtmlDownloadAndSanitizationIndependentOfTheRenderer() throws Exception {
        var request = request(email(new byte[0]), "eml");
        request.setUseStirlingOfficeConvert(true);
        request.setDownloadHtml(true);
        var response = controller.convertEmlToPdf(request);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_HTML);
        assertThat(new String(body(response), StandardCharsets.UTF_8))
                .contains("Email conversion content")
                .doesNotContain("<script", "http://127.0.0.1");
        org.mockito.Mockito.verifyNoInteractions(toPdf);

        request.setDownloadHtml(false);
        body(controller.convertEmlToPdf(request));
        var html = ArgumentCaptor.forClass(byte[].class);
        verify(toPdf).convertHtml(html.capture(), eq(false));
        assertThat(new String(html.getValue(), StandardCharsets.UTF_8))
                .doesNotContain("<script", "http://127.0.0.1");
    }

    @Test
    void rendererFailureReturnsTheConversionReason() throws Exception {
        var request = request(email(new byte[0]), "eml");
        request.setUseStirlingOfficeConvert(true);
        doThrow(new IOException("Only part of email content could be converted"))
                .when(toPdf)
                .convertHtml(any(), eq(false));

        var response = controller.convertEmlToPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        try (var stream = response.getBody().getInputStream()) {
            assertThat(new String(stream.readAllBytes(), StandardCharsets.UTF_8))
                    .contains("Only part of email content could be converted");
        }
    }

    private static EmlToPdfRequest request(byte[] input, String extension) {
        var request = new EmlToPdfRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "message." + extension, "application/octet-stream", input));
        return request;
    }

    private static byte[] body(ResponseEntity<Resource> response) throws Exception {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        try (var stream = response.getBody().getInputStream()) {
            return stream.readAllBytes();
        }
    }

    private static byte[] email(byte[] attachment) {
        String message =
                "From: sender@example.com\r\nTo: recipient@example.com\r\n"
                        + "Cc: cc-only@example.com\r\nBcc: bcc-only@example.com\r\n"
                        + "Subject: Office email conversion\r\nMIME-Version: 1.0\r\n"
                        + "Content-Type: multipart/mixed; boundary=mail-boundary\r\n\r\n"
                        + "--mail-boundary\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n"
                        + "<p>Email conversion content</p><script>alert('unsafe')</script>"
                        + "<img src=\"http://127.0.0.1/private\">\r\n"
                        + "--mail-boundary\r\nContent-Type: text/plain; name=note.txt\r\n"
                        + "Content-Disposition: attachment; filename=note.txt\r\n"
                        + "Content-Transfer-Encoding: base64\r\n\r\n"
                        + Base64.getMimeEncoder().encodeToString(attachment)
                        + "\r\n--mail-boundary--\r\n";
        return message.getBytes(StandardCharsets.UTF_8);
    }
}
