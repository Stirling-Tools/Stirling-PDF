package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.ServletContext;

import stirling.software.SPDF.model.ApiEndpoint;
import stirling.software.common.service.UserServiceInterface;

@ExtendWith(MockitoExtension.class)
class ApiDocServiceTest {

    @Mock ServletContext servletContext;
    @Mock UserServiceInterface userService;

    ApiDocService apiDocService;
    ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        apiDocService = new ApiDocService(servletContext, userService);
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
    void isValidOperationChecksRequiredParameters() throws Exception {
        String json =
                "{\"description\": \"desc\", \"parameters\": [{\"name\":\"param1\"}, {\"name\":\"param2\"}]}";
        JsonNode postNode = mapper.readTree(json);
        ApiEndpoint endpoint = new ApiEndpoint("/op", postNode);

        setApiDocumentation(Map.of("/op", endpoint));
        setApiDocsJsonRootNode();

        assertTrue(apiDocService.isValidOperation("/op", Map.of("param1", "a", "param2", "b")));
        assertFalse(apiDocService.isValidOperation("/op", Map.of("param1", "a")));
    }

    @Test
    void isValidOperationHandlesUnknownOperation() throws Exception {
        setApiDocumentation(Map.of());

        assertFalse(apiDocService.isValidOperation("/unknown", Map.of("param1", "a")));
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
}
