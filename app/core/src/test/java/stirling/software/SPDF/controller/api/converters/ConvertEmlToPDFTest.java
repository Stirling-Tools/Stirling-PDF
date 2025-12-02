package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertEmlToPDFTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;

    private ConvertEmlToPDF convertEmlToPDF;

    @BeforeEach
    void setUp() {
        convertEmlToPDF =
                new ConvertEmlToPDF(
                        pdfDocumentFactory,
                        runtimePathConfig,
                        tempFileManager,
                        customHtmlSanitizer);
    }

    @Test
    void convertEmlToPdf_whenFileIsEmpty_returnsBadRequest() {
        MultipartFile emptyFile =
                new MockMultipartFile("fileInput", "email.eml", "message/rfc822", new byte[0]);

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(emptyFile);

        var response = convertEmlToPDF.convertEmlToPdf(request);

        assertEquals(400, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("No file provided", new String(response.getBody(), StandardCharsets.UTF_8));
    }

    @Test
    void convertEmlToPdf_whenFileHasInvalidExtension_returnsBadRequest() {
        MultipartFile invalidFile =
                new MockMultipartFile(
                        "fileInput",
                        "document.txt",
                        "text/plain",
                        "content".getBytes(StandardCharsets.UTF_8));

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(invalidFile);

        var response = convertEmlToPDF.convertEmlToPdf(request);

        assertEquals(400, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(
                "Please upload a valid EML file",
                new String(response.getBody(), StandardCharsets.UTF_8));
    }
}
