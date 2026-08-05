package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.SPDF.controller.api.converters.ConvertPdfToPdfUa;
import stirling.software.SPDF.controller.api.security.AccessibilityReportController;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;

/**
 * Exercises the endpoints over HTTP rather than by calling the services directly.
 *
 * <p>Everything else in this suite invokes the service layer. That leaves the whole request path
 * unverified: whether the composed annotations really produce {@code /api/v1/convert/pdf/ua},
 * whether multipart form fields bind to the request model, and whether the response headers and
 * JSON shape a client depends on actually come back. A feature that works in a unit test and 404s
 * over the wire is not a feature.
 */
class PdfUaHttpEndpointTest {

    private static MockMvc convertMvc;
    private static MockMvc reportMvc;
    private static final ObjectMapper JSON = new ObjectMapper();

    @BeforeAll
    static void setUp() throws Exception {
        PdfUaValidationService validation = new PdfUaValidationService();
        validation.initialise();
        PdfUaConversionService conversion =
                new PdfUaConversionService(
                        validation,
                        new FontEmbeddingService(),
                        new CustomPDFDocumentFactory(
                                org.mockito.Mockito.mock(PdfMetadataService.class)));

        // A real TempFileManager, so the streamed response path is exercised rather than mocked.
        TempFileManager tempFiles =
                new TempFileManager(
                        new stirling.software.common.util.TempFileRegistry(),
                        new stirling.software.common.model.ApplicationProperties());

        // The application's own advice is registered so the error mapping a client sees is what
        // gets asserted; a standalone setup without it turns every rejection into a raw 500.
        var advice =
                new stirling.software.SPDF.exception.GlobalExceptionHandler(
                        new org.springframework.context.support.StaticMessageSource(),
                        new org.springframework.mock.env.MockEnvironment());
        convertMvc =
                MockMvcBuilders.standaloneSetup(new ConvertPdfToPdfUa(conversion, tempFiles))
                        .setControllerAdvice(advice)
                        .build();
        reportMvc =
                MockMvcBuilders.standaloneSetup(
                                new AccessibilityReportController(
                                        new AccessibilityAuditService(validation)))
                        .setControllerAdvice(advice)
                        .build();
    }

    private static MockMultipartFile upload(byte[] pdf, String name) {
        return new MockMultipartFile("fileInput", name, "application/pdf", pdf);
    }

    @Test
    @DisplayName("POST /api/v1/convert/pdf/ua returns a PDF and reports what it did in headers")
    void conversionEndpointResponds() throws Exception {
        MvcResult result =
                convertMvc
                        .perform(
                                multipart("/api/v1/convert/pdf/ua")
                                        .file(upload(PdfUaTestDocuments.simpleDocument(), "in.pdf"))
                                        .param("language", "en-GB")
                                        .param("title", "Over The Wire")
                                        .param("embedFonts", "false"))
                        .andExpect(status().isOk())
                        .andExpect(header().exists("X-Stirling-UA-Declared"))
                        .andExpect(header().exists("X-Stirling-UA-Failures"))
                        .andReturn();

        byte[] body = result.getResponse().getContentAsByteArray();
        assertTrue(body.length > 0, "no document came back");
        assertEquals(
                "%PDF",
                new String(body, 0, 4, java.nio.charset.StandardCharsets.ISO_8859_1),
                "the response body is not a PDF");
        assertEquals(
                "true",
                result.getResponse().getHeader("X-Stirling-UA-Declared"),
                "a simple embedded-font document should convert and be declared conformant");
    }

    @Test
    @DisplayName("POST /api/v1/security/accessibility-report returns the figure inventory as JSON")
    void reportEndpointResponds() throws Exception {
        MvcResult result =
                reportMvc
                        .perform(
                                multipart("/api/v1/security/accessibility-report")
                                        .file(upload(PdfUaTestDocuments.imageDocument(), "in.pdf"))
                                        .param("profile", "ua1"))
                        .andExpect(status().isOk())
                        .andReturn();

        JsonNode json = JSON.readTree(result.getResponse().getContentAsString());
        assertEquals("PDF/UA-1", json.get("profile").asText());
        assertNotNull(json.get("summary"), "the report should carry a summary");

        JsonNode figures = json.get("figuresNeedingDescription");
        assertNotNull(figures, "the field a caller needs to supply alt text is missing");
        assertTrue(figures.isArray() && figures.size() > 0, "the image should be listed: " + json);
        assertTrue(
                figures.get(0).get("key").asText().matches("\\d+:\\d+"),
                "the key must be usable in a follow-up conversion request");
    }

    @Test
    @DisplayName("alt text supplied as form data reaches the converter over HTTP")
    void altTextBindsFromFormData() throws Exception {
        byte[] input = PdfUaTestDocuments.imageDocument();

        // Discover the key the way a client would, through the report endpoint.
        MvcResult reported =
                reportMvc
                        .perform(
                                multipart("/api/v1/security/accessibility-report")
                                        .file(upload(input, "in.pdf")))
                        .andExpect(status().isOk())
                        .andReturn();
        String key =
                JSON.readTree(reported.getResponse().getContentAsString())
                        .get("figuresNeedingDescription")
                        .get(0)
                        .get("key")
                        .asText();

        MvcResult converted =
                convertMvc
                        .perform(
                                multipart("/api/v1/convert/pdf/ua")
                                        .file(upload(input, "in.pdf"))
                                        .param("embedFonts", "false")
                                        .param("altText", key + "=A blue rectangle"))
                        .andExpect(status().isOk())
                        .andReturn();

        assertEquals(
                "0",
                converted.getResponse().getHeader("X-Stirling-UA-Figures-Needing-Alt"),
                "the description posted as form data was not applied");
    }

    @Test
    @DisplayName("a request with no file is rejected rather than processed")
    void missingFileIsRejected() throws Exception {
        convertMvc
                .perform(
                        multipart("/api/v1/convert/pdf/ua")
                                .file(
                                        new MockMultipartFile(
                                                "fileInput",
                                                "e.pdf",
                                                "application/pdf",
                                                new byte[0])))
                .andExpect(status().is4xxClientError());
    }
}
