package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.ServletContext;

import stirling.software.SPDF.model.ApiEndpoint;
import stirling.software.common.service.UserServiceInterface;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class ApiDocServiceTest {

    @Mock ServletContext servletContext;
    @Mock UserServiceInterface userService;

    ApiDocService apiDocService;
    ObjectMapper mapper = JsonMapper.builder().build();

    @BeforeEach
    void setUp() {
        apiDocService = new ApiDocService(mapper, servletContext, userService);
    }

    private void setApiDocumentation(Map<String, ApiEndpoint> docs) throws Exception {
        Field field = ApiDocService.class.getDeclaredField("apiDocumentation");
        field.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, ApiEndpoint> map = (Map<String, ApiEndpoint>) field.get(apiDocService);
        map.clear();
        map.putAll(docs);
    }

    private void setApiDocsJsonRootNode() throws Exception {
        Field field = ApiDocService.class.getDeclaredField("apiDocsJsonRootNode");
        field.setAccessible(true);
        field.set(apiDocService, mapper.createObjectNode());
    }

    @Test
    void getExtensionTypesReturnsExpectedList() throws Exception {
        String json = "{\"description\": \"Output:PDF\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/test", postNode);

        setApiDocumentation(Map.of("/test", endpoint));
        setApiDocsJsonRootNode();

        List<String> extensions = apiDocService.getExtensionTypes(true, "/test");
        assertEquals(List.of("pdf"), extensions);
    }

    @Test
    void getExtensionTypesHandlesUnknownOperation() throws Exception {
        setApiDocumentation(Map.of());

        List<String> extensions = apiDocService.getExtensionTypes(true, "/unknown");
        assertNull(extensions);
    }

    @Test
    void getExtensionTypesReturnsImageTypes() throws Exception {
        String json = "{\"description\": \"Output:IMAGE\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/img", postNode);
        setApiDocumentation(Map.of("/img", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/img");
        assertNotNull(extensions);
        assertTrue(extensions.contains("png"));
        assertTrue(extensions.contains("jpg"));
        assertTrue(extensions.contains("gif"));
    }

    @Test
    void getExtensionTypesReturnsZipTypes() throws Exception {
        String json = "{\"description\": \"Output:ZIP\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/zip", postNode);
        setApiDocumentation(Map.of("/zip", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/zip");
        assertNotNull(extensions);
        assertTrue(extensions.contains("zip"));
        assertTrue(extensions.contains("rar"));
    }

    @Test
    void getExtensionTypesReturnsWordTypes() throws Exception {
        String json = "{\"description\": \"Output:WORD\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/word", postNode);
        setApiDocumentation(Map.of("/word", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/word");
        assertNotNull(extensions);
        assertTrue(extensions.contains("doc"));
        assertTrue(extensions.contains("docx"));
    }

    @Test
    void getExtensionTypesReturnsCsvTypes() throws Exception {
        String json = "{\"description\": \"Output:CSV\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/csv", postNode);
        setApiDocumentation(Map.of("/csv", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/csv");
        assertEquals(List.of("csv"), extensions);
    }

    @Test
    void getExtensionTypesReturnsHtmlTypes() throws Exception {
        String json = "{\"description\": \"Output:HTML\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/html", postNode);
        setApiDocumentation(Map.of("/html", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/html");
        assertNotNull(extensions);
        assertTrue(extensions.contains("html"));
        assertTrue(extensions.contains("htm"));
    }

    @Test
    void getExtensionTypesReturnsBookTypes() throws Exception {
        String json = "{\"description\": \"Output:BOOK\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/book", postNode);
        setApiDocumentation(Map.of("/book", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/book");
        assertNotNull(extensions);
        assertTrue(extensions.contains("epub"));
        assertTrue(extensions.contains("mobi"));
    }

    @Test
    void getExtensionTypesReturnsJsonTypes() throws Exception {
        String json = "{\"description\": \"Output:JSON\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/json", postNode);
        setApiDocumentation(Map.of("/json", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/json");
        assertEquals(List.of("json"), extensions);
    }

    @Test
    void getExtensionTypesReturnsTxtTypes() throws Exception {
        String json = "{\"description\": \"Output:TXT\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/txt", postNode);
        setApiDocumentation(Map.of("/txt", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/txt");
        assertNotNull(extensions);
        assertTrue(extensions.contains("txt"));
        assertTrue(extensions.contains("md"));
    }

    @Test
    void getExtensionTypesReturnsPptTypes() throws Exception {
        String json = "{\"description\": \"Output:PPT\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/ppt", postNode);
        setApiDocumentation(Map.of("/ppt", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/ppt");
        assertNotNull(extensions);
        assertTrue(extensions.contains("ppt"));
        assertTrue(extensions.contains("pptx"));
    }

    @Test
    void getExtensionTypesReturnsXmlTypes() throws Exception {
        String json = "{\"description\": \"Output:XML\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/xml", postNode);
        setApiDocumentation(Map.of("/xml", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/xml");
        assertNotNull(extensions);
        assertTrue(extensions.contains("xml"));
    }

    @Test
    void getExtensionTypesReturnsJsTypes() throws Exception {
        String json = "{\"description\": \"Output:JS\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/js", postNode);
        setApiDocumentation(Map.of("/js", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/js");
        assertNotNull(extensions);
        assertTrue(extensions.contains("js"));
        assertTrue(extensions.contains("jsx"));
    }

    @Test
    void getExtensionTypesWithInputMode() throws Exception {
        String json = "{\"description\": \"Input:PDF\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/test-input", postNode);
        setApiDocumentation(Map.of("/test-input", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(false, "/test-input");
        assertEquals(List.of("pdf"), extensions);
    }

    @Test
    void getExtensionTypesReturnsNullWhenNoTypeMatch() throws Exception {
        String json = "{\"description\": \"No type here\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/notype", postNode);
        setApiDocumentation(Map.of("/notype", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/notype");
        assertNull(extensions);
    }

    @Test
    void getExtensionTypesReturnsNullForUnknownOutputType() throws Exception {
        String json = "{\"description\": \"Output:UNKNOWNTYPE\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/unk", postNode);
        setApiDocumentation(Map.of("/unk", endpoint));
        setApiDocsJsonRootNode();
        List<String> extensions = apiDocService.getExtensionTypes(true, "/unk");
        assertNull(extensions);
    }

    @Test
    void isValidOperationChecksRequiredParameters() throws Exception {
        String json =
                "{\"description\": \"desc\", \"parameters\": [{\"name\":\"param1\", \"required\": true}, {\"name\":\"param2\", \"required\": true}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/op", postNode);
        setApiDocumentation(Map.of("/op", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isValidOperation("/op", Map.of("param1", "a", "param2", "b")));
        assertFalse(apiDocService.isValidOperation("/op", Map.of("param1", "a")));
        assertFalse(apiDocService.isValidOperation("/op", Map.of("param2", "b")));
    }

    @Test
    void isValidOperationAllowsOptionalParameters() throws Exception {
        String json =
                "{\"description\": \"desc\", \"parameters\": [{\"name\":\"param1\", \"required\": false}, {\"name\":\"param2\", \"required\": false}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/op", postNode);
        setApiDocumentation(Map.of("/op", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isValidOperation("/op", Map.of("param1", "a", "param2", "b")));
        assertTrue(apiDocService.isValidOperation("/op", Map.of("param1", "a")));
        assertTrue(apiDocService.isValidOperation("/op", Map.of()));
    }

    @Test
    void isValidOperationHandlesUnknownOperation() throws Exception {
        setApiDocumentation(Map.of());
        assertFalse(apiDocService.isValidOperation("/unknown", Map.of("param1", "a")));
    }

    @Test
    void isValidOperationWithEmptyParameters() throws Exception {
        String json = "{\"description\": \"desc\", \"parameters\": []}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/empty", postNode);
        setApiDocumentation(Map.of("/empty", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isValidOperation("/empty", Map.of()));
        assertTrue(apiDocService.isValidOperation("/empty", Map.of("extra", "value")));
    }

    @Test
    void isValidOperationWithMixedRequiredAndOptional() throws Exception {
        String json =
                "{\"description\": \"desc\", \"parameters\": [{\"name\":\"required1\", \"required\": true}, {\"name\":\"optional1\", \"required\": false}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/mixed", postNode);
        setApiDocumentation(Map.of("/mixed", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(
                apiDocService.isValidOperation(
                        "/mixed", Map.of("required1", "a", "optional1", "b")));
        assertTrue(apiDocService.isValidOperation("/mixed", Map.of("required1", "a")));
        assertFalse(apiDocService.isValidOperation("/mixed", Map.of("optional1", "b")));
        assertFalse(apiDocService.isValidOperation("/mixed", Map.of()));
    }

    @Test
    void isMultiInputDetectsTypeMI() throws Exception {
        String json = "{\"description\": \"Type:MI\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/multi", postNode);
        setApiDocumentation(Map.of("/multi", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isMultiInput("/multi"));
    }

    @Test
    void isMultiInputDetectsUnknownOperation() throws Exception {
        setApiDocumentation(Map.of());
        assertFalse(apiDocService.isMultiInput("/unknown"));
    }

    @Test
    void isMultiInputHandlesNoDescription() throws Exception {
        String json = "{\"parameters\": [{\"name\":\"param1\"}, {\"name\":\"param2\"}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/multi", postNode);
        setApiDocumentation(Map.of("/multi", endpoint));
        setApiDocsJsonRootNode();
        assertFalse(apiDocService.isMultiInput("/multi"));
    }

    @Test
    void isMultiInputReturnsFalseForNonMIType() throws Exception {
        String json = "{\"description\": \"Type:SI\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/single", postNode);
        setApiDocumentation(Map.of("/single", endpoint));
        setApiDocsJsonRootNode();
        assertFalse(apiDocService.isMultiInput("/single"));
    }

    @Test
    void isMultiInputReturnsTrueForMISO() throws Exception {
        String json = "{\"description\": \"Type:MISO\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/miso", postNode);
        setApiDocumentation(Map.of("/miso", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isMultiInput("/miso"));
    }

    @Test
    void isZipOutputDetectsMultiOutputType() throws Exception {
        String json = "{\"description\": \"Output:PDF Type:SIMO\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/split", postNode);
        setApiDocumentation(Map.of("/split", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isZipOutput("/split"));
    }

    @Test
    void isZipOutputDetectsMimoType() throws Exception {
        String json = "{\"description\": \"Output:PDF Type:MIMO\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/overlay", postNode);
        setApiDocumentation(Map.of("/overlay", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isZipOutput("/overlay"));
    }

    @Test
    void isZipOutputDetectsZipOutputDeclaration() throws Exception {
        String json = "{\"description\": \"Output:ZIP-PDF Type:SISO\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/split-by-sections", postNode);
        setApiDocumentation(Map.of("/split-by-sections", endpoint));
        setApiDocsJsonRootNode();
        assertTrue(apiDocService.isZipOutput("/split-by-sections"));
    }

    @Test
    void isZipOutputReturnsFalseForSisoPdf() throws Exception {
        String json = "{\"description\": \"Input:PDF Output:PDF Type:SISO\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/rotate", postNode);
        setApiDocumentation(Map.of("/rotate", endpoint));
        setApiDocsJsonRootNode();
        assertFalse(apiDocService.isZipOutput("/rotate"));
    }

    @Test
    void isZipOutputReturnsFalseForUnknownOperation() throws Exception {
        setApiDocumentation(Map.of());
        assertFalse(apiDocService.isZipOutput("/unknown"));
    }

    /**
     * Coverage test: every Stirling endpoint that returns a ZIP response (via {@code
     * WebResponseUtils.zipFileToWebResponse} or equivalent) must be classified as {@code
     * isZipOutput = true} by {@link ApiDocService}. The descriptions below are the real
     * {@code @Operation(description=...)} strings from each controller, so if a controller is
     * renamed, tweaked or introduced without a {@code Type:} / {@code Output:ZIP} tag, this test
     * breaks — surfacing the bug before {@code AiWorkflowService} silently registers a ZIP as a
     * single PDF.
     *
     * <p>Add a new row here whenever a new ZIP-returning endpoint is introduced. Descriptions can
     * be trimmed to the part containing the relevant tags.
     */
    @ParameterizedTest(name = "{0} → isZipOutput")
    @CsvSource(
            textBlock =
                    """
                    /api/v1/general/split-pages,              'Split pages. Input:PDF Output:PDF Type:SIMO'
                    /api/v1/general/split-pdf-by-sections,    'Split. Input:PDF Output:ZIP-PDF Type:SISO'
                    /api/v1/general/split-by-size-or-count,   'Split by size. Input:PDF Output:ZIP-PDF Type:SISO'
                    /api/v1/general/split-pdf-by-chapters,    'Split by chapters. Input:PDF Output:ZIP-PDF Type:SISO'
                    /api/v1/general/split-for-poster-print,   'Poster split. Input: PDF Output: ZIP-PDF Type: SISO'
                    /api/v1/general/overlay-pdfs,             'Overlay PDFs. Input:PDF Output:PDF Type:MIMO'
                    /api/v1/misc/auto-split-pdf,              'Auto split. Input:PDF Output:ZIP-PDF Type:SISO'
                    /api/v1/misc/extract-images,              'Extract images. Output:IMAGE/ZIP Type:SIMO'
                    /api/v1/misc/extract-image-scans,         'Extract image scans. Input:PDF Output:IMAGE/ZIP Type:SIMO'
                    /api/v1/security/get-attachments,         'Extract attachments. Input:PDF Output:ZIP Type:SISO'
                    """)
    void isZipOutputClassifiesKnownZipEndpoints(String endpoint, String description)
            throws Exception {
        String json = mapper.writeValueAsString(Map.of("description", description));
        JsonNode postNode = mapper.readTree(json);
        setApiDocumentation(Map.of(endpoint, new ApiEndpoint(endpoint, postNode)));
        setApiDocsJsonRootNode();
        assertTrue(
                apiDocService.isZipOutput(endpoint),
                () ->
                        "Expected isZipOutput=true for "
                                + endpoint
                                + " with description: "
                                + description);
    }

    /**
     * Inverse coverage: a sample of PDF-returning endpoints must not be classified as ZIP. Catches
     * regressions where a change to the classifier accidentally widens the positive match.
     */
    @ParameterizedTest(name = "{0} → !isZipOutput")
    @CsvSource(
            textBlock =
                    """
                    /api/v1/general/rotate-pdf,    'Rotate. Input:PDF Output:PDF Type:SISO'
                    /api/v1/general/merge-pdfs,    'Merge. Input:PDF Output:PDF Type:MISO'
                    /api/v1/misc/compress-pdf,     'Compress. Input:PDF Output:PDF Type:SISO'
                    /api/v1/misc/flatten,          'Flatten forms. Input:PDF Output:PDF Type:SISO'
                    """)
    void isZipOutputRejectsNonZipEndpoints(String endpoint, String description) throws Exception {
        String json = mapper.writeValueAsString(Map.of("description", description));
        JsonNode postNode = mapper.readTree(json);
        setApiDocumentation(Map.of(endpoint, new ApiEndpoint(endpoint, postNode)));
        setApiDocsJsonRootNode();
        assertFalse(
                apiDocService.isZipOutput(endpoint),
                () ->
                        "Expected isZipOutput=false for "
                                + endpoint
                                + " with description: "
                                + description);
    }

    @Test
    void constructorAcceptsNullUserService() {
        ApiDocService service = new ApiDocService(mapper, servletContext, null);
        assertNotNull(service);
    }

    @Test
    void getExtensionTypesInitializesMapOnFirstCall() throws Exception {
        String json = "{\"description\": \"Output:PDF\"}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/test", postNode);
        setApiDocumentation(Map.of("/test", endpoint));
        setApiDocsJsonRootNode();
        List<String> first = apiDocService.getExtensionTypes(true, "/test");
        List<String> second = apiDocService.getExtensionTypes(true, "/test");
        assertEquals(first, second);
    }
}
